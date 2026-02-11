import type { VercelRequest, VercelResponse } from '@vercel/node';

// 정적 import - Vercel 번들러가 추적 가능
import adminAgencies from '../src/handlers/admin/agencies/index';
import adminAnnouncementsId from '../src/handlers/admin/announcements/[id]';
import adminAnnouncements from '../src/handlers/admin/announcements/index';
import adminCampaigns from '../src/handlers/admin/campaigns';
import adminLogin from '../src/handlers/admin/login';
import adminLogs from '../src/handlers/admin/logs';
import adminMe from '../src/handlers/admin/me';
import adminRefundsIdProcess from '../src/handlers/admin/refunds/[id]/process';
import adminRefunds from '../src/handlers/admin/refunds/index';
import adminReportsAnalytics from '../src/handlers/admin/reports/analytics';
import adminReportsSettlements from '../src/handlers/admin/reports/settlements';
import adminStats from '../src/handlers/admin/stats';
import adminTaxInvoices from '../src/handlers/admin/tax-invoices';
import adminTransactions from '../src/handlers/admin/transactions';
import adminUsersUserIdAgency from '../src/handlers/admin/users/[userId]/agency';
import adminUsersUserIdBalance from '../src/handlers/admin/users/[userId]/balance';
import adminUsersUserIdImpersonate from '../src/handlers/admin/users/[userId]/impersonate';
import adminUsersUserIdMaster from '../src/handlers/admin/users/[userId]/master';
import adminUsersUserIdResetPassword from '../src/handlers/admin/users/[userId]/reset-password';
import adminUsers from '../src/handlers/admin/users/index';
import agenciesList from '../src/handlers/agencies/list';
import agencyLogin from '../src/handlers/agency/login';
import agencyStats from '../src/handlers/agency/stats';
import announcements from '../src/handlers/announcements/index';
import atsMetaType from '../src/handlers/ats/meta/[metaType]';
import authUser from '../src/handlers/auth/user';
import bizchatAi from '../src/handlers/bizchat/ai';
import bizchatAts from '../src/handlers/bizchat/ats';
import bizchatCallbackState from '../src/handlers/bizchat/callback/state';
import bizchatCampaigns from '../src/handlers/bizchat/campaigns';
import bizchatFile from '../src/handlers/bizchat/file';
import bizchatMaptics from '../src/handlers/bizchat/maptics';
import bizchatMdnUpload from '../src/handlers/bizchat/mdn-upload';
import bizchatReportsArea from '../src/handlers/bizchat/reports/area';
import bizchatReportsGenderAge from '../src/handlers/bizchat/reports/gender-age';
import bizchatReportsPeriod from '../src/handlers/bizchat/reports/period';
import bizchatSender from '../src/handlers/bizchat/sender';
import bizchatStats from '../src/handlers/bizchat/stats';
import bizchatTemplate from '../src/handlers/bizchat/template';
import bizchatTest from '../src/handlers/bizchat/test';
import campaignsTestCreate from '../src/handlers/campaigns/test-create';
import campaignsIdCancel from '../src/handlers/campaigns/[id]/cancel';
import campaignsIdStop from '../src/handlers/campaigns/[id]/stop';
import campaignsIdSubmit from '../src/handlers/campaigns/[id]/submit';
import campaignsId from '../src/handlers/campaigns/[id]';
import campaigns from '../src/handlers/campaigns/index';
import dashboardStats from '../src/handlers/dashboard/stats';
import internalMasterResetBalance from '../src/handlers/internal/master/reset-balance';
import kispgAuth from '../src/handlers/kispg/auth';
import kispgCallback from '../src/handlers/kispg/callback';
import mapticsGeofences from '../src/handlers/maptics/geofences';
import mapticsPoi from '../src/handlers/maptics/poi';
import profilePassword from '../src/handlers/profile/password';
import profile from '../src/handlers/profile/index';
import recommendedTemplatesFilters from '../src/handlers/recommended-templates/filters';
import recommendedTemplatesId from '../src/handlers/recommended-templates/[id]';
import recommendedTemplates from '../src/handlers/recommended-templates/index';
import refunds from '../src/handlers/refunds/index';
import stripeCheckout from '../src/handlers/stripe/checkout';
import stripeConfig from '../src/handlers/stripe/config';
import stripeWebhook from '../src/handlers/stripe/webhook';
import targetingEstimate from '../src/handlers/targeting/estimate';
import taxInvoices from '../src/handlers/tax-invoices/index';
import templatesApproved from '../src/handlers/templates/approved';
import templatesIdApprove from '../src/handlers/templates/[id]/approve';
import templatesIdReject from '../src/handlers/templates/[id]/reject';
import templatesIdSubmit from '../src/handlers/templates/[id]/submit';
import templatesId from '../src/handlers/templates/[id]';
import templates from '../src/handlers/templates/index';
import transactionsCharge from '../src/handlers/transactions/charge';
import transactions from '../src/handlers/transactions/index';

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
