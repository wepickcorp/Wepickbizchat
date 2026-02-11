import type { VercelRequest, VercelResponse } from '@vercel/node';

// 정적 import - Vercel 번들러가 추적 가능
import adminAgencies from './_handlers/admin/agencies/index';
import adminAnnouncementsId from './_handlers/admin/announcements/[id]';
import adminAnnouncements from './_handlers/admin/announcements/index';
import adminCampaigns from './_handlers/admin/campaigns';
import adminLogin from './_handlers/admin/login';
import adminLogs from './_handlers/admin/logs';
import adminMe from './_handlers/admin/me';
import adminRefundsIdProcess from './_handlers/admin/refunds/[id]/process';
import adminRefunds from './_handlers/admin/refunds/index';
import adminReportsAnalytics from './_handlers/admin/reports/analytics';
import adminReportsSettlements from './_handlers/admin/reports/settlements';
import adminStats from './_handlers/admin/stats';
import adminTaxInvoices from './_handlers/admin/tax-invoices';
import adminTransactions from './_handlers/admin/transactions';
import adminUsersUserIdAgency from './_handlers/admin/users/[userId]/agency';
import adminUsersUserIdBalance from './_handlers/admin/users/[userId]/balance';
import adminUsersUserIdImpersonate from './_handlers/admin/users/[userId]/impersonate';
import adminUsersUserIdMaster from './_handlers/admin/users/[userId]/master';
import adminUsersUserIdResetPassword from './_handlers/admin/users/[userId]/reset-password';
import adminUsers from './_handlers/admin/users/index';
import agenciesList from './_handlers/agencies/list';
import agencyLogin from './_handlers/agency/login';
import agencyStats from './_handlers/agency/stats';
import announcements from './_handlers/announcements/index';
import atsMetaType from './_handlers/ats/meta/[metaType]';
import authUser from './_handlers/auth/user';
import bizchatAi from './_handlers/bizchat/ai';
import bizchatAts from './_handlers/bizchat/ats';
import bizchatCallbackState from './_handlers/bizchat/callback/state';
import bizchatCampaigns from './_handlers/bizchat/campaigns';
import bizchatFile from './_handlers/bizchat/file';
import bizchatMaptics from './_handlers/bizchat/maptics';
import bizchatMdnUpload from './_handlers/bizchat/mdn-upload';
import bizchatReportsArea from './_handlers/bizchat/reports/area';
import bizchatReportsGenderAge from './_handlers/bizchat/reports/gender-age';
import bizchatReportsPeriod from './_handlers/bizchat/reports/period';
import bizchatSender from './_handlers/bizchat/sender';
import bizchatStats from './_handlers/bizchat/stats';
import bizchatTemplate from './_handlers/bizchat/template';
import bizchatTest from './_handlers/bizchat/test';
import campaignsTestCreate from './_handlers/campaigns/test-create';
import campaignsIdCancel from './_handlers/campaigns/[id]/cancel';
import campaignsIdStop from './_handlers/campaigns/[id]/stop';
import campaignsIdSubmit from './_handlers/campaigns/[id]/submit';
import campaignsId from './_handlers/campaigns/[id]';
import campaigns from './_handlers/campaigns/index';
import dashboardStats from './_handlers/dashboard/stats';
import internalMasterResetBalance from './_handlers/internal/master/reset-balance';
import kispgAuth from './_handlers/kispg/auth';
import kispgCallback from './_handlers/kispg/callback';
import mapticsGeofences from './_handlers/maptics/geofences';
import mapticsPoi from './_handlers/maptics/poi';
import profilePassword from './_handlers/profile/password';
import profile from './_handlers/profile/index';
import recommendedTemplatesFilters from './_handlers/recommended-templates/filters';
import recommendedTemplatesId from './_handlers/recommended-templates/[id]';
import recommendedTemplates from './_handlers/recommended-templates/index';
import refunds from './_handlers/refunds/index';
import stripeCheckout from './_handlers/stripe/checkout';
import stripeConfig from './_handlers/stripe/config';
import stripeWebhook from './_handlers/stripe/webhook';
import targetingEstimate from './_handlers/targeting/estimate';
import taxInvoices from './_handlers/tax-invoices/index';
import templatesApproved from './_handlers/templates/approved';
import templatesIdApprove from './_handlers/templates/[id]/approve';
import templatesIdReject from './_handlers/templates/[id]/reject';
import templatesIdSubmit from './_handlers/templates/[id]/submit';
import templatesId from './_handlers/templates/[id]';
import templates from './_handlers/templates/index';
import transactionsCharge from './_handlers/transactions/charge';
import transactions from './_handlers/transactions/index';

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
  { segments: ['bizchat', 'maptics'], handler: bizchatMaptics },
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
    const fn = typeof match.route.handler === 'function' 
      ? match.route.handler 
      : match.route.handler?.default || match.route.handler;
    if (typeof fn !== 'function') {
      return res.status(500).json({ error: 'Handler not found' });
    }
    return fn(req, res);
  } catch (error) {
    console.error(`[Router] Error:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
