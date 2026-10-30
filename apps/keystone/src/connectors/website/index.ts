import type { Connector, ExternalPhoto } from '@keystone/core';
import type { ConnectorPlugin } from '../../app/registry';
import { imageType, resetWebsiteSession, websiteApi, WebsiteError } from './api';
import { WebsiteInbox } from './WebsiteInbox';

// The APG website and its admin portal (apg-website). Keystone brings in hired applicants
// as employees (with the 2x2 photo the careers form collects), shows unread inquiries,
// and matches payments clients report on the website's Pay page to billing statements.

export const websiteConnector: Connector = {
  id: 'website',
  name: 'APG Website',
  about: 'alphapremiergroup.com and its admin portal: inquiries, payments reported online, job applicants.',
  platforms: ['macos', 'windows', 'linux'],
  refreshSeconds: 300,
  settings: [
    { key: 'baseUrl', label: 'Website', kind: 'url', default: 'https://alphapremiergroup.com', help: 'Use the main address exactly; www and http redirects drop the sign-in.' },
    { key: 'email', label: 'Admin email', kind: 'text', placeholder: 'keystone@alphapremiergroup.com', help: 'A website admin account with the admin role. A dedicated account for Keystone is best.' },
    { key: 'password', label: 'Password', kind: 'secret', help: 'Kept in this computer’s keychain, never in Keystone’s files.' },
  ],

  async health(env) {
    if (!env.http.native) return { state: 'unsupported', detail: 'Open Keystone’s desktop app to reach the website; browsers block it.' };
    if (!env.settings.email) return { state: 'setup', detail: 'Enter a website admin account to bring in inquiries, payments and new hires.' };
    resetWebsiteSession();
    try {
      const user = await websiteApi(env).signIn();
      return { state: 'ready', detail: `Signed in to ${websiteApi(env).base.replace('https://', '')} as ${user.name} (${user.role}).` };
    } catch (e) {
      if (e instanceof WebsiteError && e.status === 0) return { state: 'setup', detail: e.message };
      if (e instanceof WebsiteError) return { state: 'error', detail: e.message };
      return { state: 'offline', detail: 'The website did not answer. Check the internet connection.' };
    }
  },

  async figures(env) {
    const api = websiteApi(env);
    const [inq, apps] = await Promise.all([api.summary().catch(() => null), api.applicantsSummary().catch(() => null)]);
    const out = [];
    if (inq) {
      out.push({ label: 'Unread inquiries', value: String(inq.unread), caption: `${inq.by_kind.listing ?? 0} about listings` });
      out.push({ label: 'Payments reported', value: String(inq.by_kind.payment ?? 0), caption: 'From the website’s Pay page' });
    }
    if (apps) out.push({ label: 'Applicants', value: String(apps.new), caption: `new · ${apps.hired} hired` });
    return out;
  },

  people: {
    label: 'Import new hires from the website',
    async fetch(env) {
      const api = websiteApi(env);
      const hired = await api.hired();
      const photos: ExternalPhoto[] = [];
      for (const a of hired.filter((x) => x.photo_path)) {
        const bytes = await api.photo(a.id).catch(() => null);
        const type = bytes && imageType(bytes);
        if (bytes && type) photos.push({ externalId: `applicant-${a.id}`, bytes, type });
      }
      return {
        people: hired.map((a) => ({ externalId: `applicant-${a.id}`, name: a.full_name, position: a.job_title, email: a.email, phone: a.phone })),
        photos,
        source: `${hired.length} hired applicant${hired.length === 1 ? '' : 's'} on the website`,
      };
    },
  },

  actions: [
    {
      id: 'portal',
      label: 'Open admin portal',
      async run(env) {
        await env.system.openUrl(`${websiteApi(env).base}/admin`);
        return 'Opened the website’s admin portal.';
      },
    },
  ],
};

export const websitePlugin: ConnectorPlugin = {
  connector: websiteConnector,
  modules: [
    {
      id: 'website',
      title: 'Website',
      section: 'Connected · alphapremiergroup.com',
      blurb: 'Payments clients report online, matched to statements, and the latest inquiries.',
      order: 7,
      Screen: WebsiteInbox,
    },
  ],
};
