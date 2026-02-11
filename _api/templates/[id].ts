import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createHmac } from 'crypto';

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  rcsType: integer('rcs_type'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageFileId: text('image_file_id'),
  urlLinks: jsonb('url_links'),
  buttons: jsonb('buttons'),
  lmsContent: text('lms_content'),
  lmsImageUrl: text('lms_image_url'),
  lmsImageFileId: text('lms_image_file_id'),
  lmsUrlLinks: jsonb('lms_url_links'),
  status: text('status').default('draft'),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow(),
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

function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAuth(req: VercelRequest) {
  const impersonateToken = req.headers['x-impersonate-token'] as string;
  const impersonateUserId = req.headers['x-impersonate-user-id'] as string;
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: '' };
    }
    return null;
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  messageType: z.enum(['LMS', 'MMS', 'RCS']).optional(),
  rcsType: z.number().optional(),
  title: z.string().max(60).optional(),
  content: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().optional(),
  imageFileId: z.string().optional(),
  urlLinks: z.object({
    list: z.array(z.string()),
    reward: z.number().optional(),
  }).optional(),
  buttons: z.object({
    list: z.array(z.object({
      type: z.string(),
      name: z.string(),
      val1: z.string(),
      val2: z.string().optional(),
    })),
  }).optional(),
  lmsContent: z.string().max(2000).optional().nullable(),
  lmsImageUrl: z.string().optional().nullable(),
  lmsImageFileId: z.string().optional().nullable(),
  lmsUrlLinks: z.object({
    list: z.array(z.string()),
    reward: z.number().optional(),
  }).optional().nullable(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid template ID' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      const result = await db.select().from(templates).where(eq(templates.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (template.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      return res.status(200).json(template);
    } catch (error) {
      console.error('Error fetching template:', error);
      return res.status(500).json({ error: 'Failed to fetch template' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const result = await db.select().from(templates).where(eq(templates.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (template.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      if (template.status !== 'draft' && template.status !== 'rejected') {
        return res.status(400).json({ error: 'Only draft or rejected templates can be edited' });
      }

      const data = updateTemplateSchema.parse(req.body);
      
      // RCS 템플릿이 아닌 경우 LMS 필드를 null로 정리
      const messageType = data.messageType || template.messageType;
      const updateData: Record<string, unknown> = { ...data };
      if (messageType !== 'RCS') {
        updateData.lmsContent = null;
        updateData.lmsImageUrl = null;
        updateData.lmsImageFileId = null;
        updateData.lmsUrlLinks = null;
      }
      
      const updated = await db.update(templates).set(updateData).where(eq(templates.id, id)).returning();
      return res.status(200).json(updated[0]);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      console.error('Error updating template:', error);
      return res.status(500).json({ error: 'Failed to update template' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const result = await db.select().from(templates).where(eq(templates.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (template.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      if (template.status === 'pending') return res.status(400).json({ error: 'Cannot delete template under review' });

      await db.delete(templates).where(eq(templates.id, id));
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting template:', error);
      return res.status(500).json({ error: 'Failed to delete template' });
    }
  }

  if (req.method === 'POST') {
    const { action, reason } = req.body || {};
    
    try {
      const result = await db.select().from(templates).where(eq(templates.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (template.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      if (action === 'submit') {
        if (template.status !== 'draft' && template.status !== 'rejected') {
          return res.status(400).json({ error: 'Only draft or rejected templates can be submitted for review' });
        }
        const updated = await db.update(templates).set({
          status: 'pending',
          submittedAt: new Date(),
        }).where(eq(templates.id, id)).returning();
        return res.status(200).json(updated[0]);
      }

      if (action === 'approve') {
        if (template.status !== 'pending') {
          return res.status(400).json({ error: 'Only pending templates can be approved' });
        }
        const updated = await db.update(templates).set({
          status: 'approved',
          reviewedAt: new Date(),
        }).where(eq(templates.id, id)).returning();
        return res.status(200).json(updated[0]);
      }

      if (action === 'reject') {
        if (template.status !== 'pending') {
          return res.status(400).json({ error: 'Only pending templates can be rejected' });
        }
        const updated = await db.update(templates).set({
          status: 'rejected',
          rejectionReason: reason || '검수 기준에 부합하지 않습니다.',
          reviewedAt: new Date(),
        }).where(eq(templates.id, id)).returning();
        return res.status(200).json(updated[0]);
      }

      return res.status(400).json({ error: 'Invalid action. Use submit, approve, or reject' });
    } catch (error) {
      console.error('Error processing template action:', error);
      return res.status(500).json({ error: 'Failed to process template action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
