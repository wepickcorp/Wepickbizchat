import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// Database tables
const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  bizchatCampaignId: text('bizchat_campaign_id'),
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

// Transaction ID 생성 (밀리초 타임스탬프)
function generateTid(): string {
  return Date.now().toString();
}

// BizChat API 호출 함수
function getBizChatUrl(): string {
  const useProd = process.env.BIZCHAT_USE_PROD === 'true';
  return useProd ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
}

function getBizChatApiKey(): string {
  const useProd = process.env.BIZCHAT_USE_PROD === 'true';
  const key = useProd ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!key) throw new Error('BizChat API key is not configured');
  return key;
}

// BizChat 통계 응답 타입
interface BizChatStatsData {
  statDate: string;           // 통계 수집 일자 YYYYMMDD
  mdnCnt: number;             // 발송 대상자 수
  dupExcludeCnt: number;      // 타 캠페인 수신자 수
  adRcvExcludeCnt: number;    // 광고 수신 미동의 수신자 수
  sendTryCnt: number;         // 발송 시도자 수
  msgRecvCnt: number;         // 캠페인 메시지 수신자 수 (RCS + VMG)
  rcsMsgRecvCnt: number;      // RCS 메시지 수신자 수
  vmgMsgRecvCnt: number;      // 일반 메시지 수신자 수
  msgNotRecvCnt: number;      // 메시지 미수신자 수
  msgReactCnt: number;        // 메시지 반응자 수 (UA+IP 제한)
  msgReactRatio: string;      // 메시지 반응률 (UA+IP 제한)
  rcsMsgReactCnt: number;     // RCS 메시지 반응자 수 (UA+IP 제한)
  rcsMsgReactRatio: string;   // RCS 메시지 반응률 (UA+IP 제한)
  vmgMsgReactCnt: number;     // 일반 메시지 반응자 수 (UA+IP 제한)
  vmgMsgReactRatio: string;   // 일반 메시지 반응률 (UA+IP 제한)
  msgReactCnt2: number;       // 메시지 반응자 수 (UA만 제한)
  msgReactRatio2: string;     // 메시지 반응률 (UA만 제한)
  rcsMsgReactCnt2: number;    // RCS 메시지 반응자 수 (UA만 제한)
  rcsMsgReactRatio2: string;  // RCS 메시지 반응률 (UA만 제한)
  vmgMsgReactCnt2: number;    // 일반 메시지 반응자 수 (UA만 제한)
  vmgMsgReactRatio2: string;  // 일반 메시지 반응률 (UA만 제한)
  rcsMsgReadCnt: number;      // RCS 메시지 확인자 수
  rcsMsgReadRatio: string;    // RCS 메시지 확인률
  url?: {
    list: Array<{
      msgType: number;        // 메시지 종류
      slideNum: number;       // 슬라이드 번호
      linkType: number;       // 링크 위치 (0: 본문, 1: 버튼, 2: 옵션, 3: fallback)
      linkNum: number;        // 링크 번호
      cnt: number;            // 클릭 횟수
    }>;
  };
  url2?: {
    list: Array<{
      msgType: number;
      slideNum: number;
      linkType: number;
      linkNum: number;
      cnt: number;
    }>;
  };
}

interface BizChatStatsResponse {
  tid: string;
  code: string;
  msg: string;
  data?: BizChatStatsData;
}

// BizChat 캠페인 통계 조회 API 호출
async function fetchCampaignStats(bizchatCampaignId: string): Promise<BizChatStatsResponse> {
  const tid = generateTid();
  const baseUrl = getBizChatUrl();
  const apiKey = getBizChatApiKey();

  const queryParams = new URLSearchParams({
    tid,
    id: bizchatCampaignId,
  });

  const response = await fetch(`${baseUrl}/api/v1/cmpn/stat/read?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ success: false, error: '인증이 필요합니다' });
    }

    const db = getDb();

    if (req.method === 'GET') {
      // 캠페인 ID로 통계 조회
      const { campaignId } = req.query;

      if (!campaignId || typeof campaignId !== 'string') {
        return res.status(400).json({ success: false, error: '캠페인 ID가 필요합니다' });
      }

      // 캠페인 조회 및 권한 확인
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ success: false, error: '캠페인을 찾을 수 없습니다' });
      }

      if (campaign.userId !== user.userId) {
        return res.status(403).json({ success: false, error: '접근 권한이 없습니다' });
      }

      if (!campaign.bizchatCampaignId) {
        return res.status(400).json({ 
          success: false, 
          error: 'BizChat에 등록되지 않은 캠페인입니다' 
        });
      }

      // BizChat 통계 API 호출
      const statsResponse = await fetchCampaignStats(campaign.bizchatCampaignId);

      if (statsResponse.code !== 'S000001') {
        return res.status(400).json({
          success: false,
          error: statsResponse.msg || '통계 조회에 실패했습니다',
          bizChatCode: statsResponse.code,
        });
      }

      // 통계 데이터 반환
      return res.status(200).json({
        success: true,
        data: statsResponse.data,
        meta: {
          campaignId,
          bizchatCampaignId: campaign.bizchatCampaignId,
          refreshedAt: new Date().toISOString(),
        },
      });
    }

    if (req.method === 'POST') {
      const { action, campaignId } = req.body;

      if (action === 'fetchStats') {
        // POST 방식으로도 통계 조회 지원
        if (!campaignId) {
          return res.status(400).json({ success: false, error: '캠페인 ID가 필요합니다' });
        }

        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ success: false, error: '캠페인을 찾을 수 없습니다' });
        }

        if (campaign.userId !== user.userId) {
          return res.status(403).json({ success: false, error: '접근 권한이 없습니다' });
        }

        if (!campaign.bizchatCampaignId) {
          return res.status(400).json({ 
            success: false, 
            error: 'BizChat에 등록되지 않은 캠페인입니다' 
          });
        }

        const statsResponse = await fetchCampaignStats(campaign.bizchatCampaignId);

        if (statsResponse.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            error: statsResponse.msg || '통계 조회에 실패했습니다',
            bizChatCode: statsResponse.code,
          });
        }

        return res.status(200).json({
          success: true,
          data: statsResponse.data,
          meta: {
            campaignId,
            bizchatCampaignId: campaign.bizchatCampaignId,
            refreshedAt: new Date().toISOString(),
          },
        });
      }

      return res.status(400).json({ success: false, error: '지원하지 않는 action입니다' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '서버 오류가 발생했습니다',
    });
  }
}
