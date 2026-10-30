import type { ConnectorEnv } from '@keystone/core';

// The admin API of alphapremiergroup.com (apg-website, api/admin/*.php). It has no API
// token: Keystone signs in as an ordinary admin account and keeps the PHPSESSID cookie,
// exactly as the admin portal does. Two server rules shape every call:
// - non-GET requests must carry an Origin of the site (requireSameOrigin, config.php);
// - requests with an empty or curl-like User-Agent are blocked by .htaccess (the
//   desktop HTTP client always sends "Keystone/…").

export interface Inquiry {
  id: number;
  kind: 'inquiry' | 'listing' | 'newsletter' | 'feedback' | 'application_question' | 'payment';
  enterprise_slug: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  excerpt: string;
  meta: { ticket?: string; amount?: string; payment_method?: string; reference_no?: string; service?: string; listing_title?: string; property?: string; company?: string } | null;
  status: 'new' | 'read' | 'replied' | 'archived';
  created_at: string;
}

export interface Applicant {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  job_title: string;
  enterprise_slug: string;
  status: string;
  photo_path: string | null;
  submitted_at: string;
}

export function siteBase(url: string): string {
  const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  return u.origin;
}

export class WebsiteError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/** Signs in once and re-signs when the session lapses. */
export class WebsiteApi {
  private signedIn: { name: string; role: string } | null = null;

  constructor(private env: ConnectorEnv) {}

  get base() {
    return siteBase(this.env.settings.baseUrl || 'https://alphapremiergroup.com');
  }

  private async raw(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}) {
    const method = init.method ?? 'GET';
    return this.env.http.request(`${this.base}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { Origin: this.base, 'Content-Type': 'application/json' } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: 12000,
    });
  }

  async signIn(): Promise<{ name: string; role: string }> {
    const check = await this.raw('/api/admin/auth.php?action=check');
    if (check.ok) {
      const c = await check.json<{ authenticated: boolean; user: { name: string; role: string } | null }>();
      if (c.authenticated && c.user) return (this.signedIn = c.user);
    }
    const email = this.env.settings.email?.trim();
    const password = await this.env.secret('password');
    if (!email || !password) throw new WebsiteError('Enter the admin email and password for the website.');
    const r = await this.raw('/api/admin/auth.php', { method: 'POST', body: { email, password } });
    if (r.status === 401) throw new WebsiteError('The website refused that email and password.', 401);
    if (r.status === 429) throw new WebsiteError('Too many sign-in attempts from this office. Wait 15 minutes, then try again.', 429);
    if (r.status === 403) throw new WebsiteError('The website blocked the request (origin or user agent).', 403);
    if (!r.ok) throw new WebsiteError(`The website answered ${r.status} to the sign-in.`, r.status);
    const body = await r.json<{ user: { name: string; role: string } }>();
    return (this.signedIn = body.user);
  }

  async get<T>(path: string): Promise<T> {
    if (!this.signedIn) await this.signIn();
    let r = await this.raw(path);
    if (r.status === 401) {
      this.signedIn = null;
      await this.signIn();
      r = await this.raw(path);
    }
    if (r.status === 403) throw new WebsiteError('This website account is not allowed to see that. Use an admin account.', 403);
    if (!r.ok) throw new WebsiteError(`The website answered ${r.status}.`, r.status);
    return r.json<T>();
  }

  async bytes(path: string): Promise<Uint8Array | null> {
    if (!this.signedIn) await this.signIn();
    const r = await this.raw(path);
    return r.ok ? r.bytes() : null;
  }

  summary() {
    return this.get<{ summary: { unread: number; by_kind: Record<string, number> } }>('/api/admin/inquiries.php?action=summary').then((r) => r.summary);
  }

  payments(limit = 50) {
    return this.get<{ data: Inquiry[] }>(`/api/admin/inquiries.php?kind=payment&hide=archived&limit=${limit}`).then((r) => r.data);
  }

  inquiries(limit = 50) {
    return this.get<{ data: Inquiry[] }>(`/api/admin/inquiries.php?exclude=newsletter&hide=archived&limit=${limit}`).then((r) => r.data.filter((i) => i.kind !== 'payment'));
  }

  hired() {
    return this.get<{ data: Applicant[] }>('/api/admin/applicants.php?status=hired&limit=200').then((r) => r.data);
  }

  applicantsSummary() {
    return this.get<{ summary: { total: number; new: number; interviewing: number; hired: number } }>('/api/admin/applicants.php?action=summary').then((r) => r.summary);
  }

  photo(applicantId: number) {
    return this.bytes(`/api/admin/applicants.php?action=photo&id=${applicantId}`);
  }

  /** Marks an inquiry read, replied or archived on the website. */
  async setStatus(id: number, status: Inquiry['status']) {
    if (!this.signedIn) await this.signIn();
    const r = await this.raw('/api/admin/inquiries.php', { method: 'PUT', body: { id, status } });
    if (!r.ok) throw new WebsiteError(`The website answered ${r.status}.`, r.status);
  }
}

let sessions = new WeakMap<ConnectorEnv['http'], WebsiteApi>();

/** One signed-in session per app run (the cookie lives in the HTTP client's jar). */
export function websiteApi(env: ConnectorEnv): WebsiteApi {
  const fresh = new WebsiteApi(env);
  const cached = sessions.get(env.http);
  if (cached && cached.base === fresh.base) return cached;
  sessions.set(env.http, fresh);
  return fresh;
}

export const resetWebsiteSession = () => { sessions = new WeakMap(); };

/** "₱4,999.00" or "4999" from the payment form -> pesos. */
export function paymentAmount(i: Inquiry): number | null {
  const n = Number(String(i.meta?.amount ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** JPEG and PNG magic numbers, for photos the website streams back. */
export function imageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  return null;
}
