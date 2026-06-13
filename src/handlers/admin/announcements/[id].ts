import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq } from 'drizzle-orm';
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

const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
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

function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         req.headers['x-real-ip'] as string ||
         'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const db = getDb();

  if (req.method === 'GET') {
    try {
      const [announcement] = await db.select()
        .from(announcements)
        .where(eq(announcements.id, id as string))
        .limit(1);

      if (!announcement) {
        return res.status(404).json({ error: '공지사항을 찾을 수 없습니다' });
      }

      return res.status(200).json(announcement);
    } catch (error) {
      console.error('[Admin Announcement GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch announcement' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { title, content, category, priority, isPublished, isPinned, expiresAt } = req.body;

      const [existing] = await db.select().from(announcements).where(eq(announcements.id, id as string)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: '공지사항을 찾을 수 없습니다' });
      }

      const wasPublished = existing.isPublished;
      const [updated] = await db.update(announcements)
        .set({
          title: title || existing.title,
          content: content || existing.content,
          category: category || existing.category,
          priority: priority !== undefined ? priority : existing.priority,
          isPublished: isPublished !== undefined ? isPublished : existing.isPublished,
          isPinned: isPinned !== undefined ? isPinned : existing.isPinned,
          publishedAt: !wasPublished && isPublished ? new Date() : existing.publishedAt,
          expiresAt: expiresAt ? new Date(expiresAt) : existing.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(announcements.id, id as string))
        .returning();

      await db.insert(adminLogs).values({
        adminId: admin.id,
        action: 'announcement_update',
        targetType: 'announcement',
        targetId: id as string,
        details: { title: updated.title },
        ipAddress: getClientIp(req),
      });

      return res.status(200).json({ success: true, announcement: updated });
    } catch (error) {
      console.error('[Admin Announcement PUT] Error:', error);
      return res.status(500).json({ error: 'Failed to update announcement' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const [existing] = await db.select().from(announcements).where(eq(announcements.id, id as string)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: '공지사항을 찾을 수 없습니다' });
      }

      await db.delete(announcements).where(eq(announcements.id, id as string));

      await db.insert(adminLogs).values({
        adminId: admin.id,
        action: 'announcement_delete',
        targetType: 'announcement',
        targetId: id as string,
        details: { title: existing.title },
        ipAddress: getClientIp(req),
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Admin Announcement DELETE] Error:', error);
      return res.status(500).json({ error: 'Failed to delete announcement' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
