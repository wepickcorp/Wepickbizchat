import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import {
  isCreditModeEnabled,
  releaseReservedCampaignCreditsForServerless,
} from '../../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  updatedAt: timestamp('updated_at').defaultNow(),
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
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
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

// BizChat API URL 설정 (SK 담당자 요청: 개발 완료 전까지 개발 URL 사용)
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// 캠페인 취소 가능 상태 코드 (연동규격서 기준)
// 검수요청(1), 검수완료(2), 승인요청(10), 승인완료(11), 반려(17), 발송준비(20)
const CANCELLABLE_STATUS_CODES = [1, 2, 10, 11, 17, 20];

// 상태 코드별 한글 명칭
const STATUS_NAMES: Record<number, string> = {
  0: '임시등록',
  1: '검수요청',
  2: '검수완료',
  5: '임시저장',
  10: '승인요청',
  11: '승인완료',
  17: '반려',
  20: '발송준비',
  30: '발송중',
  40: '발송완료',
  90: '취소',
};

/**
 * BizChat 캠페인 취소 API 호출 (연동규격서 7.5)
 *
 * URL: /api/v1/cmpn/cancel
 * Method: POST
 * Header: Authorization: {token}
 * Query Parameter:
 *   - tid (Y): transaction ID
 *   - id (Y): 대상 캠페인 아이디 (BizChat 캠페인 ID)
 *
 * 취소 가능 상태: 검수요청(1), 검수완료(2), 승인요청(10), 승인완료(11), 반려(17), 발송준비(20)
 */
async function callBizChatCancelAPI(bizchatCampaignId: string, useProduction: boolean = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction
    ? process.env.BIZCHAT_PROD_API_KEY
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    console.error('[BizChat Cancel] API key not configured');
    throw new Error('BizChat API key not configured');
  }

  // Transaction ID 생성 (현재 시간 밀리초)
  const tid = Date.now().toString();

  // 연동규격서 형식: Query Parameter로 tid와 id 전달
  const url = `${baseUrl}/api/v1/cmpn/cancel?tid=${encodeURIComponent(tid)}&id=${encodeURIComponent(bizchatCampaignId)}`;

  console.log(`[BizChat Cancel] Request URL: ${url}`);
  console.log(`[BizChat Cancel] Campaign ID: ${bizchatCampaignId}`);
  console.log(`[BizChat Cancel] Transaction ID: ${tid}`);
  console.log(`[BizChat Cancel] Using ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'} environment`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
    });

    const responseText = await response.text();
    console.log(`[BizChat Cancel] Response Status: ${response.status}`);
    console.log(`[BizChat Cancel] Response Body: ${responseText}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[BizChat Cancel] Failed to parse response as JSON');
      data = {
        tid: tid,
        code: `HTTP_${response.status}`,
        msg: responseText || 'Empty response'
      };
    }

    // 응답 구조 검증 (연동규격서: tid, code, msg)
    const result = {
      tid: data.tid || tid,
      code: data.code || `HTTP_${response.status}`,
      msg: data.msg || data.message || 'Unknown response',
      httpStatus: response.status,
      raw: data,
    };

    console.log(`[BizChat Cancel] Parsed Result:`, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('[BizChat Cancel] Network error:', error);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 인증 검증
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  console.log(`[Cancel] User ${auth.userId} requested to cancel campaign ${id}`);

  const db = getDb();

  try {
    // 캠페인 조회
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
    const campaign = campaignResult[0];

    if (!campaign) {
      console.log(`[Cancel] Campaign ${id} not found`);
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다' });
    }

    // 소유권 검증
    if (campaign.userId !== auth.userId) {
      console.log(`[Cancel] User ${auth.userId} is not the owner of campaign ${id}`);
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    // 상태 검증
    const currentStatusCode = campaign.statusCode ?? 0;
    console.log(`[Cancel] Campaign ${id} current status: ${currentStatusCode} (${STATUS_NAMES[currentStatusCode] || 'Unknown'})`);

    if (!CANCELLABLE_STATUS_CODES.includes(currentStatusCode)) {
      const statusName = STATUS_NAMES[currentStatusCode] || `상태코드 ${currentStatusCode}`;
      console.log(`[Cancel] Campaign ${id} cannot be cancelled from status ${statusName}`);
      return res.status(400).json({
        error: `현재 상태(${statusName})에서는 취소할 수 없습니다.`,
        detail: '취소 가능 상태: 검수요청(1), 검수완료(2), 승인요청(10), 승인완료(11), 반려(17), 발송준비(20)',
        currentStatusCode,
        cancellableStatusCodes: CANCELLABLE_STATUS_CODES,
      });
    }

    // BizChat에 등록된 캠페인인 경우 BizChat API 호출
    if (campaign.bizchatCampaignId) {
      console.log(`[Cancel] Calling BizChat cancel API for bizchatCampaignId: ${campaign.bizchatCampaignId}`);

      const useProduction = process.env.BIZCHAT_USE_PROD === 'true';

      try {
        const bizchatResult = await callBizChatCancelAPI(campaign.bizchatCampaignId, useProduction);

        // 성공 코드: S000001
        if (bizchatResult.code !== 'S000001') {
          console.error(`[Cancel] BizChat API returned error: ${bizchatResult.code} - ${bizchatResult.msg}`);
          return res.status(400).json({
            error: `BizChat 취소 실패: ${bizchatResult.msg}`,
            bizchatError: {
              tid: bizchatResult.tid,
              code: bizchatResult.code,
              msg: bizchatResult.msg,
            },
          });
        }

        console.log(`[Cancel] BizChat cancel API succeeded for campaign ${campaign.bizchatCampaignId}`);
      } catch (bizchatError) {
        console.error('[Cancel] BizChat API call failed:', bizchatError);
        return res.status(500).json({
          error: 'BizChat 서버 연결 실패',
          detail: bizchatError instanceof Error ? bizchatError.message : 'Network error',
        });
      }
    } else {
      console.log(`[Cancel] Campaign ${id} has no bizchatCampaignId, skipping BizChat API call`);
    }

    let creditRelease: Awaited<ReturnType<typeof releaseReservedCampaignCreditsForServerless>> | null = null;

    if (isCreditModeEnabled()) {
      creditRelease = await releaseReservedCampaignCreditsForServerless(db, {
        userId: auth.userId,
        campaignId: id,
        description: `캠페인 취소로 예약 크레딧 해제 (${campaign.name})`,
        statusCode: 25,
        status: 'cancelled',
      });

      if (!creditRelease.success) {
        return res.status(400).json({ error: creditRelease.error });
      }
    }

    // 로컬 DB 상태 업데이트
    const updatedResult = isCreditModeEnabled()
      ? await db.select().from(campaigns).where(eq(campaigns.id, id))
      : await db.update(campaigns)
        .set({
          statusCode: 25,
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id))
        .returning();

    console.log(`[Cancel] Campaign ${id} cancelled successfully in local DB`);

    return res.status(200).json({
      success: true,
      message: '캠페인이 취소되었습니다',
      campaign: updatedResult[0],
      ...(creditRelease && {
        releasedCredits: creditRelease.releasedCredits,
        creditBalanceAfter: creditRelease.balanceAfterCredits,
      }),
    });

  } catch (error) {
    console.error('[Cancel] Unexpected error:', error);
    return res.status(500).json({
      error: '캠페인 취소 중 오류가 발생했습니다',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
