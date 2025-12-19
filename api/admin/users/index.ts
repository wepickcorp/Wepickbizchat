import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, ilike, or, desc } from 'drizzle-orm';
import { users } from '../../../shared/schema';
import { verifyAdminToken } from '../lib/auth';

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
    const { search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    let whereClause;
    if (search) {
      whereClause = or(
        ilike(users.email, `%${search}%`),
        ilike(users.companyName, `%${search}%`)
      );
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const usersList = await db.select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limitNum)
      .offset(offset);

    return res.status(200).json({
      users: usersList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('[Admin Users] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
}
