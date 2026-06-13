import type { VercelRequest, VercelResponse } from '@vercel/node';

import * as adminRefundsIdProcess from './handlers/admin/refunds/[id]/process';
import * as adminMessageCopyRequestsIdProcess from './handlers/admin/message-copy-requests/[id]/process';
import * as adminMessageCopyRequestsIdTemplates from './handlers/admin/message-copy-requests/[id]/templates';
import * as adminUsersUserIdAgency from './handlers/admin/users/[userId]/agency';
import * as adminUsersUserIdBalance from './handlers/admin/users/[userId]/balance';
import * as adminUsersUserIdCredits from './handlers/admin/users/[userId]/credits';
import * as adminUsersUserIdImpersonate from './handlers/admin/users/[userId]/impersonate';
import * as adminUsersUserIdMaster from './handlers/admin/users/[userId]/master';
import * as adminUsersUserIdResetPassword from './handlers/admin/users/[userId]/reset-password';
import * as adminAnnouncementsId from './handlers/admin/announcements/[id]';
import * as adminReportsAnalytics from './handlers/admin/reports/analytics';
import * as adminReportsSettlements from './handlers/admin/reports/settlements';
import * as atsMetaMetaType from './handlers/ats/meta/[metaType]';
import * as bizchatCallbackState from './handlers/bizchat/callback/state';
import * as bizchatReportsArea from './handlers/bizchat/reports/area';
import * as bizchatReportsGenderAge from './handlers/bizchat/reports/gender-age';
import * as bizchatReportsPeriod from './handlers/bizchat/reports/period';
import * as campaignsIdCancel from './handlers/campaigns/[id]/cancel';
import * as campaignsIdFail from './handlers/campaigns/[id]/fail';
import * as campaignsIdStart from './handlers/campaigns/[id]/start';
import * as campaignsIdStop from './handlers/campaigns/[id]/stop';
import * as campaignsIdSubmit from './handlers/campaigns/[id]/submit';
import * as internalMasterResetBalance from './handlers/internal/master/reset-balance';
import * as templatesIdApprove from './handlers/templates/[id]/approve';
import * as templatesIdReject from './handlers/templates/[id]/reject';
import * as templatesIdSubmit from './handlers/templates/[id]/submit';
import * as adminAgencies from './handlers/admin/agencies/index';
import * as adminAnnouncements from './handlers/admin/announcements/index';
import * as adminCampaigns from './handlers/admin/campaigns';
import * as adminLogin from './handlers/admin/login';
import * as adminLogs from './handlers/admin/logs';
import * as adminMe from './handlers/admin/me';
import * as adminMessageCopyRequests from './handlers/admin/message-copy-requests/index';
import * as adminRefunds from './handlers/admin/refunds/index';
import * as adminStats from './handlers/admin/stats';
import * as adminTaxInvoices from './handlers/admin/tax-invoices';
import * as adminTransactions from './handlers/admin/transactions';
import * as adminUsers from './handlers/admin/users/index';
import * as agenciesList from './handlers/agencies/list';
import * as agencyLogin from './handlers/agency/login';
import * as agencyStats from './handlers/agency/stats';
import * as authUser from './handlers/auth/user';
import * as bizchatAi from './handlers/bizchat/ai';
import * as bizchatAts from './handlers/bizchat/ats';
import * as bizchatCampaigns from './handlers/bizchat/campaigns';
import * as bizchatFile from './handlers/bizchat/file';
import * as bizchatMdnUpload from './handlers/bizchat/mdn-upload';
import * as bizchatSender from './handlers/bizchat/sender';
import * as bizchatStats from './handlers/bizchat/stats';
import * as bizchatTemplate from './handlers/bizchat/template';
import * as bizchatTest from './handlers/bizchat/test';
import * as campaignsId from './handlers/campaigns/[id]';
import * as campaignsTestCreate from './handlers/campaigns/test-create';
import * as creditsEstimate from './handlers/credits/estimate';
import * as creditsPolicy from './handlers/credits/policy';
import * as creditsSummary from './handlers/credits/summary';
import * as dashboardStats from './handlers/dashboard/stats';
import * as kispgAuth from './handlers/kispg/auth';
import * as kispgCallback from './handlers/kispg/callback';
import * as mapticsGeofences from './handlers/maptics/geofences';
import * as mapticsPoi from './handlers/maptics/poi';
import * as messageCopyRequests from './handlers/message-copy-requests/index';
import * as profilePassword from './handlers/profile/password';
import * as recommendedTemplatesId from './handlers/recommended-templates/[id]';
import * as recommendedTemplatesFilters from './handlers/recommended-templates/filters';
import * as stripeCheckout from './handlers/stripe/checkout';
import * as stripeConfig from './handlers/stripe/config';
import * as stripeWebhook from './handlers/stripe/webhook';
import * as targetingEstimate from './handlers/targeting/estimate';
import * as templatesId from './handlers/templates/[id]';
import * as templatesApproved from './handlers/templates/approved';
import * as transactionsCharge from './handlers/transactions/charge';
import * as announcements from './handlers/announcements/index';
import * as campaigns from './handlers/campaigns/index';
import * as profile from './handlers/profile/index';
import * as recommendedTemplates from './handlers/recommended-templates/index';
import * as refunds from './handlers/refunds/index';
import * as taxInvoices from './handlers/tax-invoices/index';
import * as templates from './handlers/templates/index';
import * as transactions from './handlers/transactions/index';

