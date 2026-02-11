import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status').default('draft'),
  submittedAt: timestamp('submitted_at'),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const db = getDb();
    const result = await db.select().from(templates).where(eq(templates.id, id));
    const template = result[0];
    
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (template.userId !== auth.userId) return res.status(403).json({ error: 'Access denied' });
    if (template.status !== 'draft' && template.status !== 'rejected') {
      return res.status(400).json({ error: 'Only draft or rejected templates can be submitted for review' });
    }

    const updated = await db.update(templates).set({
      status: 'pending',
      submittedAt: new Date(),
    }).where(eq(templates.id, id)).returning();

    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error('Error submitting template:', error);
    return res.status(500).json({ error: 'Failed to submit template for review' });
  }
}
