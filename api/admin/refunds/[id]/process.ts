import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq } from 'drizzle-orm';
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

function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
         req.headers['x-real-ip'] as string || 
         'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (admin.role !== 'super' && admin.role !== 'finance') {
    return res.status(403).json({ error: '권한이 없습니다' });
  }

  const { id } = req.query;
  const { action, adminNote } = req.body;

  if (!action || !['approve', 'reject', 'complete'].includes(action)) {
    return res.status(400).json({ error: '올바른 작업을 선택해주세요' });
  }

  try {
    const db = getDb();

    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id as string)).limit(1);
    if (!refund) {
      return res.status(404).json({ error: '환불 요청을 찾을 수 없습니다' });
    }

    if (refund.status === 'completed') {
      return res.status(400).json({ error: '이미 처리 완료된 환불입니다' });
    }

    let newStatus = refund.status;
    
    if (action === 'approve') {
      newStatus = 'approved';
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'complete') {
      if (refund.status !== 'approved') {
        return res.status(400).json({ error: '승인된 환불만 완료 처리할 수 있습니다' });
      }
      newStatus = 'completed';

      const [user] = await db.select().from(users).where(eq(users.id, refund.userId)).limit(1);
      if (user) {
        const currentBalance = Number(user.balance || 0);
        const refundAmount = Number(refund.amount);
        const newBalance = currentBalance - refundAmount;

        await db.update(users)
          .set({ balance: String(Math.max(0, newBalance)), updatedAt: new Date() })
          .where(eq(users.id, refund.userId));

        await db.insert(transactions).values({
          userId: refund.userId,
          type: 'refund',
          amount: String(-refundAmount),
          balanceAfter: String(Math.max(0, newBalance)),
          description: `환불 완료 (${refund.reason})`,
          paymentMethod: 'bank_transfer',
        });
      }
    }

    await db.update(refunds)
      .set({
        status: newStatus,
        adminId: admin.id,
        adminNote: adminNote || refund.adminNote,
        processedAt: ['approved', 'rejected', 'completed'].includes(newStatus) ? new Date() : refund.processedAt,
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, id as string));

    await db.insert(adminLogs).values({
      adminId: admin.id,
      action: `refund_${action}`,
      targetType: 'refund',
      targetId: id as string,
      details: { 
        amount: refund.amount, 
        previousStatus: refund.status,
        newStatus,
        adminNote,
      },
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({ success: true, status: newStatus });
  } catch (error) {
    console.error('[Admin Refund Process] Error:', error);
    return res.status(500).json({ error: '환불 처리 중 오류가 발생했습니다' });
  }
}
