import type { VercelRequest, VercelResponse } from '@vercel/node';

// 정적 import - Vercel 번들러가 추적 가능
import * as adminAgencies from './handlers/admin/agencies/index';
import * as adminAnnouncementsId from './handlers/admin/announcements/[id]';
import * as adminAnnouncements from './handlers/admin/announcements/index';
import * as adminCampaigns from './handlers/admin/campaigns';
import * as adminLogin from './handlers/admin/login';
import * as adminLogs from './handlers/admin/logs';
import * as adminMe from './handlers/admin/me';
import * as adminRefundsIdProcess from './handlers/admin/refunds/[id]/process';
import * as adminRefunds from './handlers/admin/refunds/index';
import * as adminReportsAnalytics from './handlers/admin/reports/analytics';
import * as adminReportsSettlements from './handlers/admin/reports/settlements';
import * as adminStats from './handlers/admin/stats';
import * as adminTaxInvoices from './handlers/admin/tax-invoices';
import * as adminTransactions from './handlers/admin/transactions';
import * as adminUsersUserIdAgency from './handlers/admin/users/[userId]/agency';
import * as adminUsersUserIdBalance from './handlers/admin/users/[userId]/balance';
import * as adminUsersUserIdImpersonate from './handlers/admin/users/[userId]/impersonate';
import * as adminUsersUserIdMaster from './handlers/admin/users/[userId]/master';
import * as adminUsersUserIdResetPassword from './handlers/admin/users/[userId]/reset-password';
import * as adminUsers from './handlers/admin/users/index';
import * as agenciesList from './handlers/agencies/list';
import * as agencyLogin from './handlers/agency/login';
import * as agencyStats from './handlers/agency/stats';
import * as announcements from './handlers/announcements/index';
import * as atsMetaType from './handlers/ats/meta/[metaType]';
import * as authUser from './handlers/auth/user';
import * as bizchatAi from './handlers/bizchat/ai';
import * as bizchatAts from './handlers/bizchat/ats';
import * as bizchatCallbackState from './handlers/bizchat/callback/state';
import * as bizchatCampaigns from './handlers/bizchat/campaigns';
import * as bizchatFile from './handlers/bizchat/file';
import * as bizchatMdnUpload from './handlers/bizchat/mdn-upload';
import * as bizchatReportsArea from './handlers/bizchat/reports/area';
import * as bizchatReportsGenderAge from './handlers/bizchat/reports/gender-age';
import * as bizchatReportsPeriod from './handlers/bizchat/reports/period';
import * as bizchatSender from './handlers/bizchat/sender';
import * as bizchatStats from './handlers/bizchat/stats';
import * as bizchatTemplate from './handlers/bizchat/template';
import * as bizchatTest from './handlers/bizchat/test';
import * as campaignsTestCreate from './handlers/campaigns/test-create';
import * as campaignsIdCancel from './handlers/campaigns/[id]/cancel';
import * as campaignsIdStop from './handlers/campaigns/[id]/stop';
import * as campaignsIdSubmit from './handlers/campaigns/[id]/submit';
import * as campaignsId from './handlers/campaigns/[id]';
import * as campaigns from './handlers/campaigns/index';
import * as dashboardStats from './handlers/dashboard/stats';
import * as internalMasterResetBalance from './handlers/internal/master/reset-balance';
import * as kispgAuth from './handlers/kispg/auth';
import * as kispgCallback from './handlers/kispg/callback';
import * as mapticsGeofences from './handlers/maptics/geofences';
import * as mapticsPoi from './handlers/maptics/poi';
import * as profilePassword from './handlers/profile/password';
import * as profile from './handlers/profile/index';
import * as recommendedTemplatesFilters from './handlers/recommended-templates/filters';
import * as recommendedTemplatesId from './handlers/recommended-templates/[id]';
import * as recommendedTemplates from './handlers/recommended-templates/index';
import * as refunds from './handlers/refunds/index';
import * as stripeCheckout from './handlers/stripe/checkout';
import * as stripeConfig from './handlers/stripe/config';
import * as stripeWebhook from './handlers/stripe/webhook';
import * as targetingEstimate from './handlers/targeting/estimate';
import * as taxInvoices from './handlers/tax-invoices/index';
import * as templatesApproved from './handlers/templates/approved';
import * as templatesIdApprove from './handlers/templates/[id]/approve';
import * as templatesIdReject from './handlers/templates/[id]/reject';
import * as templatesIdSubmit from './handlers/templates/[id]/submit';
import * as templatesId from './handlers/templates/[id]';
import * as templates from './handlers/templates/index';
import * as transactionsCharge from './handlers/transactions/charge';
import * as transactions from './handlers/transactions/index';

type RouteEntry = {
  segments: string[];
  handler: any;
};

