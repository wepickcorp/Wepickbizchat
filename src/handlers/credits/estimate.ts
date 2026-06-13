import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { calculateCampaignCredits } from '../../../shared/credit-policy';
import { verifyUserAuth } from '../_shared/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

const estimateSchema = z.object({
  targetCount: z.number().int().min(0),
  templateCount: z.number().int().min(1).default(1),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyUserAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = estimateSchema.parse(req.body || {});
    const db = getDb();
    const result = await db.execute(sql`
      SELECT
        COALESCE((
          SELECT SUM(remaining_credits)::integer
          FROM credit_grants
          WHERE user_id = ${auth.userId}
            AND remaining_credits > 0
            AND expires_at > NOW()
        ), 0) AS available_credits,
        COALESCE((
          SELECT balance::integer
          FROM users
          WHERE id = ${auth.userId}
          LIMIT 1
        ), 0) AS legacy_balance,
        EXISTS(
          SELECT 1 FROM credit_grants WHERE user_id = ${auth.userId}
          UNION
          SELECT 1 FROM credit_ledger WHERE user_id = ${auth.userId}
        ) AS has_ledger
    `);
    const row = result.rows?.[0] || {};
    const hasLedger = Boolean(row.has_ledger);
    const availableCredits = hasLedger
      ? Number(row.available_credits || 0)
      : Number(row.legacy_balance || 0);
    const estimate = calculateCampaignCredits({
      targetCount: body.targetCount,
      templateCount: body.templateCount,
    }, availableCredits);

    return res.status(200).json({
      enabled: process.env.CREDIT_MODE_ENABLED === 'true',
      estimate: {
        ...estimate,
        availableCredits,
        canSend: !estimate.isBelowMinimum && estimate.shortageCredits === 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('[Credits Estimate] Error:', error);
    return res.status(500).json({ error: 'Failed to estimate credits' });
  }
}
