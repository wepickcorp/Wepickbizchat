import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, desc, eq, ilike, or, and } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, text, jsonb } from 'drizzle-orm/pg-core';
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

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  transactionId: varchar("transaction_id"),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  adminId: varchar("admin_id"),
  adminNote: text("admin_note"),
  bankName: varchar("bank_name", { length: 50 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountHolder: varchar("account_holder", { length: 50 }),
  processedAt: timestamp("processed_at"),
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

  try {
    const db = getDb();
    const { search, status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (search) {
      conditions.push(ilike(users.email, `%${search}%`));
    }
    if (status && status !== 'all') {
      conditions.push(eq(refunds.status, status as string));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [pendingCount] = await db.select({ count: sql<number>`count(*)` })
      .from(refunds)
      .where(eq(refunds.status, 'pending'));

    const [totalAmountResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(refunds)
      .where(eq(refunds.status, 'completed'));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(refunds)
      .leftJoin(users, eq(refunds.userId, users.id))
      .where(whereClause);

    const list = await db.select({
      id: refunds.id,
      userId: refunds.userId,
      amount: refunds.amount,
      reason: refunds.reason,
      status: refunds.status,
      adminNote: refunds.adminNote,
      bankName: refunds.bankName,
      accountNumber: refunds.accountNumber,
      accountHolder: refunds.accountHolder,
      processedAt: refunds.processedAt,
      createdAt: refunds.createdAt,
      userEmail: users.email,
    })
    .from(refunds)
    .leftJoin(users, eq(refunds.userId, users.id))
    .where(whereClause)
    .orderBy(desc(refunds.createdAt))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      refunds: list,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      pendingCount: Number(pendingCount?.count || 0),
      totalRefunded: Number(totalAmountResult?.sum || 0),
    });
  } catch (error) {
    console.error('[Admin Refunds] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch refunds' });
  }
}
