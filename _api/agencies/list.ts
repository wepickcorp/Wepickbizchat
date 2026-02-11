import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

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

  try {
    const db = getDb();
    
    const activeAgencies = await db
      .select({
        id: agencies.id,
        name: agencies.name,
      })
      .from(agencies)
      .where(eq(agencies.isActive, true));

    return res.status(200).json({
      agencies: activeAgencies,
    });
  } catch (error) {
    console.error('[Agencies List] Error:', error);
    return res.status(500).json({ error: '대행사 목록 조회 중 오류가 발생했습니다' });
  }
}
