import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq, gte, and } from 'drizzle-orm';
import { users, campaigns, transactions } from './lib/schema';
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = Number(totalUsersResult?.count || 0);

    const [newUsersTodayResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, today));
    const newUsersToday = Number(newUsersTodayResult?.count || 0);

    const [activeCampaignsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(eq(campaigns.status, 'running'));
    const activeCampaigns = Number(activeCampaignsResult?.count || 0);

    const [revenueTodayResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'charge'), gte(transactions.createdAt, today)));
    const revenueToday = Number(revenueTodayResult?.sum || 0);

    const [totalRevenueResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(eq(transactions.type, 'charge'));
    const totalRevenue = Number(totalRevenueResult?.sum || 0);

    const [totalSentResult] = await db.select({ sum: sql<number>`COALESCE(SUM(sent_count), 0)` })
      .from(campaigns);
    const totalSent = Number(totalSentResult?.sum || 0);

    return res.status(200).json({
      totalUsers,
      newUsersToday,
      activeCampaigns,
      revenueToday,
      totalRevenue,
      totalSent,
    });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
