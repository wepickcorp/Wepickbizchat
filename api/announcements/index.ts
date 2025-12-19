import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql, desc, lte, gte, or, isNull, and } from 'drizzle-orm';
import { pgTable, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).default("info").notNull(),
  isActive: boolean("is_active").default(true),
  isPinned: boolean("is_pinned").default(false),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
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
    const now = new Date();
    
    const activeAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.isActive, true),
          or(isNull(announcements.startDate), lte(announcements.startDate, now)),
          or(isNull(announcements.endDate), gte(announcements.endDate, now))
        )
      )
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
      .limit(5);

    return res.status(200).json(activeAnnouncements);
  } catch (error) {
    console.error('[Announcements] Error:', error);
    return res.status(500).json({ error: '공지사항 조회 중 오류가 발생했습니다' });
  }
}
