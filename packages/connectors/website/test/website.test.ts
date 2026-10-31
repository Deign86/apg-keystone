import { beforeEach, describe, expect, it } from 'vitest';
import type { ConnectorEnv, HttpClient, HttpResponse, JsonValue, OpenStatement, SystemBridge } from '@keystone/core';
import { websiteConnector } from '../src';
import { imageType, paymentAmount, resetWebsiteSession, siteBase, websiteApi, type Inquiry } from '../src/api';
import { candidates } from '../src/WebsiteInbox';

const system: SystemBridge = {
  platform: 'macos', locateApp: async () => null, launchApp: async () => {}, openUrl: async () => {},
  pickFiles: async () => [], readFile: async () => new Uint8Array(), listFiles: async () => [], appDataFolder: async () => null,
};

function response(status: number, body: JsonValue | Uint8Array): HttpResponse {
  return {
    status, ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
    // SAFETY: a fake server. Each test hands it the body the code under test expects as T.
    json: async <T,>() => body as T,
    bytes: async () => (body instanceof Uint8Array ? body : new Uint8Array()),
  };
}

type Call = { url: string; method: string; headers: Record<string, string> };

/** The admin API of apg-website as Keystone sees it: a session cookie, admin accounts, Origin on writes. */
function fakeSite(opts: { password?: string; expireAfter?: number } = {}) {
  const calls: Call[] = [];
  let signedIn = false;
  let reads = 0;

  const http: HttpClient = {
    native: true,
    async request(url, init = {}) {
      const method = init.method ?? 'GET';
      calls.push({ url, method, headers: init.headers ?? {} });
      const path = url.replace('https://alphapremiergroup.com', '');

      if (path === '/api/admin/auth.php?action=check') return response(200, { authenticated: signedIn, user: signedIn ? { name: 'Keystone', role: 'admin' } : null });

      if (path === '/api/admin/auth.php' && method === 'POST') {
        const body = JSON.parse(String(init.body));

        if (body.password !== (opts.password ?? 'secret')) return response(401, { error: 'Invalid credentials' });
        signedIn = true;

        return response(200, { user: { name: 'Keystone', role: 'admin' } });
      }

      if (!signedIn) return response(401, { error: 'Not signed in' });

      if (opts.expireAfter !== undefined && ++reads > opts.expireAfter) {
        signedIn = false;
        opts.expireAfter = undefined;

        return response(401, {});
      }

      if (path.startsWith('/api/admin/applicants.php?status=hired')) {
        return response(200, { data: [
          { id: 7, full_name: 'Carlo Reyes', email: 'carlo.reyes@gmail.com', phone: '0917', job_title: 'Leasing Officer', enterprise_slug: 'apg', status: 'hired', photo_path: 'x.jpg', submitted_at: '' },
          { id: 8, full_name: 'Dina Cruz', email: 'dina.cruz@yahoo.com', phone: '0918', job_title: 'Accountant', enterprise_slug: 'apg', status: 'hired', photo_path: null, submitted_at: '' },
        ] });
      }

      if (path === '/api/admin/applicants.php?action=photo&id=7') return response(200, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));

      if (path.startsWith('/api/admin/inquiries.php?kind=payment')) return response(200, { data: [] });

      return response(404, {});
    },
  };

  const env = (settings: Record<string, string> = { email: 'keystone@alphapremiergroup.com' }): ConnectorEnv => ({
    settings, http, system, now: () => new Date(), secret: async (k) => (k === 'password' ? 'secret' : null),
  });

  return { http, env, calls };
}

beforeEach(() => resetWebsiteSession());

describe('reading what the website sends', () => {
  const blank: Inquiry = {
    id: 1, kind: 'payment', enterprise_slug: '', name: '', email: '', phone: '', subject: '', excerpt: '', meta: null,
    status: 'new', created_at: '2026-10-30 09:00:00',
  };

  it('reads what the Pay page sends', () => {
    expect(paymentAmount({ ...blank, meta: { amount: '₱4,999.00' } })).toBe(4999);
    expect(paymentAmount({ ...blank, meta: { amount: '0' } })).toBeNull();
    expect(paymentAmount(blank)).toBeNull();
    expect(siteBase('alphapremiergroup.com/')).toBe('https://alphapremiergroup.com');
    expect(siteBase('https://alphapremiergroup.com/admin')).toBe('https://alphapremiergroup.com');
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBe('image/png');
    expect(imageType(new Uint8Array([0x52, 0x49]))).toBeNull();
  });

  it('puts the statement with the same amount first, then a name match', () => {
    const open: OpenStatement[] = [
      { no: 'BS-2026-001', client: 'Northwind Holdings', due: '2026-11-01', amount: 100000 },
      { no: 'BS-2026-002', client: 'Lopez Realty Corp.', due: '2026-11-05', amount: 250000 },
      { no: 'BS-2026-003', client: 'Harbor View Inc.', due: '2026-11-09', amount: 499900 },
    ];

    const paid: Inquiry = { ...blank, name: 'Ana Lopez', meta: { amount: '4,999.00', company: '' } };
    expect(candidates(open, paid).map((b) => b.no)).toEqual(['BS-2026-003', 'BS-2026-002', 'BS-2026-001']);
    expect(open[0].no).toBe('BS-2026-001'); // the input is left in order
  });
});

describe('website connector', () => {
  it('says what it needs before it can connect', async () => {
    const site = fakeSite();
    expect((await websiteConnector.health({ ...site.env(), http: { ...site.http, native: false } })).state).toBe('unsupported');
    expect((await websiteConnector.health(site.env({}))).state).toBe('setup');
  });

  it('signs in with the admin account and says as whom', async () => {
    const site = fakeSite();
    expect(await websiteConnector.health(site.env())).toEqual({ state: 'ready', detail: 'Signed in to alphapremiergroup.com as Keystone (admin).' });
  });

  it('reports a refused password as an error to fix, not as the site being down', async () => {
    const site = fakeSite({ password: 'other' });
    expect(await websiteConnector.health(site.env())).toEqual({ state: 'error', detail: 'The website refused that email and password.' });
  });

  it('sends the site’s own Origin on every write, as its same-origin rule requires', async () => {
    const site = fakeSite();
    await websiteApi(site.env()).signIn();
    const writes = site.calls.filter((c) => c.method !== 'GET');
    expect(writes.length).toBeGreaterThan(0);

    for (const w of writes) expect(w.headers.Origin).toBe('https://alphapremiergroup.com');

    for (const r of site.calls.filter((c) => c.method === 'GET')) expect(r.headers.Origin).toBeUndefined();
  });

  it('signs in again once when the session lapses', async () => {
    const site = fakeSite({ expireAfter: 0 });
    expect(await websiteApi(site.env()).payments()).toEqual([]);
    expect(site.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('brings in hired applicants with the photos the careers form collected', async () => {
    const site = fakeSite();
    const got = await websiteConnector.people!.fetch(site.env());
    expect(got.people).toEqual([
      { externalId: 'applicant-7', name: 'Carlo Reyes', position: 'Leasing Officer', email: 'carlo.reyes@gmail.com', phone: '0917' },
      { externalId: 'applicant-8', name: 'Dina Cruz', position: 'Accountant', email: 'dina.cruz@yahoo.com', phone: '0918' },
    ]);
    expect(got.photos.map((p) => [p.externalId, p.type])).toEqual([['applicant-7', 'image/jpeg']]);
    expect(got.source).toBe('2 hired applicants on the website');
  });
});
