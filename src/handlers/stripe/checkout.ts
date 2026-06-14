import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import Stripe from 'stripe';
import { CREDIT_PRODUCTS, type CreditProductType } from '../../../shared/credit-policy';
import { hasLightCreditGrantInCurrentKstMonthForServerless } from '../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: text('balance').default('0').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

function isCreditProductType(value: unknown): value is CreditProductType {
  return typeof value === 'string' && value in CREDIT_PRODUCTS;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.ENABLE_STRIPE_PAYMENTS !== 'true') {
    return res.status(410).json({ error: 'Stripe payment is disabled. Please use KISPG payment.' });
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const userResult = await db.select().from(users).where(eq(users.id, auth.userId));
    let user = userResult[0];

    if (!user) {
      const insertResult = await db.insert(users).values({
        id: auth.userId,
        email: auth.email,
        balance: '0',
      }).returning();
      user = insertResult[0];
    }

    const { amount, productType } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: '최소 충전 금액은 10,000원입니다' });
    }

    const creditProduct = isCreditProductType(productType) ? CREDIT_PRODUCTS[productType] : null;

    if (process.env.CREDIT_MODE_ENABLED === 'true' && !creditProduct) {
      return res.status(400).json({ error: '크레딧 상품을 선택해주세요' });
    }

    if (creditProduct && creditProduct.priceKrw !== amount) {
      return res.status(400).json({ error: '상품 금액이 올바르지 않습니다' });
    }

    if (process.env.CREDIT_MODE_ENABLED === 'true' && creditProduct?.productType === 'light') {
      if (await hasLightCreditGrantInCurrentKstMonthForServerless(db, auth.userId)) {
        return res.status(400).json({ error: '라이트 충전은 매월 1회만 구매할 수 있습니다' });
      }
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeSecretKey);

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.update(users).set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.REPLIT_DOMAINS?.split(',')[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'krw',
            product_data: {
              name: creditProduct ? `BizChat ${creditProduct.name}` : 'BizChat 잔액 충전',
              description: creditProduct
                ? `${creditProduct.credits.toLocaleString()}C · ${amount.toLocaleString()}원`
                : `${amount.toLocaleString()}원 충전`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/billing?success=true&amount=${amount}`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
      metadata: {
        userId: user.id,
        amount: amount.toString(),
        type: 'balance_charge',
        ...(creditProduct ? {
          productType: creditProduct.productType,
          credits: creditProduct.credits.toString(),
        } : {}),
      },
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