type RouteEntry = { segments: string[]; handler: any };

const routes: RouteEntry[] = [
  { segments: ['admin', 'refunds', ':id', 'process'], handler: adminRefundsIdProcess },
  { segments: ['admin', 'message-copy-requests', ':id', 'process'], handler: adminMessageCopyRequestsIdProcess },
  { segments: ['admin', 'message-copy-requests', ':id', 'templates'], handler: adminMessageCopyRequestsIdTemplates },
  { segments: ['admin', 'users', ':userId', 'agency'], handler: adminUsersUserIdAgency },
  { segments: ['admin', 'users', ':userId', 'balance'], handler: adminUsersUserIdBalance },
  { segments: ['admin', 'users', ':userId', 'credits'], handler: adminUsersUserIdCredits },
  { segments: ['admin', 'users', ':userId', 'impersonate'], handler: adminUsersUserIdImpersonate },
  { segments: ['admin', 'users', ':userId', 'master'], handler: adminUsersUserIdMaster },
  { segments: ['admin', 'users', ':userId', 'reset-password'], handler: adminUsersUserIdResetPassword },
  { segments: ['admin', 'announcements', ':id'], handler: adminAnnouncementsId },
  { segments: ['admin', 'reports', 'analytics'], handler: adminReportsAnalytics },
  { segments: ['admin', 'reports', 'settlements'], handler: adminReportsSettlements },
  { segments: ['ats', 'meta', ':metaType'], handler: atsMetaMetaType },
  { segments: ['bizchat', 'callback', 'state'], handler: bizchatCallbackState },
  { segments: ['bizchat', 'reports', 'area'], handler: bizchatReportsArea },
  { segments: ['bizchat', 'reports', 'gender-age'], handler: bizchatReportsGenderAge },
  { segments: ['bizchat', 'reports', 'period'], handler: bizchatReportsPeriod },
  { segments: ['campaigns', ':id', 'cancel'], handler: campaignsIdCancel },
  { segments: ['campaigns', ':id', 'fail'], handler: campaignsIdFail },
  { segments: ['campaigns', ':id', 'start'], handler: campaignsIdStart },
  { segments: ['campaigns', ':id', 'stop'], handler: campaignsIdStop },
  { segments: ['campaigns', ':id', 'submit'], handler: campaignsIdSubmit },
  { segments: ['internal', 'master', 'reset-balance'], handler: internalMasterResetBalance },
  { segments: ['templates', ':id', 'approve'], handler: templatesIdApprove },
  { segments: ['templates', ':id', 'reject'], handler: templatesIdReject },
  { segments: ['templates', ':id', 'submit'], handler: templatesIdSubmit },
  { segments: ['admin', 'agencies'], handler: adminAgencies },
  { segments: ['admin', 'announcements'], handler: adminAnnouncements },
  { segments: ['admin', 'campaigns'], handler: adminCampaigns },
  { segments: ['admin', 'login'], handler: adminLogin },
  { segments: ['admin', 'logs'], handler: adminLogs },
  { segments: ['admin', 'me'], handler: adminMe },
  { segments: ['admin', 'message-copy-requests'], handler: adminMessageCopyRequests },
  { segments: ['admin', 'refunds'], handler: adminRefunds },
  { segments: ['admin', 'stats'], handler: adminStats },
  { segments: ['admin', 'tax-invoices'], handler: adminTaxInvoices },
  { segments: ['admin', 'transactions'], handler: adminTransactions },
  { segments: ['admin', 'users'], handler: adminUsers },
  { segments: ['agencies', 'list'], handler: agenciesList },
  { segments: ['agency', 'login'], handler: agencyLogin },
  { segments: ['agency', 'stats'], handler: agencyStats },
  { segments: ['auth', 'user'], handler: authUser },
  { segments: ['bizchat', 'ai'], handler: bizchatAi },
  { segments: ['bizchat', 'ats'], handler: bizchatAts },
  { segments: ['bizchat', 'campaigns'], handler: bizchatCampaigns },
  { segments: ['bizchat', 'file'], handler: bizchatFile },
  { segments: ['bizchat', 'mdn-upload'], handler: bizchatMdnUpload },
  { segments: ['bizchat', 'sender'], handler: bizchatSender },
  { segments: ['bizchat', 'stats'], handler: bizchatStats },
  { segments: ['bizchat', 'template'], handler: bizchatTemplate },
  { segments: ['bizchat', 'test'], handler: bizchatTest },
  { segments: ['campaigns', ':id'], handler: campaignsId },
  { segments: ['campaigns', 'test-create'], handler: campaignsTestCreate },
  { segments: ['credits', 'estimate'], handler: creditsEstimate },
  { segments: ['credits', 'policy'], handler: creditsPolicy },
  { segments: ['credits', 'summary'], handler: creditsSummary },
  { segments: ['dashboard', 'stats'], handler: dashboardStats },
  { segments: ['kispg', 'auth'], handler: kispgAuth },
  { segments: ['kispg', 'callback'], handler: kispgCallback },
  { segments: ['maptics', 'geofences'], handler: mapticsGeofences },
  { segments: ['maptics', 'poi'], handler: mapticsPoi },
  { segments: ['message-copy-requests'], handler: messageCopyRequests },
  { segments: ['profile', 'password'], handler: profilePassword },
  { segments: ['recommended-templates', ':id'], handler: recommendedTemplatesId },
  { segments: ['recommended-templates', 'filters'], handler: recommendedTemplatesFilters },
  { segments: ['stripe', 'checkout'], handler: stripeCheckout },
  { segments: ['stripe', 'config'], handler: stripeConfig },
  { segments: ['stripe', 'webhook'], handler: stripeWebhook },
  { segments: ['targeting', 'estimate'], handler: targetingEstimate },
  { segments: ['templates', ':id'], handler: templatesId },
  { segments: ['templates', 'approved'], handler: templatesApproved },
  { segments: ['transactions', 'charge'], handler: transactionsCharge },
  { segments: ['announcements'], handler: announcements },
  { segments: ['campaigns'], handler: campaigns },
  { segments: ['profile'], handler: profile },
  { segments: ['recommended-templates'], handler: recommendedTemplates },
  { segments: ['refunds'], handler: refunds },
  { segments: ['tax-invoices'], handler: taxInvoices },
  { segments: ['templates'], handler: templates },
  { segments: ['transactions'], handler: transactions },
];

