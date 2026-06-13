import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, decimal, serial, varchar } from 'drizzle-orm/pg-core';
import {
  getBizChatCallbackCreditPlan,
  readBizChatCallbackCounts,
  type BizChatStateCallbackPayload,
} from '../../../shared/bizchat-callback';
import {
  isCreditModeEnabled,
  releaseReservedCampaignCreditsForServerless,
  restoreUsedCampaignCreditsForServerless,
} from '../../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: varchar('message_type', { length: 10 }),
  bizchatCampaignId: text('bizchat_campaign_id'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  targetCount: integer('target_count').default(0),
  settleCnt: integer('settle_cnt').default(0),
  sentCount: integer('sent_count').default(0),
  successCount: integer('success_count').default(0),
  costPerMessage: decimal('cost_per_message', { precision: 10, scale: 0 }).default('100'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const users = pgTable('users', {
  id: varchar('id').primaryKey(),
  balance: decimal('balance', { precision: 12, scale: 0 }).default('0'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  referenceId: text('reference_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 메시지 유형별 단가
const MESSAGE_PRICES: Record<string, number> = { LMS: 100, MMS: 120, RCS: 100 };

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

// BizChat 상태 코드 매핑 (문서 v0.29.0 규격)
const STATUS_CODE_MAP: Record<number, { status: string; label: string }> = {
  0: { status: 'temp_registered', label: '임시 등록' },
  1: { status: 'inspection_requested', label: '검수 요청' },
  2: { status: 'inspection_completed', label: '검수 완료' },
  10: { status: 'approval_requested', label: '승인 요청' },
  11: { status: 'approved', label: '승인 완료' },
  17: { status: 'rejected', label: '반려' },
  20: { status: 'send_ready', label: '발송 준비' },
  25: { status: 'cancelled', label: '취소' },
  30: { status: 'running', label: '진행중' },
  35: { status: 'stopped', label: '중단' },
  40: { status: 'completed', label: '종료' },
};

// Callback 인증 검증
function verifyCallbackAuth(req: VercelRequest): boolean {
  const authKey = process.env.BIZCHAT_CALLBACK_AUTH_KEY;
  if (!authKey) {
    console.warn('[Callback] BIZCHAT_CALLBACK_AUTH_KEY not configured - skipping auth');
    return true;
  }

  // BizChat에서 전송하는 인증 헤더 확인
  const providedKey = req.headers['bizchat-callback-auth-key'] ||
                      req.headers['x-auth-key'] ||
                      req.headers['authorization'];

  if (providedKey === authKey) {
    return true;
  }

  console.warn('[Callback] Auth key mismatch');
  return false;
}

// BizChat 캠페인 상태 변경 Callback 페이로드 (문서 규격)
interface BizChatStateCallback extends BizChatStateCallbackPayload {
  id: string;              // BizChat 캠페인 ID
  state: number;           // 상태 코드
  stateUpdateDate: number; // 상태 변경 일시 (unix timestamp)
  stateReason: string;     // 상태 사유 (반려 시 사유 포함)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, bizchat-callback-auth-key, X-Auth-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 인증 검증
  if (!verifyCallbackAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body as BizChatStateCallback;

    console.log('[Callback] Received state change:', JSON.stringify(payload));

    // 필수 필드 검증 (문서 규격)
    if (!payload.id || payload.state === undefined) {
      return res.status(400).json({
        error: 'Invalid payload',
        required: ['id', 'state'],
        received: payload,
      });
    }

    const db = getDb();

    // BizChat 캠페인 ID로 내부 캠페인 찾기
    const campaignResult = await db.select()
      .from(campaigns)
      .where(eq(campaigns.bizchatCampaignId, payload.id));

    if (campaignResult.length === 0) {
      console.warn(`[Callback] Campaign not found for bizchat ID: ${payload.id}`);
      // BizChat에 200 응답 반환 (재시도 방지)
      return res.status(200).json({
        success: false,
        message: 'Campaign not found in local database',
        bizchatCampaignId: payload.id,
      });
    }

    const campaign = campaignResult[0];
    const statusInfo = STATUS_CODE_MAP[payload.state] || {
      status: 'unknown',
      label: `상태코드: ${payload.state}`
    };

    // 캠페인 상태 업데이트
    const updateData: Record<string, unknown> = {
      statusCode: payload.state,
      status: statusInfo.status,
      updatedAt: new Date(),
    };
    const observedCounts = readBizChatCallbackCounts(payload);
    const { sendCnt, successCnt, settleCnt } = observedCounts;

    console.log('[Callback] Observed count fields:', JSON.stringify(observedCounts));

    if (sendCnt !== undefined) {
      updateData.sentCount = sendCnt;
    }

    if (successCnt !== undefined) {
      updateData.successCount = successCnt;
    }

    if (settleCnt !== undefined) {
      updateData.settleCnt = settleCnt;
    }

    await db.update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, campaign.id));

    console.log(`[Callback] Updated campaign ${campaign.id}: ${statusInfo.status} (state=${payload.state})`);
    let creditAction: Record<string, unknown> = { type: 'none' };

    if (isCreditModeEnabled() && (payload.state === 17 || payload.state === 25)) {
      try {
        const releaseResult = await releaseReservedCampaignCreditsForServerless(db, {
          userId: campaign.userId,
          campaignId: campaign.id,
          description: `BizChat ${statusInfo.label}로 예약 크레딧 해제`,
          statusCode: payload.state,
          status: statusInfo.status,
        });

        if (!releaseResult.success) {
          console.error('[Callback] Error releasing reserved credits:', releaseResult.error);
          creditAction = {
            type: 'release_failed',
            error: releaseResult.error,
          };
        } else if (releaseResult.releasedCredits > 0) {
          console.log(`[Callback] Released ${releaseResult.releasedCredits} reserved credits for campaign ${campaign.id}`);
          creditAction = {
            type: 'release',
            releasedCredits: releaseResult.releasedCredits,
          };
        } else {
          creditAction = {
            type: 'release_noop',
            releasedCredits: 0,
          };
        }
      } catch (releaseError) {
        console.error('[Callback] Error releasing reserved credits:', releaseError);
        creditAction = {
          type: 'release_failed',
          error: releaseError instanceof Error ? releaseError.message : 'Unknown release error',
        };
      }
    }

    if (isCreditModeEnabled() && (payload.state === 35 || payload.state === 40)) {
      const targetCount = Number(campaign.targetCount || 0);
      const creditPlan = getBizChatCallbackCreditPlan({
        state: payload.state,
        targetCount,
        observedCounts,
      });

      if (creditPlan.type === 'restore_skipped_no_count') {
        console.warn(`[Callback] No chargeable count found for campaign ${campaign.id}; skipping automatic credit restore`);
        creditAction = {
          type: 'restore_skipped_no_count',
          targetCount: creditPlan.targetCount,
          countSources: creditPlan.countSources,
        };
      }

      if (creditPlan.type === 'restore') {
        try {
          const restoreResult = await restoreUsedCampaignCreditsForServerless(db, {
            userId: campaign.userId,
            campaignId: campaign.id,
            reason: creditPlan.reason,
            description: creditPlan.chargeableCount === 0
              ? `SKT 접수 실패 복구: ${campaign.name}`
              : `잔여 발송분 복구: ${campaign.name}`,
            restoreCredits: creditPlan.restoreCredits,
            statusCode: payload.state,
            status: statusInfo.status,
          });

          if (restoreResult.restoredCredits > 0) {
            console.log(
              `[Callback] Restored ${restoreResult.restoredCredits} credits for campaign ${campaign.id} (${creditPlan.chargeableCount}/${creditPlan.targetCount} chargeable)`,
            );
          }
          creditAction = {
            type: 'restore',
            reason: creditPlan.reason,
            targetCount: creditPlan.targetCount,
            chargeableCount: creditPlan.chargeableCount,
            restoreCredits: creditPlan.restoreCredits,
            restoredCredits: restoreResult.restoredCredits,
          };
        } catch (restoreError) {
          console.error('[Callback] Error restoring used credits:', restoreError);
          creditAction = {
            type: 'restore_failed',
            targetCount: creditPlan.targetCount,
            chargeableCount: creditPlan.chargeableCount,
            error: restoreError instanceof Error ? restoreError.message : 'Unknown restore error',
          };
        }
      }
    }

    // 발송 완료(state=40) 또는 중단(state=35) 시 비용 차감
    if (!isCreditModeEnabled() && (payload.state === 40 || payload.state === 35)) {
      try {
        // 중복 차감 방지: 트랜잭션 테이블에서 이미 차감 기록이 있는지 확인
        const existingSpend = await db.select()
          .from(transactions)
          .where(eq(transactions.referenceId, campaign.id));

        const alreadyCharged = existingSpend.some(t => t.type === 'spend');

        if (alreadyCharged) {
          console.log(`[Callback] Skipping duplicate charge for campaign ${campaign.id} (already charged)`);
        } else {
          // 사용자 정보 조회
          const userResult = await db.select().from(users).where(eq(users.id, campaign.userId));
          if (userResult.length > 0) {
            const user = userResult[0];
            const currentBalance = parseFloat(user.balance as string || '0');

            // 실제 발송 건수 기준으로 비용 계산
            const sentCount = campaign.successCount || campaign.sentCount || 0;
            const messageType = campaign.messageType || 'LMS';
            const costPerMessage = MESSAGE_PRICES[messageType] || MESSAGE_PRICES.LMS;
            const totalCost = sentCount * costPerMessage;

            if (totalCost > 0 && currentBalance > 0) {
              // 실제 차감 금액은 잔액을 초과할 수 없음
              const actualDeduction = Math.min(totalCost, currentBalance);
              const newBalance = currentBalance - actualDeduction;

              // 트랜잭션 먼저 기록 (중복 방지의 핵심)
              await db.insert(transactions).values({
                userId: campaign.userId,
                type: 'spend',
                amount: (-actualDeduction).toString(),
                balanceAfter: newBalance.toString(),
                description: `캠페인 발송 비용 (${campaign.name})`,
                referenceId: campaign.id,
              });

              // 잔액 차감
              await db.update(users).set({
                balance: newBalance.toString(),
                updatedAt: new Date(),
              }).where(eq(users.id, campaign.userId));

              console.log(`[Callback] Deducted ${actualDeduction} KRW from user ${campaign.userId} for campaign ${campaign.id} (${sentCount} messages × ${costPerMessage} KRW)`);

              if (actualDeduction < totalCost) {
                console.warn(`[Callback] Insufficient balance: charged ${actualDeduction} of ${totalCost} KRW`);
              }
            } else if (totalCost === 0) {
              console.log(`[Callback] No charge needed for campaign ${campaign.id} (0 messages sent)`);
            }
          }
        }
      } catch (deductError) {
        console.error('[Callback] Error deducting balance:', deductError);
        // 비용 차감 실패해도 상태 업데이트는 성공으로 처리
      }
    }

    // BizChat에 HTTP 200 응답 필수
    return res.status(200).json({
      success: true,
      campaignId: campaign.id,
      bizchatCampaignId: payload.id,
      state: payload.state,
      status: statusInfo.status,
      label: statusInfo.label,
      observedCounts,
      creditAction,
    });

  } catch (error) {
    console.error('[Callback] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
