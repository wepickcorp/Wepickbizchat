import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, desc, eq, ilike, or } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, integer, text, jsonb } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  priority: integer("priority").default(0),
  isPublished: boolean("is_published").default(false),
  isPinned: boolean("is_pinned").default(false),
  authorId: varchar("author_id").notNull(),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);
  if (!verified) return null;
  try {
    const db = getDb();
    const admin = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  if (req.method === 'GET') {
    try {
      const { search, page = '1', limit = '20' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, parseInt(limit as string));
      const offset = (pageNum - 1) * limitNum;

      let whereClause;
      if (search) {
        whereClause = or(
          ilike(announcements.title, `%${search}%`),
          ilike(announcements.content, `%${search}%`)
        );
      }

      const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(announcements)
        .where(whereClause);

      const list = await db.select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        category: announcements.category,
        priority: announcements.priority,
        isPublished: announcements.isPublished,
        isPinned: announcements.isPinned,
        authorId: announcements.authorId,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
        createdAt: announcements.createdAt,
        authorName: admins.name,
      })
      .from(announcements)
      .leftJoin(admins, eq(announcements.authorId, admins.id))
      .where(whereClause)
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
      .limit(limitNum)
      .offset(offset);

      return res.status(200).json({
        announcements: list,
        total: Number(countResult?.count || 0),
        page: pageNum,
        limit: limitNum,
      });
    } catch (error) {
      console.error('[Admin Announcements GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch announcements' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { title, content, category, priority, isPublished, isPinned, expiresAt } = req.body;

      if (!title || !content) {
        return res.status(400).json({ error: '제목과 내용을 입력해주세요' });
      }

      const [newAnnouncement] = await db.insert(announcements).values({
        title,
        content,
        category: category || 'general',
        priority: priority || 0,
        isPublished: isPublished || false,
        isPinned: isPinned || false,
        authorId: admin.id,
        publishedAt: isPublished ? new Date() : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }).returning();

      return res.status(201).json({ success: true, announcement: newAnnouncement });
    } catch (error) {
      console.error('[Admin Announcements POST] Error:', error);
      return res.status(500).json({ error: 'Failed to create announcement' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
