import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { randomUUID, createHmac } from 'crypto';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: text('balance').default('0').notNull(),
});

const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: text('amount').notNull(),
  balanceAfter: text('balance_after'),
  description: text('description'),
  paymentMethod: text('payment_method'),
  createdAt: timestamp('created_at').defaultNow(),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const allowDirectCharge = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DIRECT_CHARGE === 'true';
  if (!allowDirectCharge) {
    return res.status(403).json({
      error: 'Direct charge API is disabled. Please use payment checkout.',
    });
  }

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = getDb();
    const userResult = await db.select().from(users).where(eq(users.id, auth.userId));
    const user = userResult[0];

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { amount, paymentMethod } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: 'Minimum charge amount is 10,000 KRW' });
    }

    const currentBalance = parseFloat(user.balance || '0');
    const newBalance = currentBalance + amount;

    const transaction = await db.insert(transactions).values({
      id: randomUUID(),
      userId: auth.userId,
      type: 'charge',
      amount: amount.toString(),
      balanceAfter: newBalance.toString(),
      description: '잔액 충전',
      paymentMethod: paymentMethod || 'card',
    }).returning();

    await db.update(users).set({ balance: newBalance.toString() }).where(eq(users.id, auth.userId));

    return res.status(201).json(transaction[0]);
  } catch (error) {
    console.error('Error processing charge:', error);
    return res.status(500).json({ error: 'Failed to process charge' });
  }
}
