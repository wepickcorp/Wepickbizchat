import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { randomUUID } from 'crypto';
import { verifyUserAuth } from '../../_shared/auth';
import {
  getNeededCampaignCredits,
  isCreditModeEnabled,
  startCampaignCreditsForServerless,
} from '../../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  sndNum: text('snd_num'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  sndGoalCnt: integer('snd_goal_cnt'),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  costPerMessage: numeric('cost_per_message'),
  scheduledAt: timestamp('scheduled_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const users = pgTable('users', {
  id: text('id').primaryKey(),
  balance: numeric('balance').default('0').notNull(),
});

const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount').notNull(),
  balanceAfter: numeric('balance_after'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  clickCount: integer('click_count').default(0),
  optOutCount: integer('opt_out_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSimulatedSuccessCount(sentCount: number) {
  return Math.floor(sentCount * (0.85 + Math.random() * 0.12));
}

async function createReportIfMissing(
  db: ReturnType<typeof getDb>,
  input: { campaignId: string; sentCount: number; successCount: number },
) {
  await db.execute(sql`
    INSERT INTO reports (
      id,
      campaign_id,
      sent_count,
      delivered_count,
      success_count,
      failed_count,
      click_count,
      opt_out_count,
      created_at,
      updated_at
    )
    SELECT
      ${randomUUID()},
      ${input.campaignId},
      ${input.sentCount},
      ${input.successCount},
      ${input.successCount},
      ${Math.max(0, input.sentCount - input.successCount)},
      ${Math.floor(input.successCount * (0.02 + Math.random() * 0.05))},
      ${Math.floor(input.successCount * Math.random() * 0.005)},
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM reports WHERE campaign_id = ${input.campaignId}
    )
  `);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Impersonate-Token, X-Impersonate-User-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyUserAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid campaign ID' });

  const db = getDb();

  try {
    let [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.userId !== auth.userId) return res.status(403).json({ error: 'Access denied' });

    const statusCode = Number(campaign.statusCode ?? 0);
    if (statusCode === 30 || statusCode === 40) {
      return res.status(200).json(campaign);
    }
    if (![0, 10, 11].includes(statusCode)) {
      return res.status(400).json({ error: '발송 가능한 상태의 캠페인만 시작할 수 있어요' });
    }
    if (!campaign.sndNum) {
      return res.status(400).json({ error: '발신번호를 선택하면 발송할 수 있어요' });
    }
    if (statusCode !== 11) {
      const [approvedCampaign] = await db.update(campaigns)
        .set({
          statusCode: 11,
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id))
        .returning();
      if (!approvedCampaign) {
        return res.status(400).json({ error: '캠페인 상태를 다시 확인해요' });
      }
      campaign = approvedCampaign;
    }

    // H1: 차감(use)은 예약(reserve)과 동일하게 sndGoalCnt를 기준으로 계산해야
    // "예약된 크레딧과 필요한 크레딧이 일치하지 않습니다" 가드에 걸리지 않는다.
    const sentCount = Number(campaign.sndGoalCnt || campaign.targetCount || 0);
    const successCount = getSimulatedSuccessCount(sentCount);
    const creditEstimate = getNeededCampaignCredits(sentCount);

    if (isCreditModeEnabled()) {
      if (creditEstimate.isBelowMinimum) {
        return res.status(400).json({
          error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString('ko-KR')}건부터 발송할 수 있어요`,
        });
      }

      const creditUseResult = await startCampaignCreditsForServerless(db, {
        userId: auth.userId,
        campaignId: id,
        neededCredits: creditEstimate.neededCredits,
        sentCount,
        successCount,
        description: `캠페인 발송: ${campaign.name}`,
      });

      if (!creditUseResult.success || !creditUseResult.campaign) {
        return res.status(400).json({
          error: creditUseResult.error || '크레딧 차감 중 오류가 발생했습니다',
          creditBalanceAfter: creditUseResult.balanceAfterCredits,
        });
      }

      await createReportIfMissing(db, { campaignId: id, sentCount, successCount });

      return res.status(200).json({
        ...creditUseResult.campaign,
        creditBalanceAfter: creditUseResult.balanceAfterCredits,
        alreadyProcessed: creditUseResult.alreadyProcessed,
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const estimatedCost = sentCount * Number(campaign.costPerMessage || 50);
    const userBalance = Number(user.balance || 0);
    if (userBalance < estimatedCost) {
      return res.status(400).json({ error: '잔액이 부족합니다' });
    }

    const newBalance = userBalance - estimatedCost;
    const [updatedCampaign] = await db.update(campaigns)
      .set({
        statusCode: 30,
        status: 'running',
        sentCount,
        successCount,
        scheduledAt: campaign.scheduledAt || new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();

    await db.update(users)
      .set({ balance: String(newBalance) })
      .where(eq(users.id, auth.userId));

    await db.insert(transactions).values({
      id: randomUUID(),
      userId: auth.userId,
      type: 'usage',
      amount: String(-estimatedCost),
      balanceAfter: String(newBalance),
      description: `캠페인 발송: ${campaign.name}`,
    });

    await createReportIfMissing(db, { campaignId: id, sentCount, successCount });

    return res.status(200).json(updatedCampaign);
  } catch (error) {
    console.error('[Campaign Start] Error:', error);
    return res.status(500).json({
      error: '캠페인 발송 시작 중 오류가 발생했습니다',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
