import type { VercelRequest, VercelResponse } from '@vercel/node';

import authUser from './auth/user';
import dashboardStats from './dashboard/stats';

import templatesIndex from './templates/index';
import templatesId from './templates/[id]';
import templatesIdSubmit from './templates/[id]/submit';
import templatesIdApprove from './templates/[id]/approve';
import templatesIdReject from './templates/[id]/reject';
import templatesApproved from './templates/approved';

import campaignsIndex from './campaigns/index';
import campaignsId from './campaigns/[id]';
import campaignsIdSubmit from './campaigns/[id]/submit';
import campaignsIdCancel from './campaigns/[id]/cancel';
import campaignsIdStop from './campaigns/[id]/stop';
import campaignsTestCreate from './campaigns/test-create';

import transactionsIndex from './transactions/index';
import transactionsCharge from './transactions/charge';

import targetingEstimate from './targeting/estimate';

import bizchatAi from './bizchat/ai';
import bizchatAts from './bizchat/ats';
import bizchatCampaigns from './bizchat/campaigns';
import bizchatFile from './bizchat/file';
import bizchatMdnUpload from './bizchat/mdn-upload';
import bizchatSender from './bizchat/sender';
import bizchatStats from './bizchat/stats';
import bizchatTemplate from './bizchat/template';
import bizchatTest from './bizchat/test';
import bizchatCallbackState from './bizchat/callback/state';
import bizchatReportsArea from './bizchat/reports/area';
import bizchatReportsGenderAge from './bizchat/reports/gender-age';
import bizchatReportsPeriod from './bizchat/reports/period';

import stripeCheckout from './stripe/checkout';
import stripeConfig from './stripe/config';
import stripeWebhook from './stripe/webhook';

import kispgAuth from './kispg/auth';
import kispgCallback from './kispg/callback';

import mapticsGeofences from './maptics/geofences';
import mapticsPoi from './maptics/poi';

import profileIndex from './profile/index';
import profilePassword from './profile/password';

import recommendedTemplatesIndex from './recommended-templates/index';
import recommendedTemplatesId from './recommended-templates/[id]';
import recommendedTemplatesFilters from './recommended-templates/filters';

import atsMetaType from './ats/meta/[metaType]';

import announcementsIndex from './announcements/index';
import refundsIndex from './refunds/index';
import taxInvoicesIndex from './tax-invoices/index';

import agenciesList from './agencies/list';
import agencyLogin from './agency/login';
import agencyStats from './agency/stats';

import adminLogin from './admin/login';
import adminMe from './admin/me';
import adminStats from './admin/stats';
import adminCampaigns from './admin/campaigns';
import adminTransactions from './admin/transactions';
import adminLogs from './admin/logs';
import adminTaxInvoices from './admin/tax-invoices';
import adminUsersIndex from './admin/users/index';
import adminAgenciesIndex from './admin/agencies/index';
import adminAnnouncementsIndex from './admin/announcements/index';
import adminAnnouncementsId from './admin/announcements/[id]';
import adminReportsAnalytics from './admin/reports/analytics';
import adminReportsSettlements from './admin/reports/settlements';
import adminRefundsIndex from './admin/refunds/index';
import adminRefundsIdProcess from './admin/refunds/[id]/process';
import adminUsersUserIdBalance from './admin/users/[userId]/balance';
import adminUsersUserIdImpersonate from './admin/users/[userId]/impersonate';
import adminUsersUserIdMaster from './admin/users/[userId]/master';
import adminUsersUserIdResetPassword from './admin/users/[userId]/reset-password';
import adminUsersUserIdAgency from './admin/users/[userId]/agency';

import internalMasterResetBalance from './internal/master/reset-balance';

type Handler = (req: VercelRequest, res: VercelResponse) => any;

interface Route {
  pattern: RegExp;
  handler: Handler;
  params?: string[];
}

