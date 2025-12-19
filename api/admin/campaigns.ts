import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, ilike, eq, or, desc, and } from 'drizzle-orm';
import { campaigns, users } from './lib/schema';
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
    const { search, status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    
    if (search) {
      conditions.push(or(
        ilike(campaigns.name, `%${search}%`),
        ilike(users.email, `%${search}%`)
      ));
    }

    if (status && status !== 'all') {
      conditions.push(eq(campaigns.status, status as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.userId, users.id))
      .where(whereClause);

    const campaignsList = await db.select({
      id: campaigns.id,
      name: campaigns.name,
      messageType: campaigns.messageType,
      status: campaigns.status,
      statusCode: campaigns.statusCode,
      targetCount: campaigns.targetCount,
      sentCount: campaigns.sentCount,
      budget: campaigns.budget,
      createdAt: campaigns.createdAt,
      userId: campaigns.userId,
      userEmail: users.email,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.userId, users.id))
    .where(whereClause)
    .orderBy(desc(campaigns.createdAt))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      campaigns: campaignsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('[Admin Campaigns] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
}
