import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { verifyUserAuth } from '../_shared/auth';
import { CREDIT_PRODUCTS, type CreditProductType } from '../../../shared/credit-policy';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

function mapGrant(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    transactionId: row.transaction_id,
    productType: row.product_type,
    originalCredits: Number(row.original_credits || 0),
    remainingCredits: Number(row.remaining_credits || 0),
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLedger(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    creditGrantId: row.credit_grant_id,
    transactionId: row.transaction_id,
    campaignId: row.campaign_id,
    type: row.type,
    amountCredits: Number(row.amount_credits || 0),
    balanceAfterCredits: row.balance_after_credits == null ? null : Number(row.balance_after_credits),
    productType: row.product_type,
    idempotencyKey: row.idempotency_key,
    description: row.description,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function getRefundableAmountKrw(lot: { productType: string | null; originalCredits: number; remainingCredits: number }) {
  const productType = lot.productType as CreditProductType | null;
  if (!productType || !(productType in CREDIT_PRODUCTS) || lot.originalCredits <= 0 || lot.remainingCredits <= 0) {
    return 0;
  }

  return Math.floor((CREDIT_PRODUCTS[productType].priceKrw / lot.originalCredits) * lot.remainingCredits);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyUserAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = getDb();
    const [userResult, grantsResult, ledgerResult, recentLedgerResult] = await Promise.all([
      db.execute(sql`SELECT balance FROM users WHERE id = ${auth.userId} LIMIT 1`),
      db.execute(sql`
        SELECT *
        FROM credit_grants
        WHERE user_id = ${auth.userId}
        ORDER BY expires_at ASC, created_at ASC
      `),
      db.execute(sql`
        SELECT *
        FROM credit_ledger
        WHERE user_id = ${auth.userId}
      `),
      db.execute(sql`
        SELECT *
        FROM credit_ledger
        WHERE user_id = ${auth.userId}
        ORDER BY created_at DESC
        LIMIT 20
      `),
    ]);

    const legacyBalance = Number(userResult.rows?.[0]?.balance || 0);
    const lots = (grantsResult.rows || []).map(mapGrant);
    const ledgerEntries = (ledgerResult.rows || []).map(mapLedger);
    const recentLedger = (recentLedgerResult.rows || []).map(mapLedger);
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const activeLots = lots.filter((lot) => {
      const expiresAt = new Date(lot.expiresAt);
      return Number(lot.remainingCredits || 0) > 0 && expiresAt > now;
    });

    const availableCredits = activeLots.reduce(
      (sum, lot) => sum + Number(lot.remainingCredits || 0),
      0,
    );
    const expiringSoonCredits = activeLots
      .filter((lot) => new Date(lot.expiresAt) <= thirtyDaysLater)
      .reduce((sum, lot) => sum + Number(lot.remainingCredits || 0), 0);
    const totalGrantedCredits = lots.reduce(
      (sum, lot) => sum + Number(lot.originalCredits || 0),
      0,
    );
    const grossUsedCredits = ledgerEntries
      .filter((entry) => entry.type === 'use')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amountCredits || 0)), 0);
    const restoredUsedCredits = ledgerEntries
      .filter((entry) => entry.type === 'adjustment' && entry.metadata?.useLedgerId)
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.amountCredits || 0)), 0);
    const totalUsedCredits = Math.max(0, grossUsedCredits - restoredUsedCredits);
    const refundableAmountKrw = activeLots.reduce(
      (sum, lot) => sum + getRefundableAmountKrw(lot),
      0,
    );
    const terminalReservationCampaignIds = new Set(
      ledgerEntries
        .filter((entry) => entry.type === 'use' || entry.type === 'release')
        .map((entry) => entry.campaignId)
        .filter(Boolean),
    );
    const reservedCredits = ledgerEntries
      .filter(
        (entry) =>
          entry.type === 'reserve' &&
          entry.campaignId &&
          !terminalReservationCampaignIds.has(entry.campaignId),
      )
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amountCredits || 0)), 0);
    const hasLedger = lots.length > 0 || recentLedger.length > 0;

    return res.status(200).json({
      enabled: process.env.CREDIT_MODE_ENABLED === 'true',
      effectiveAvailableCredits: hasLedger ? availableCredits : legacyBalance,
      availableCredits,
      reservedCredits,
      expiringSoonCredits,
      totalGrantedCredits,
      totalUsedCredits,
      refundableCredits: availableCredits,
      refundableAmountKrw,
      hasLedger,
      legacyBalance,
      lots,
      recentLedger,
    });
  } catch (error) {
    console.error('[Credits Summary] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch credit summary' });
  }
}
