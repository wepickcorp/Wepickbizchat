import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  bizchatCampaignId: text('bizchat_campaign_id'),
  rcvType: integer('rcv_type').default(0),
  statusCode: integer('status_code').default(0),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAuth(req: VercelRequest) {
  const impersonateToken = req.headers['x-impersonate-token'] as string;
  const impersonateUserId = req.headers['x-impersonate-user-id'] as string;
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: '' };
    }
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

interface GenderAgeReportItem {
  age: string;
  sexCd: string;
  rcsReactCnt: number;
  rcsReactRatio: string;
  rcsSuccessCnt: number;
  vmgReactCnt: number;
  vmgReactRatio: string;
  vmgSuccessCnt: number;
  totReactCnt: number;
  totReactRatio: string;
  totRewardCnt: number;
  totRewardRatio: string;
  totSuccessCnt: number;
}

interface BizChatGenderAgeResponse {
  tid: string;
  code: string;
  msg: string;
  data?: {
    list: GenderAgeReportItem[];
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  const db = getDb();

  try {
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const campaign = campaignResult[0];

    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다' });
    }

    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    if (!campaign.bizchatCampaignId) {
      return res.status(400).json({ error: 'BizChat에 등록되지 않은 캠페인입니다' });
    }

    if (campaign.rcvType !== 0) {
      return res.status(400).json({ error: 'ATS 타겟팅 캠페인만 성별/연령대별 분석이 가능합니다' });
    }

    const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
    const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';
    const useProduction = process.env.BIZCHAT_USE_PROD === 'true';
    const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
    const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'BizChat API key not configured' });
    }

    const tid = Date.now().toString();
    const url = `${baseUrl}/api/v1/ats/rpt/gender/age?tid=${tid}`;

    console.log(`[GenderAgeReport] POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ id: campaign.bizchatCampaignId }),
    });

    const responseText = await response.text();
    console.log(`[GenderAgeReport] Response: ${response.status} - ${responseText.substring(0, 500)}`);

    let data: BizChatGenderAgeResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: 'BizChat 응답 파싱 실패', raw: responseText });
    }

    if (data.code !== 'S000001') {
      return res.status(400).json({
        error: `BizChat API 오류: ${data.msg}`,
        code: data.code,
      });
    }

    const maleData = data.data?.list.filter(item => item.sexCd === '1') || [];
    const femaleData = data.data?.list.filter(item => item.sexCd === '2') || [];

    return res.status(200).json({
      success: true,
      data: {
        list: data.data?.list || [],
        male: maleData,
        female: femaleData,
      },
    });

  } catch (error) {
    console.error('[GenderAgeReport] Error:', error);
    return res.status(500).json({
      error: '성별/연령대별 분석 조회 중 오류가 발생했습니다',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
