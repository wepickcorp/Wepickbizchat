import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { users, transactions } from '../../../shared/schema';

const MASTER_BALANCE = '100000000';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema: { users, transactions } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error('[Master Reset] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Master Reset] Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    
    const masterUsers = await db.select()
      .from(users)
      .where(eq(users.isMaster, true));

    if (masterUsers.length === 0) {
      console.log('[Master Reset] No master users found');
      return res.status(200).json({ message: 'No master users to reset', count: 0 });
    }

    const now = new Date();
    const resetResults = [];

    for (const masterUser of masterUsers) {
      const previousBalance = masterUser.balance || '0';
      
      await db.update(users)
        .set({
          balance: MASTER_BALANCE,
          masterResetAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, masterUser.id));

      await db.insert(transactions).values({
        userId: masterUser.id,
        type: 'master_reset',
        amount: MASTER_BALANCE,
        balanceAfter: MASTER_BALANCE,
        description: `마스터 계정 일일 캐시 리셋 (이전 잔액: ${Number(previousBalance).toLocaleString()}원)`,
        paymentMethod: 'system',
      });

      resetResults.push({
        email: masterUser.email,
        previousBalance,
        newBalance: MASTER_BALANCE,
      });

      console.log(`[Master Reset] Reset balance for ${masterUser.email}: ${previousBalance} → ${MASTER_BALANCE}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Master account balances reset successfully',
      count: resetResults.length,
      results: resetResults,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Master Reset] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to reset master balances',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
