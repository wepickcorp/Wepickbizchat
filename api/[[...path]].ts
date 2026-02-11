// api/[[...path]].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<any>;
type RouteEntry = {
  segments: string[];
  load: () => Promise<{ default: Handler }>;
};

const routes: RouteEntry[] = [
  // admin
  { segments: ['admin', 'agencies'], load: () => import('../_api/admin/agencies/index') },
  { segments: ['admin', 'announcements', ':id'], load: () => import('../_api/admin/announcements/[id]') },
  { segments: ['admin', 'announcements'], load: () => import('../_api/admin/announcements/index') },
  { segments: ['admin', 'campaigns'], load: () => import('../_api/admin/campaigns') },
  { segments: ['admin', 'login'], load: () => import('../_api/admin/login') },
  { segments: ['admin', 'logs'], load: () => import('../_api/admin/logs') },
  { segments: ['admin', 'me'], load: () => import('../_api/admin/me') },
  { segments: ['admin', 'refunds', ':id', 'process'], load: () => import('../_api/admin/refunds/[id]/process') },
  { segments: ['admin', 'refunds'], load: () => import('../_api/admin/refunds/index') },
  { segments: ['admin', 'reports', 'analytics'], load: () => import('../_api/admin/reports/analytics') },
  { segments: ['admin', 'reports', 'settlements'], load: () => import('../_api/admin/reports/settlements') },
  { segments: ['admin', 'stats'], load: () => import('../_api/admin/stats') },
  { segments: ['admin', 'tax-invoices'], load: () => import('../_api/admin/tax-invoices') },
  { segments: ['admin', 'transactions'], load: () => import('../_api/admin/transactions') },
  { segments: ['admin', 'users', ':userId', 'agency'], load: () => import('../_api/admin/users/[userId]/agency') },
  { segments: ['admin', 'users', ':userId', 'balance'], load: () => import('../_api/admin/users/[userId]/balance') },
  { segments: ['admin', 'users', ':userId', 'impersonate'], load: () => import('../_api/admin/users/[userId]/impersonate') },
  { segments: ['admin', 'users', ':userId', 'master'], load: () => import('../_api/admin/users/[userId]/master') },
  { segments: ['admin', 'users', ':userId', 'reset-password'], load: () => import('../_api/admin/users/[userId]/reset-password') },
  { segments: ['admin', 'users'], load: () => import('../_api/admin/users/index') },

  // agencies / agency
  { segments: ['agencies', 'list'], load: () => import('../_api/agencies/list') },
  { segments: ['agency', 'login'], load: () => import('../_api/agency/login') },
  { segments: ['agency', 'stats'], load: () => import('../_api/agency/stats') },

  // announcements
  { segments: ['announcements'], load: () => import('../_api/announcements/index') },

  // ats
  { segments: ['ats', 'meta', ':metaType'], load: () => import('../_api/ats/meta/[metaType]') },

  // auth
  { segments: ['auth', 'user'], load: () => import('../_api/auth/user') },

  // bizchat
  { segments: ['bizchat', 'ai'], load: () => import('../_api/bizchat/ai') },
  { segments: ['bizchat', 'ats'], load: () => import('../_api/bizchat/ats') },
  { segments: ['bizchat', 'callback', 'state'], load: () => import('../_api/bizchat/callback/state') },
  { segments: ['bizchat', 'campaigns'], load: () => import('../_api/bizchat/campaigns') },
  { segments: ['bizchat', 'file'], load: () => import('../_api/bizchat/file') },
  { segments: ['bizchat', 'maptics'], load: () => import('../_api/bizchat/maptics') },
  { segments: ['bizchat', 'mdn-upload'], load: () => import('../_api/bizchat/mdn-upload') },
  { segments: ['bizchat', 'reports', 'area'], load: () => import('../_api/bizchat/reports/area') },
  { segments: ['bizchat', 'reports', 'gender-age'], load: () => import('../_api/bizchat/reports/gender-age') },
  { segments: ['bizchat', 'reports', 'period'], load: () => import('../_api/bizchat/reports/period') },
  { segments: ['bizchat', 'sender'], load: () => import('../_api/bizchat/sender') },
  { segments: ['bizchat', 'stats'], load: () => import('../_api/bizchat/stats') },
  { segments: ['bizchat', 'template'], load: () => import('../_api/bizchat/template') },
  { segments: ['bizchat', 'test'], load: () => import('../_api/bizchat/test') },

  // campaigns
  { segments: ['campaigns', 'test-create'], load: () => import('../_api/campaigns/test-create') },
  { segments: ['campaigns', ':id', 'cancel'], load: () => import('../_api/campaigns/[id]/cancel') },
  { segments: ['campaigns', ':id', 'stop'], load: () => import('../_api/campaigns/[id]/stop') },
  { segments: ['campaigns', ':id', 'submit'], load: () => import('../_api/campaigns/[id]/submit') },
  { segments: ['campaigns', ':id'], load: () => import('../_api/campaigns/[id]') },
  { segments: ['campaigns'], load: () => import('../_api/campaigns/index') },

  // dashboard
  { segments: ['dashboard', 'stats'], load: () => import('../_api/dashboard/stats') },

  // internal
  { segments: ['internal', 'master', 'reset-balance'], load: () => import('../_api/internal/master/reset-balance') },

  // kispg
  { segments: ['kispg', 'auth'], load: () => import('../_api/kispg/auth') },
  { segments: ['kispg', 'callback'], load: () => import('../_api/kispg/callback') },

  // maptics
  { segments: ['maptics', 'geofences'], load: () => import('../_api/maptics/geofences') },
  { segments: ['maptics', 'poi'], load: () => import('../_api/maptics/poi') },

  // profile
  { segments: ['profile', 'password'], load: () => import('../_api/profile/password') },
  { segments: ['profile'], load: () => import('../_api/profile/index') },

  // recommended-templates
  { segments: ['recommended-templates', 'filters'], load: () => import('../_api/recommended-templates/filters') },
  { segments: ['recommended-templates', ':id'], load: () => import('../_api/recommended-templates/[id]') },
  { segments: ['recommended-templates'], load: () => import('../_api/recommended-templates/index') },

  // refunds
  { segments: ['refunds'], load: () => import('../_api/refunds/index') },

  // stripe
  { segments: ['stripe', 'checkout'], load: () => import('../_api/stripe/checkout') },
  { segments: ['stripe', 'config'], load: () => import('../_api/stripe/config') },
  { segments: ['stripe', 'webhook'], load: () => import('../_api/stripe/webhook') },

  // targeting
  { segments: ['targeting', 'estimate'], load: () => import('../_api/targeting/estimate') },

  // tax-invoices
  { segments: ['tax-invoices'], load: () => import('../_api/tax-invoices/index') },

  // templates
  { segments: ['templates', 'approved'], load: () => import('../_api/templates/approved') },
  { segments: ['templates', ':id', 'approve'], load: () => import('../_api/templates/[id]/approve') },
  { segments: ['templates', ':id', 'reject'], load: () => import('../_api/templates/[id]/reject') },
  { segments: ['templates', ':id', 'submit'], load: () => import('../_api/templates/[id]/submit') },
  { segments: ['templates', ':id'], load: () => import('../_api/templates/[id]') },
  { segments: ['templates'], load: () => import('../_api/templates/index') },

  // transactions
  { segments: ['transactions', 'charge'], load: () => import('../_api/transactions/charge') },
  { segments: ['transactions'], load: () => import('../_api/transactions/index') },
];

function matchRoute(pathSegments: string[]): { route: RouteEntry; params: Record<string, string> } | null {
  // 더 구체적인 라우트(세그먼트 수 많고 동적 파라미터 적은)를 우선 매칭
  for (const route of routes) {
    if (route.segments.length !== pathSegments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) {
        // 동적 세그먼트 - Vercel 원본 파라미터명으로 매핑
        // :id → id, :userId → userId, :metaType → metaType
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  const pathSegments = Array.isArray(path) ? path : path ? [path] : [];

  const match = matchRoute(pathSegments);
  if (!match) {
    return res.status(404).json({ error: 'API route not found', path: pathSegments.join('/') });
  }

  // 동적 파라미터를 req.query에 주입 (기존 핸들러가 req.query.id 등으로 접근)
  for (const [key, value] of Object.entries(match.params)) {
    (req.query as any)[key] = value;
  }

  try {
    const module = await match.route.load();
    return module.default(req, res);
  } catch (error) {
    console.error(`[Router] Error:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
