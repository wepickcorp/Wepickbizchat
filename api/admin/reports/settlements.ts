import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq, gte, lte, and, desc } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, integer, text } from 'drizzle-orm/pg-core';
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

const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(),
  sentCount: integer("sent_count").default(0),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
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
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (admin.role !== 'super' && admin.role !== 'finance') {
    return res.status(403).json({ error: '권한이 없습니다' });
  }

  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const [chargeResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'charge'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)));

    const [usageResult] = await db.select({ sum: sql<number>`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'usage'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)));

    const [refundResult] = await db.select({ sum: sql<number>`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'refund'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)));

    const [completedCampaignsResult] = await db.select({ 
      count: sql<number>`count(*)`,
      totalSent: sql<number>`COALESCE(SUM(sent_count), 0)`,
      totalBudget: sql<number>`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`,
    })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'completed'), gte(campaigns.completedAt, start), lte(campaigns.completedAt, end)));

    const dailyStats = await db.select({
      date: sql<string>`DATE(created_at)`,
      chargeAmount: sql<number>`COALESCE(SUM(CASE WHEN type = 'charge' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      usageAmount: sql<number>`COALESCE(ABS(SUM(CASE WHEN type = 'usage' THEN CAST(amount AS DECIMAL) ELSE 0 END)), 0)`,
      refundAmount: sql<number>`COALESCE(ABS(SUM(CASE WHEN type = 'refund' THEN CAST(amount AS DECIMAL) ELSE 0 END)), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(gte(transactions.createdAt, start), lte(transactions.createdAt, end)))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(desc(sql`DATE(created_at)`));

    const messageTypeStats = await db.select({
      messageType: campaigns.messageType,
      count: sql<number>`count(*)`,
      totalSent: sql<number>`COALESCE(SUM(sent_count), 0)`,
    })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'completed'), gte(campaigns.completedAt, start), lte(campaigns.completedAt, end)))
    .groupBy(campaigns.messageType);

    return res.status(200).json({
      period: { start, end },
      summary: {
        totalCharge: Number(chargeResult?.sum || 0),
        totalUsage: Number(usageResult?.sum || 0),
        totalRefund: Number(refundResult?.sum || 0),
        netRevenue: Number(chargeResult?.sum || 0) - Number(refundResult?.sum || 0),
        completedCampaigns: Number(completedCampaignsResult?.count || 0),
        totalSentMessages: Number(completedCampaignsResult?.totalSent || 0),
        totalCampaignBudget: Number(completedCampaignsResult?.totalBudget || 0),
      },
      dailyStats,
      messageTypeStats,
    });
  } catch (error) {
    console.error('[Admin Settlements] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch settlement report' });
  }
}
