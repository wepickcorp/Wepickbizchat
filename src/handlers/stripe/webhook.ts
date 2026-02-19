import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';

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

      if (userId && amount > 0) {
        const db = getDb();
        
        const existingTx = await db.select().from(transactions).where(eq(transactions.stripeSessionId, session.id));
        
        if (existingTx.length > 0) {
          console.log(`Session ${session.id} already processed, skipping`);
        } else {
          const userResult = await db.select().from(users).where(eq(users.id, userId));
          const user = userResult[0];
          
          if (user) {
            const currentBalance = parseInt(user.balance) || 0;
            const newBalance = currentBalance + amount;

            await db.update(users).set({ balance: newBalance.toString() }).where(eq(users.id, userId));
            
            await db.insert(transactions).values({
              id: randomUUID(),
              userId,
              type: 'charge',
              amount: amount.toString(),
              balanceAfter: newBalance.toString(),
              description: `잔액 충전 (Stripe)`,
              stripeSessionId: session.id,
            });

            console.log(`Successfully credited ${amount} to user ${userId}`);
          } else {
            console.error(`User ${userId} not found`);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
