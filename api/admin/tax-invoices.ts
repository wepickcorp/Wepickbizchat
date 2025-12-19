import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, desc, eq, ilike, gte, and } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, text } from 'drizzle-orm/pg-core';
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
  companyName: varchar("company_name"),
});

const taxInvoices = pgTable("tax_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  transactionId: varchar("transaction_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).unique(),
  issueDate: timestamp("issue_date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 0 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 0 }).notNull(),
  buyerBusinessNumber: varchar("buyer_business_number", { length: 20 }),
  buyerCompanyName: varchar("buyer_company_name", { length: 100 }),
  buyerEmail: varchar("buyer_email", { length: 100 }),
  status: varchar("status", { length: 20 }).default("issued").notNull(),
  pdfUrl: text("pdf_url"),
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
    const { search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (search) {
      conditions.push(ilike(users.email, `%${search}%`));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [monthlyCountResult] = await db.select({ count: sql<number>`count(*)` })
      .from(taxInvoices)
      .where(gte(taxInvoices.issueDate, monthStart));

    const [monthlyAmountResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0)` })
      .from(taxInvoices)
      .where(gte(taxInvoices.issueDate, monthStart));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(taxInvoices)
      .leftJoin(users, eq(taxInvoices.userId, users.id))
      .where(whereClause);

    const list = await db.select({
      id: taxInvoices.id,
      invoiceNumber: taxInvoices.invoiceNumber,
      issueDate: taxInvoices.issueDate,
      amount: taxInvoices.amount,
      taxAmount: taxInvoices.taxAmount,
      totalAmount: taxInvoices.totalAmount,
      buyerBusinessNumber: taxInvoices.buyerBusinessNumber,
      buyerCompanyName: taxInvoices.buyerCompanyName,
      buyerEmail: taxInvoices.buyerEmail,
      status: taxInvoices.status,
      pdfUrl: taxInvoices.pdfUrl,
      createdAt: taxInvoices.createdAt,
      userId: taxInvoices.userId,
      userEmail: users.email,
    })
    .from(taxInvoices)
    .leftJoin(users, eq(taxInvoices.userId, users.id))
    .where(whereClause)
    .orderBy(desc(taxInvoices.issueDate))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      taxInvoices: list,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      monthlyCount: Number(monthlyCountResult?.count || 0),
      monthlyAmount: Number(monthlyAmountResult?.sum || 0),
    });
  } catch (error) {
    console.error('[Admin Tax Invoices] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch tax invoices' });
  }
}
