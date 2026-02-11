import type { VercelRequest, VercelResponse } from '@vercel/node';

type RouteEntry = {
  segments: string[];
  load: () => Promise<any>;
};

const routes: RouteEntry[] = [
  { segments: ['admin', 'agencies'], load: () => import('./_handlers/admin/agencies/index') },
  { segments: ['admin', 'announcements', ':id'], load: () => import('./_handlers/admin/announcements/[id]') },
  { segments: ['admin', 'announcements'], load: () => import('./_handlers/admin/announcements/index') },
  { segments: ['admin', 'campaigns'], load: () => import('./_handlers/admin/campaigns') },
  { segments: ['admin', 'login'], load: () => import('./_handlers/admin/login') },
  { segments: ['admin', 'logs'], load: () => import('./_handlers/admin/logs') },
  { segments: ['admin', 'me'], load: () => import('./_handlers/admin/me') },
  { segments: ['admin', 'refunds', ':id', 'process'], load: () => import('./_handlers/admin/refunds/[id]/process') },
  { segments: ['admin', 'refunds'], load: () => import('./_handlers/admin/refunds/index') },
  { segments: ['admin', 'reports', 'analytics'], load: () => import('./_handlers/admin/reports/analytics') },
  { segments: ['admin', 'reports', 'settlements'], load: () => import('./_handlers/admin/reports/settlements') },
  { segments: ['admin', 'stats'], load: () => import('./_handlers/admin/stats') },
  { segments: ['admin', 'tax-invoices'], load: () => import('./_handlers/admin/tax-invoices') },
  { segments: ['admin', 'transactions'], load: () => import('./_handlers/admin/transactions') },
  { segments: ['admin', 'users', ':userId', 'agency'], load: () => import('./_handlers/admin/users/[userId]/agency') },
  { segments: ['admin', 'users', ':userId', 'balance'], load: () => import('./_handlers/admin/users/[userId]/balance') },
  { segments: ['admin', 'users', ':userId', 'impersonate'], load: () => import('./_handlers/admin/users/[userId]/impersonate') },
  { segments: ['admin', 'users', ':userId', 'master'], load: () => import('./_handlers/admin/users/[userId]/master') },
  { segments: ['admin', 'users', ':userId', 'reset-password'], load: () => import('./_handlers/admin/users/[userId]/reset-password') },
  { segments: ['admin', 'users'], load: () => import('./_handlers/admin/users/index') },
  { segments: ['agencies', 'list'], load: () => import('./_handlers/agencies/list') },
  { segments: ['agency', 'login'], load: () => import('./_handlers/agency/login') },
  { segments: ['agency', 'stats'], load: () => import('./_handlers/agency/stats') },
  { segments: ['announcements'], load: () => import('./_handlers/announcements/index') },
  { segments: ['ats', 'meta', ':metaType'], load: () => import('./_handlers/ats/meta/[metaType]') },
  { segments: ['auth', 'user'], load: () => import('./_handlers/auth/user') },
  { segments: ['bizchat', 'ai'], load: () => import('./_handlers/bizchat/ai') },
  { segments: ['bizchat', 'ats'], load: () => import('./_handlers/bizchat/ats') },
  { segments: ['bizchat', 'callback', 'state'], load: () => import('./_handlers/bizchat/callback/state') },
  { segments: ['bizchat', 'campaigns'], load: () => import('./_handlers/bizchat/campaigns') },
  { segments: ['bizchat', 'file'], load: () => import('./_handlers/bizchat/file') },
  { segments: ['bizchat', 'maptics'], load: () => import('./_handlers/bizchat/maptics') },
  { segments: ['bizchat', 'mdn-upload'], load: () => import('./_handlers/bizchat/mdn-upload') },
  { segments: ['bizchat', 'reports', 'area'], load: () => import('./_handlers/bizchat/reports/area') },
  { segments: ['bizchat', 'reports', 'gender-age'], load: () => import('./_handlers/bizchat/reports/gender-age') },
  { segments: ['bizchat', 'reports', 'period'], load: () => import('./_handlers/bizchat/reports/period') },
  { segments: ['bizchat', 'sender'], load: () => import('./_handlers/bizchat/sender') },
  { segments: ['bizchat', 'stats'], load: () => import('./_handlers/bizchat/stats') },
  { segments: ['bizchat', 'template'], load: () => import('./_handlers/bizchat/template') },
  { segments: ['bizchat', 'test'], load: () => import('./_handlers/bizchat/test') },
  { segments: ['campaigns', 'test-create'], load: () => import('./_handlers/campaigns/test-create') },
  { segments: ['campaigns', ':id', 'cancel'], load: () => import('./_handlers/campaigns/[id]/cancel') },
  { segments: ['campaigns', ':id', 'stop'], load: () => import('./_handlers/campaigns/[id]/stop') },
  { segments: ['campaigns', ':id', 'submit'], load: () => import('./_handlers/campaigns/[id]/submit') },
  { segments: ['campaigns', ':id'], load: () => import('./_handlers/campaigns/[id]') },
  { segments: ['campaigns'], load: () => import('./_handlers/campaigns/index') },
  { segments: ['dashboard', 'stats'], load: () => import('./_handlers/dashboard/stats') },
  { segments: ['internal', 'master', 'reset-balance'], load: () => import('./_handlers/internal/master/reset-balance') },
  { segments: ['kispg', 'auth'], load: () => import('./_handlers/kispg/auth') },
  { segments: ['kispg', 'callback'], load: () => import('./_handlers/kispg/callback') },
  { segments: ['maptics', 'geofences'], load: () => import('./_handlers/maptics/geofences') },
  { segments: ['maptics', 'poi'], load: () => import('./_handlers/maptics/poi') },
  { segments: ['profile', 'password'], load: () => import('./_handlers/profile/password') },
  { segments: ['profile'], load: () => import('./_handlers/profile/index') },
  { segments: ['recommended-templates', 'filters'], load: () => import('./_handlers/recommended-templates/filters') },
  { segments: ['recommended-templates', ':id'], load: () => import('./_handlers/recommended-templates/[id]') },
  { segments: ['recommended-templates'], load: () => import('./_handlers/recommended-templates/index') },
  { segments: ['refunds'], load: () => import('./_handlers/refunds/index') },
  { segments: ['stripe', 'checkout'], load: () => import('./_handlers/stripe/checkout') },
  { segments: ['stripe', 'config'], load: () => import('./_handlers/stripe/config') },
  { segments: ['stripe', 'webhook'], load: () => import('./_handlers/stripe/webhook') },
  { segments: ['targeting', 'estimate'], load: () => import('./_handlers/targeting/estimate') },
  { segments: ['tax-invoices'], load: () => import('./_handlers/tax-invoices/index') },
  { segments: ['templates', 'approved'], load: () => import('./_handlers/templates/approved') },
  { segments: ['templates', ':id', 'approve'], load: () => import('./_handlers/templates/[id]/approve') },
  { segments: ['templates', ':id', 'reject'], load: () => import('./_handlers/templates/[id]/reject') },
  { segments: ['templates', ':id', 'submit'], load: () => import('./_handlers/templates/[id]/submit') },
  { segments: ['templates', ':id'], load: () => import('./_handlers/templates/[id]') },
  { segments: ['templates'], load: () => import('./_handlers/templates/index') },
  { segments: ['transactions', 'charge'], load: () => import('./_handlers/transactions/charge') },
  { segments: ['transactions'], load: () => import('./_handlers/transactions/index') },
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
  // 1. query.path에서 추출
  const rawPath = req.query.path;
  if (rawPath) {
    if (Array.isArray(rawPath)) {
      return rawPath.filter(Boolean);
    }
    // "admin/login" 같은 단일 문자열 → split
    return String(rawPath).split('/').filter(Boolean);
  }

  // 2. URL에서 직접 추출
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

  console.log(`[Router] URL: ${req.url}, Method: ${req.method}, Segments:`, pathSegments);

  const match = matchRoute(pathSegments);
  if (!match) {
    return res.status(404).json({ error: 'API route not found', path: pathSegments.join('/'), segments: pathSegments });
  }

  for (const [key, value] of Object.entries(match.params)) {
    (req.query as any)[key] = value;
  }

  try {
    const module = await match.route.load();
    const fn = module.default || module.handler || module;
    if (typeof fn !== 'function') {
      return res.status(500).json({ error: 'Handler not found' });
    }
    return fn(req, res);
  } catch (error) {
    console.error(`[Router] Error:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
