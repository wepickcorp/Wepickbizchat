import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import Stripe from 'stripe';
import { CREDIT_PRODUCTS, type CreditProductType } from '../../../shared/credit-policy';
import { grantPurchasedCreditsForServerless } from '../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  balance: text('balance').default('0').notNull(),
});

const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: text('amount').notNull(),
  balanceAfter: text('balance_after'),
  description: text('description'),
  stripeSessionId: text('stripe_session_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function isCreditProductType(value: unknown): value is CreditProductType {
  return typeof value === 'string' && value in CREDIT_PRODUCTS;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeSecretKey);

    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }
    } else {
      event = JSON.parse(buf.toString()) as Stripe.Event;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const amount = parseInt(session.metadata?.amount || '0');
      const productType = isCreditProductType(session.metadata?.productType)
        ? session.metadata.productType
        : null;

      if (userId && amount > 0) {
        const db = getDb();
        const creditModeProduct = process.env.CREDIT_MODE_ENABLED === 'true' && productType;

        if (creditModeProduct) {
          const userCheck = await db.execute(sql`
            SELECT id, COALESCE(balance, '0')::numeric AS balance
            FROM users
            WHERE id = ${userId}
            LIMIT 1
          `);
          const targetUser = userCheck.rows?.[0];
          if (!targetUser) {
            console.error(`User ${userId} not found`);
            throw new Error(`Stripe checkout user not found: ${userId}`);
          }

          const product = CREDIT_PRODUCTS[productType];
          const paymentReference = `stripe:${session.id}`;
          const grantResult = await grantPurchasedCreditsForServerless(db, {
            userId,
            transactionId: null,
            productType,
            paymentReference,
            metadata: { sessionId: session.id },
          });

          if (!grantResult.success && !grantResult.alreadyProcessed) {
            const reason = grantResult.lightLimitBlocked ? 'light monthly limit blocked' : grantResult.error;
            throw new Error(`Failed to grant Stripe credits for session ${session.id}: ${reason}`);
          }

          await db.execute(sql`
            WITH target_user AS (
              SELECT id, COALESCE(balance, '0')::numeric AS balance
              FROM users
              WHERE id = ${userId}
              FOR UPDATE
            ),
            existing_tx AS (
              SELECT id
              FROM transactions
              WHERE stripe_session_id = ${session.id}
              LIMIT 1
            ),
            inserted_tx AS (
              INSERT INTO transactions (
                id,
                user_id,
                type,
                amount,
                balance_after,
                description,
                stripe_session_id
              )
              SELECT
                gen_random_uuid()::text,
                target_user.id,
                'charge',
                ${amount.toString()},
                (target_user.balance + ${amount.toString()}::numeric)::text,
                ${`크레딧 충전 (${product.name})`},
                ${session.id}
              FROM target_user
              WHERE NOT EXISTS (SELECT 1 FROM existing_tx)
              ON CONFLICT (stripe_session_id) DO NOTHING
              RETURNING balance_after
            ),
            updated_user AS (
              UPDATE users
              SET balance = inserted_tx.balance_after
              FROM inserted_tx
              WHERE users.id = ${userId}
              RETURNING users.id
            )
            SELECT EXISTS (SELECT 1 FROM inserted_tx) AS transaction_inserted
          `);

          console.log(`Credits granted or already present: User ${userId} ${product.credits}C (${productType}, session ${session.id})`);
          console.log(`Successfully processed Stripe session ${session.id} for user ${userId}`);
          return res.status(200).json({ received: true });
        }

        const chargeResult = await db.execute(sql`
          WITH target_user AS (
            SELECT id, COALESCE(balance, '0')::numeric AS balance
            FROM users
            WHERE id = ${userId}
            FOR UPDATE
          ),
          existing_tx AS (
            SELECT id, balance_after
            FROM transactions
            WHERE stripe_session_id = ${session.id}
            LIMIT 1
          ),
          inserted_tx AS (
            INSERT INTO transactions (
              id,
              user_id,
              type,
              amount,
              balance_after,
              description,
              stripe_session_id
            )
            SELECT
              gen_random_uuid()::text,
              target_user.id,
              'charge',
              ${amount.toString()},
              (target_user.balance + ${amount.toString()}::numeric)::text,
              '잔액 충전 (Stripe)',
              ${session.id}
            FROM target_user
            WHERE NOT EXISTS (SELECT 1 FROM existing_tx)
            ON CONFLICT (stripe_session_id) DO NOTHING
            RETURNING id, balance_after
          ),
          effective_tx AS (
            SELECT id, balance_after FROM inserted_tx
            UNION ALL
            SELECT id, balance_after FROM existing_tx
          ),
          updated_user AS (
            UPDATE users
            SET balance = inserted_tx.balance_after
            FROM inserted_tx
            WHERE users.id = ${userId}
            RETURNING users.id
          )
          SELECT
            EXISTS (SELECT 1 FROM target_user) AS user_found,
            EXISTS (SELECT 1 FROM existing_tx) AS already_processed,
            EXISTS (SELECT 1 FROM inserted_tx) AS transaction_inserted,
            EXISTS (SELECT 1 FROM updated_user) AS balance_updated,
            (SELECT id FROM effective_tx LIMIT 1) AS transaction_id,
            (SELECT balance_after FROM effective_tx LIMIT 1) AS balance_after
        `);

        const chargeRow = chargeResult.rows?.[0] || {};
        if (!chargeRow.user_found) {
          console.error(`User ${userId} not found`);
          throw new Error(`Stripe checkout user not found: ${userId}`);
        }

        if (!chargeRow.already_processed && (!chargeRow.transaction_inserted || !chargeRow.balance_updated)) {
          throw new Error(`Failed to record Stripe charge for session ${session.id}`);
        }

        if (process.env.CREDIT_MODE_ENABLED === 'true' && productType) {
          const product = CREDIT_PRODUCTS[productType];
          const paymentReference = `stripe:${session.id}`;

          const grantResult = await grantPurchasedCreditsForServerless(db, {
            userId,
            transactionId: chargeRow.transaction_id,
            productType,
            paymentReference,
            metadata: { sessionId: session.id },
          });

          if (!grantResult.success && !grantResult.alreadyProcessed) {
            const reason = grantResult.lightLimitBlocked ? 'light monthly limit blocked' : grantResult.error;
            throw new Error(`Failed to grant Stripe credits for session ${session.id}: ${reason}`);
          }

          console.log(`Credits granted or already present: User ${userId} ${product.credits}C (${productType}, session ${session.id})`);
        }

        console.log(`Successfully processed Stripe session ${session.id} for user ${userId}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