const routes: RouteEntry[] = [
  { segments: ['admin', 'agencies'], handler: adminAgencies },
  { segments: ['admin', 'announcements', ':id'], handler: adminAnnouncementsId },
  { segments: ['admin', 'announcements'], handler: adminAnnouncements },
  { segments: ['admin', 'campaigns'], handler: adminCampaigns },
  { segments: ['admin', 'login'], handler: adminLogin },
  { segments: ['admin', 'logs'], handler: adminLogs },
  { segments: ['admin', 'me'], handler: adminMe },
  { segments: ['admin', 'refunds', ':id', 'process'], handler: adminRefundsIdProcess },
  { segments: ['admin', 'refunds'], handler: adminRefunds },
  { segments: ['admin', 'reports', 'analytics'], handler: adminReportsAnalytics },
  { segments: ['admin', 'reports', 'settlements'], handler: adminReportsSettlements },
  { segments: ['admin', 'stats'], handler: adminStats },
  { segments: ['admin', 'tax-invoices'], handler: adminTaxInvoices },
  { segments: ['admin', 'transactions'], handler: adminTransactions },
  { segments: ['admin', 'users', ':userId', 'agency'], handler: adminUsersUserIdAgency },
  { segments: ['admin', 'users', ':userId', 'balance'], handler: adminUsersUserIdBalance },
  { segments: ['admin', 'users', ':userId', 'impersonate'], handler: adminUsersUserIdImpersonate },
  { segments: ['admin', 'users', ':userId', 'master'], handler: adminUsersUserIdMaster },
  { segments: ['admin', 'users', ':userId', 'reset-password'], handler: adminUsersUserIdResetPassword },
  { segments: ['admin', 'users'], handler: adminUsers },
  { segments: ['agencies', 'list'], handler: agenciesList },
  { segments: ['agency', 'login'], handler: agencyLogin },
  { segments: ['agency', 'stats'], handler: agencyStats },
  { segments: ['announcements'], handler: announcements },
  { segments: ['ats', 'meta', ':metaType'], handler: atsMetaType },
  { segments: ['auth', 'user'], handler: authUser },
  { segments: ['bizchat', 'ai'], handler: bizchatAi },
  { segments: ['bizchat', 'ats'], handler: bizchatAts },
  { segments: ['bizchat', 'callback', 'state'], handler: bizchatCallbackState },
  { segments: ['bizchat', 'campaigns'], handler: bizchatCampaigns },
  { segments: ['bizchat', 'file'], handler: bizchatFile },
  { segments: ['bizchat', 'mdn-upload'], handler: bizchatMdnUpload },
  { segments: ['bizchat', 'reports', 'area'], handler: bizchatReportsArea },
  { segments: ['bizchat', 'reports', 'gender-age'], handler: bizchatReportsGenderAge },
  { segments: ['bizchat', 'reports', 'period'], handler: bizchatReportsPeriod },
  { segments: ['bizchat', 'sender'], handler: bizchatSender },
  { segments: ['bizchat', 'stats'], handler: bizchatStats },
  { segments: ['bizchat', 'template'], handler: bizchatTemplate },
  { segments: ['bizchat', 'test'], handler: bizchatTest },
  { segments: ['campaigns', 'test-create'], handler: campaignsTestCreate },
  { segments: ['campaigns', ':id', 'cancel'], handler: campaignsIdCancel },
  { segments: ['campaigns', ':id', 'stop'], handler: campaignsIdStop },
  { segments: ['campaigns', ':id', 'submit'], handler: campaignsIdSubmit },
  { segments: ['campaigns', ':id'], handler: campaignsId },
  { segments: ['campaigns'], handler: campaigns },
  { segments: ['dashboard', 'stats'], handler: dashboardStats },
  { segments: ['internal', 'master', 'reset-balance'], handler: internalMasterResetBalance },
  { segments: ['kispg', 'auth'], handler: kispgAuth },
  { segments: ['kispg', 'callback'], handler: kispgCallback },
  { segments: ['maptics', 'geofences'], handler: mapticsGeofences },
  { segments: ['maptics', 'poi'], handler: mapticsPoi },
  { segments: ['profile', 'password'], handler: profilePassword },
  { segments: ['profile'], handler: profile },
  { segments: ['recommended-templates', 'filters'], handler: recommendedTemplatesFilters },
  { segments: ['recommended-templates', ':id'], handler: recommendedTemplatesId },
  { segments: ['recommended-templates'], handler: recommendedTemplates },
  { segments: ['refunds'], handler: refunds },
  { segments: ['stripe', 'checkout'], handler: stripeCheckout },
  { segments: ['stripe', 'config'], handler: stripeConfig },
  { segments: ['stripe', 'webhook'], handler: stripeWebhook },
  { segments: ['targeting', 'estimate'], handler: targetingEstimate },
  { segments: ['tax-invoices'], handler: taxInvoices },
  { segments: ['templates', 'approved'], handler: templatesApproved },
  { segments: ['templates', ':id', 'approve'], handler: templatesIdApprove },
  { segments: ['templates', ':id', 'reject'], handler: templatesIdReject },
  { segments: ['templates', ':id', 'submit'], handler: templatesIdSubmit },
  { segments: ['templates', ':id'], handler: templatesId },
  { segments: ['templates'], handler: templates },
  { segments: ['transactions', 'charge'], handler: transactionsCharge },
  { segments: ['transactions'], handler: transactions },
];

function matchRoute(pathSegments: string[]): { route: RouteEntry; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.segments.length !== pathSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = pathSegments[i];
      } else if (seg !== pathSegments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

function extractPathSegments(req: VercelRequest): string[] {
  const rawPath = req.query.path;
  if (rawPath) {
    if (Array.isArray(rawPath)) return rawPath.filter(Boolean);
    return String(rawPath).split('/').filter(Boolean);
  }
  const url = req.url || '';
  const apiPrefix = '/api/';
  const idx = url.indexOf(apiPrefix);
  if (idx !== -1) {
    const rest = url.substring(idx + apiPrefix.length).split('?')[0];
    return rest.split('/').filter(Boolean);
  }
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathSegments = extractPathSegments(req);

  const match = matchRoute(pathSegments);
  if (!match) {
    return res.status(404).json({ error: 'API route not found', path: pathSegments.join('/') });
  }

  for (const [key, value] of Object.entries(match.params)) {
    (req.query as any)[key] = value;
  }

  try {
    const mod = match.route.handler;
    const fn = mod.default || mod.handler || mod;
    if (typeof fn !== 'function') {
      return res.status(500).json({ error: 'Handler not found for path: ' + pathSegments.join('/') });
    }
    return fn(req, res);
  } catch (error) {
    console.error('[Router] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