const routes: Route[] = [
  { pattern: /^\/api\/auth\/user$/, handler: authUser },
  { pattern: /^\/api\/dashboard\/stats$/, handler: dashboardStats },

  { pattern: /^\/api\/templates\/approved$/, handler: templatesApproved },
  { pattern: /^\/api\/templates\/([^/]+)\/submit$/, handler: templatesIdSubmit, params: ['id'] },
  { pattern: /^\/api\/templates\/([^/]+)\/approve$/, handler: templatesIdApprove, params: ['id'] },
  { pattern: /^\/api\/templates\/([^/]+)\/reject$/, handler: templatesIdReject, params: ['id'] },
  { pattern: /^\/api\/templates\/([^/]+)$/, handler: templatesId, params: ['id'] },
  { pattern: /^\/api\/templates$/, handler: templatesIndex },

  { pattern: /^\/api\/campaigns\/test-create$/, handler: campaignsTestCreate },
  { pattern: /^\/api\/campaigns\/([^/]+)\/submit$/, handler: campaignsIdSubmit, params: ['id'] },
  { pattern: /^\/api\/campaigns\/([^/]+)\/cancel$/, handler: campaignsIdCancel, params: ['id'] },
  { pattern: /^\/api\/campaigns\/([^/]+)\/stop$/, handler: campaignsIdStop, params: ['id'] },
  { pattern: /^\/api\/campaigns\/([^/]+)$/, handler: campaignsId, params: ['id'] },
  { pattern: /^\/api\/campaigns$/, handler: campaignsIndex },

  { pattern: /^\/api\/transactions\/charge$/, handler: transactionsCharge },
  { pattern: /^\/api\/transactions$/, handler: transactionsIndex },

  { pattern: /^\/api\/targeting\/estimate$/, handler: targetingEstimate },

  { pattern: /^\/api\/bizchat\/ai$/, handler: bizchatAi },
  { pattern: /^\/api\/bizchat\/ats$/, handler: bizchatAts },
  { pattern: /^\/api\/bizchat\/campaigns$/, handler: bizchatCampaigns },
  { pattern: /^\/api\/bizchat\/file$/, handler: bizchatFile },
  { pattern: /^\/api\/bizchat\/mdn-upload$/, handler: bizchatMdnUpload },
  { pattern: /^\/api\/bizchat\/sender$/, handler: bizchatSender },
  { pattern: /^\/api\/bizchat\/stats$/, handler: bizchatStats },
  { pattern: /^\/api\/bizchat\/template$/, handler: bizchatTemplate },
  { pattern: /^\/api\/bizchat\/test$/, handler: bizchatTest },
  { pattern: /^\/api\/bizchat\/callback\/state$/, handler: bizchatCallbackState },
  { pattern: /^\/api\/bizchat\/reports\/area$/, handler: bizchatReportsArea },
  { pattern: /^\/api\/bizchat\/reports\/gender-age$/, handler: bizchatReportsGenderAge },
  { pattern: /^\/api\/bizchat\/reports\/period$/, handler: bizchatReportsPeriod },

  { pattern: /^\/api\/stripe\/checkout$/, handler: stripeCheckout },
  { pattern: /^\/api\/stripe\/config$/, handler: stripeConfig },
  { pattern: /^\/api\/stripe\/webhook$/, handler: stripeWebhook },

  { pattern: /^\/api\/kispg\/auth$/, handler: kispgAuth },
  { pattern: /^\/api\/kispg\/callback$/, handler: kispgCallback },

  { pattern: /^\/api\/maptics\/geofences$/, handler: mapticsGeofences },
  { pattern: /^\/api\/maptics\/poi$/, handler: mapticsPoi },

  { pattern: /^\/api\/profile\/password$/, handler: profilePassword },
  { pattern: /^\/api\/profile$/, handler: profileIndex },

  { pattern: /^\/api\/recommended-templates\/filters$/, handler: recommendedTemplatesFilters },
  { pattern: /^\/api\/recommended-templates\/([^/]+)$/, handler: recommendedTemplatesId, params: ['id'] },
  { pattern: /^\/api\/recommended-templates$/, handler: recommendedTemplatesIndex },

  { pattern: /^\/api\/ats\/meta\/([^/]+)$/, handler: atsMetaType, params: ['metaType'] },

  { pattern: /^\/api\/announcements$/, handler: announcementsIndex },
  { pattern: /^\/api\/refunds$/, handler: refundsIndex },
  { pattern: /^\/api\/tax-invoices$/, handler: taxInvoicesIndex },

  { pattern: /^\/api\/agencies\/list$/, handler: agenciesList },
  { pattern: /^\/api\/agency\/login$/, handler: agencyLogin },
  { pattern: /^\/api\/agency\/stats$/, handler: agencyStats },

  { pattern: /^\/api\/admin\/login$/, handler: adminLogin },
  { pattern: /^\/api\/admin\/me$/, handler: adminMe },
  { pattern: /^\/api\/admin\/stats$/, handler: adminStats },
  { pattern: /^\/api\/admin\/campaigns$/, handler: adminCampaigns },
  { pattern: /^\/api\/admin\/transactions$/, handler: adminTransactions },
  { pattern: /^\/api\/admin\/logs$/, handler: adminLogs },
  { pattern: /^\/api\/admin\/tax-invoices$/, handler: adminTaxInvoices },
  { pattern: /^\/api\/admin\/users\/([^/]+)\/balance$/, handler: adminUsersUserIdBalance, params: ['userId'] },
  { pattern: /^\/api\/admin\/users\/([^/]+)\/impersonate$/, handler: adminUsersUserIdImpersonate, params: ['userId'] },
  { pattern: /^\/api\/admin\/users\/([^/]+)\/master$/, handler: adminUsersUserIdMaster, params: ['userId'] },
  { pattern: /^\/api\/admin\/users\/([^/]+)\/reset-password$/, handler: adminUsersUserIdResetPassword, params: ['userId'] },
  { pattern: /^\/api\/admin\/users\/([^/]+)\/agency$/, handler: adminUsersUserIdAgency, params: ['userId'] },
  { pattern: /^\/api\/admin\/users$/, handler: adminUsersIndex },
  { pattern: /^\/api\/admin\/agencies$/, handler: adminAgenciesIndex },
  { pattern: /^\/api\/admin\/announcements\/([^/]+)$/, handler: adminAnnouncementsId, params: ['id'] },
  { pattern: /^\/api\/admin\/announcements$/, handler: adminAnnouncementsIndex },
  { pattern: /^\/api\/admin\/reports\/analytics$/, handler: adminReportsAnalytics },
  { pattern: /^\/api\/admin\/reports\/settlements$/, handler: adminReportsSettlements },
  { pattern: /^\/api\/admin\/refunds\/([^/]+)\/process$/, handler: adminRefundsIdProcess, params: ['id'] },
  { pattern: /^\/api\/admin\/refunds$/, handler: adminRefundsIndex },

  { pattern: /^\/api\/internal\/master\/reset-balance$/, handler: internalMasterResetBalance },
];

export default async function router(req: VercelRequest, res: VercelResponse) {
  const url = (req.url || '').split('?')[0];

  for (const route of routes) {
    const match = url.match(route.pattern);
    if (match) {
      if (route.params && match.length > 1) {
        if (!req.query) (req as any).query = {};
        route.params.forEach((param, i) => {
          (req.query as any)[param] = match[i + 1];
        });
      }
      return route.handler(req, res);
    }
  }

  res.status(404).json({ error: 'Not found' });
}
