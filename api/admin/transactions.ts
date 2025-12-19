import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, ilike, eq, gte, and, desc } from 'drizzle-orm';
import { transactions, users } from '../../shared/schema';
import { verifyAdminToken } from './lib/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const { search, type, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayChargeResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'charge'), gte(transactions.createdAt, today)));

    const [todayUsageResult] = await db.select({ sum: sql<number>`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'usage'), gte(transactions.createdAt, today)));

    const [monthlyTotalResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'charge'), gte(transactions.createdAt, monthStart)));

    const conditions = [];
    
    if (search) {
      conditions.push(ilike(users.email, `%${search}%`));
    }

    if (type && type !== 'all') {
      conditions.push(eq(transactions.type, type as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .where(whereClause);

    const transactionsList = await db.select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      balanceAfter: transactions.balanceAfter,
      description: transactions.description,
      paymentMethod: transactions.paymentMethod,
      createdAt: transactions.createdAt,
      userId: transactions.userId,
      userEmail: users.email,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.userId, users.id))
    .where(whereClause)
    .orderBy(desc(transactions.createdAt))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      transactions: transactionsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      todayCharge: Number(todayChargeResult?.sum || 0),
      todayUsage: Number(todayUsageResult?.sum || 0),
      monthlyTotal: Number(monthlyTotalResult?.sum || 0),
    });
  } catch (error) {
    console.error('[Admin Transactions] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
}