function matchRoute(ps: string[]): { route: RouteEntry; params: Record<string, string> } | null {
  let best: { route: RouteEntry; params: Record<string, string>; staticCount: number } | null = null;

  for (const r of routes) {
    if (r.segments.length !== ps.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    let staticCount = 0;
    for (let i = 0; i < r.segments.length; i++) {
      if (r.segments[i].startsWith(':')) params[r.segments[i].slice(1)] = ps[i];
      else if (r.segments[i] === ps[i]) staticCount++;
      else { ok = false; break; }
    }
    if (ok && (!best || staticCount > best.staticCount)) best = { route: r, params, staticCount };
  }
  return best ? { route: best.route, params: best.params } : null;
}

function getPath(req: VercelRequest): string[] {
  const rp = req.query.path;
  if (rp) return Array.isArray(rp) ? rp.filter(Boolean) : String(rp).split('/').filter(Boolean);
  const u = req.url || '', i = u.indexOf('/api/');
  if (i !== -1) return u.substring(i + 5).split('?')[0].split('/').filter(Boolean);
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ps = getPath(req);
  const m = matchRoute(ps);
  if (!m) return res.status(404).json({ error: 'Not found', path: ps.join('/') });
  for (const [k, v] of Object.entries(m.params)) (req.query as any)[k] = v;
  try {
    const mod = m.route.handler;
    const fn = mod.default || mod.handler || mod;
    if (typeof fn !== 'function') return res.status(500).json({ error: 'No handler: ' + ps.join('/') });
    return fn(req, res);
  } catch (e) {
    console.error('[Router]', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
