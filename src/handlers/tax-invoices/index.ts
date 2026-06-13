import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, desc, eq } from 'drizzle-orm';
import { pgTable, varchar, timestamp, decimal, text } from 'drizzle-orm/pg-core';
import { createClient } from '@supabase/supabase-js';

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  companyName: varchar("company_name"),
  businessNumber: varchar("business_number"),
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
  buyerRepresentative: varchar("buyer_representative", { length: 50 }),
  buyerEmail: varchar("buyer_email", { length: 100 }),
  buyerAddress: text("buyer_address"),
  status: varchar("status", { length: 20 }).default("requested").notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

async function getAuthenticatedUser(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: '로그인이 필요합니다' });
  }

  const db = getDb();

  if (req.method === 'GET') {
    try {
      const userInvoices = await db
        .select()
        .from(taxInvoices)
        .where(eq(taxInvoices.userId, user.id))
        .orderBy(desc(taxInvoices.createdAt));

      return res.status(200).json(userInvoices);
    } catch (error) {
      console.error('[TaxInvoices GET] Error:', error);
      return res.status(500).json({ error: '세금계산서 내역 조회 중 오류가 발생했습니다' });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        amount,
        buyerBusinessNumber,
        buyerCompanyName,
        buyerRepresentative,
        buyerEmail,
        buyerAddress
      } = req.body || {};

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 1000) {
        return res.status(400).json({ error: '발행 금액은 최소 1,000원 이상이어야 합니다' });
      }
      if (!buyerBusinessNumber || buyerBusinessNumber.replace(/-/g, '').length !== 10) {
        return res.status(400).json({ error: '올바른 사업자등록번호를 입력해주세요 (10자리)' });
      }
      if (!buyerCompanyName || buyerCompanyName.trim().length < 2) {
        return res.status(400).json({ error: '상호명을 입력해주세요' });
      }
      if (!buyerEmail || !buyerEmail.includes('@')) {
        return res.status(400).json({ error: '올바른 이메일 주소를 입력해주세요' });
      }

      const taxAmount = Math.floor(numAmount * 0.1);
      const totalAmount = numAmount + taxAmount;

      const [newInvoice] = await db.insert(taxInvoices).values({
        userId: user.id,
        issueDate: new Date(),
        amount: String(numAmount),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        buyerBusinessNumber: buyerBusinessNumber.replace(/-/g, ''),
        buyerCompanyName: buyerCompanyName.trim(),
        buyerRepresentative: buyerRepresentative?.trim() || null,
        buyerEmail: buyerEmail.trim(),
        buyerAddress: buyerAddress?.trim() || null,
        status: 'requested',
      }).returning();

      return res.status(201).json({
        success: true,
        taxInvoice: newInvoice,
        message: '세금계산서 발행 신청이 접수되었습니다. 영업일 기준 1-2일 내 발행됩니다.',
      });
    } catch (error) {
      console.error('[TaxInvoices POST] Error:', error);
      return res.status(500).json({ error: '세금계산서 신청 중 오류가 발생했습니다' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
