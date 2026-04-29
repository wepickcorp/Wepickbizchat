import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc, and, or, inArray, isNotNull } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { randomUUID, createHmac } from 'crypto';

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

function getBizChatConfig() {
  const useProduction = process.env.BIZCHAT_USE_PROD === 'true';
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;
  return { baseUrl, apiKey, useProduction };
}

function bizChatStatusToLocal(bizChatStatus: number): string {
  switch (bizChatStatus) {
    case 0: return 'draft';
    case 10: return 'pending';
    case 11: return 'approved';
    case 17: return 'rejected';
    default: return 'draft';
  }
}

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  rcsType: integer('rcs_type'),
  title: text('title'),
  lmsTitle: text('lms_title'),
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

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  templateId: text('template_id'),
  completedAt: timestamp('completed_at'),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  clickCount: integer('click_count').default(0),
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

async function syncBizChatTemplateStatuses(db: ReturnType<typeof getDb>, templateIds: string[]): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  
  try {
    const { baseUrl, apiKey } = getBizChatConfig();
    if (!apiKey) {
      console.log('[Templates] No BizChat API key configured, skipping sync');
      return statusMap;
    }
    
    const tid = Date.now().toString();
    const response = await fetch(`${baseUrl}/api/v1/cmpn/tpl/list?tid=${tid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ pageNumber: 1, pageSize: 100 }),
    });
    
    if (!response.ok) {
      console.log(`[Templates] BizChat API error: ${response.status}`);
      return statusMap;
    }
    
    const result = await response.json();
    if (result.code !== 'S000001' || !result.data?.list) {
      console.log(`[Templates] BizChat API failed: ${result.msg}`);
      return statusMap;
    }
    
    const bizChatTemplates = result.data.list as Array<{ id: number; name: string; status: number }>;
    console.log(`[Templates] Fetched ${bizChatTemplates.length} templates from BizChat for sync`);
    
    for (const bct of bizChatTemplates) {
      const localStatus = bizChatStatusToLocal(bct.status);
      statusMap.set(bct.id.toString(), localStatus);
      
      await db.update(templates)
        .set({ 
          status: localStatus,
          updatedAt: new Date(),
        })
        .where(eq(templates.id, bct.id.toString()));
    }
    
    console.log(`[Templates] Synced ${statusMap.size} template statuses from BizChat`);
  } catch (error) {
    console.error('[Templates] Error syncing BizChat statuses:', error);
  }
  
  return statusMap;
}

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  rcsType: z.number().optional(),
  title: z.string().max(60).optional(),
  lmsTitle: z.string().max(60).optional(),
  content: z.string().min(1).max(2000),
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
  lmsContent: z.string().max(2000).optional(),
  lmsImageUrl: z.string().optional(),
  lmsImageFileId: z.string().optional(),
  lmsUrlLinks: z.object({
    list: z.array(z.string()),
    reward: z.number().optional(),
  }).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const userId = auth.userId;

  if (req.method === 'GET') {
    try {
      // BizChat에서 템플릿 상태 동기화 (백그라운드에서 실행)
      const syncPromise = syncBizChatTemplateStatuses(db, []).catch(err => {
        console.error('[Templates] Background sync error:', err);
      });
      
      // 사용자 본인 템플릿 + 시스템 기본 템플릿 모두 조회
      const SYSTEM_USER_ID = 'system';
      const templateList = await db.select().from(templates)
        .where(or(eq(templates.userId, userId), eq(templates.userId, SYSTEM_USER_ID)))
        .orderBy(desc(templates.createdAt));
      
      // 동기화 완료 대기 (최대 3초)
      await Promise.race([syncPromise, new Promise(resolve => setTimeout(resolve, 3000))]);
      
      // 동기화 후 다시 조회하여 최신 상태 반영
      const updatedTemplateList = await db.select().from(templates)
        .where(or(eq(templates.userId, userId), eq(templates.userId, SYSTEM_USER_ID)))
        .orderBy(desc(templates.createdAt));
      
      const templatesWithStats = await Promise.all(
        updatedTemplateList.map(async (template) => {
          const templateCampaigns = await db.select().from(campaigns).where(and(eq(campaigns.templateId, template.id), eq(campaigns.userId, userId)));
          let totalSent = 0, totalDelivered = 0;
          let lastSentAt: Date | null = null;
          
          for (const c of templateCampaigns) {
            const reportResult = await db.select().from(reports).where(eq(reports.campaignId, c.id));
            const report = reportResult[0];
            if (report) {
              totalSent += report.sentCount || 0;
              totalDelivered += report.deliveredCount || 0;
            }
            if (c.completedAt && (!lastSentAt || c.completedAt > lastSentAt)) {
              lastSentAt = c.completedAt;
            }
          }
          
          return {
            ...template,
            isSystem: template.userId === SYSTEM_USER_ID,
            sendHistory: {
              campaignCount: templateCampaigns.length,
              totalSent,
              totalDelivered,
              lastSentAt,
            },
          };
        })
      );
      
      return res.status(200).json(templatesWithStats);
    } catch (error) {
      console.error('Error fetching templates:', error);
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createTemplateSchema.parse(req.body);
      
      const result = await db.insert(templates).values({
        id: randomUUID(),
        userId,
        name: data.name,
        messageType: data.messageType,
        rcsType: data.messageType === 'RCS' ? (data.rcsType ?? 0) : null,
        title: data.title,
        lmsTitle: data.messageType === 'RCS' ? (data.lmsTitle || null) : null,
        content: data.content,
        imageUrl: data.imageUrl,
        imageFileId: data.imageFileId,
        urlLinks: data.urlLinks,
        buttons: data.buttons,
        lmsContent: data.messageType === 'RCS' ? (data.lmsContent || null) : null,
        lmsImageUrl: data.messageType === 'RCS' ? (data.lmsImageUrl || null) : null,
        lmsImageFileId: data.messageType === 'RCS' ? (data.lmsImageFileId || null) : null,
        lmsUrlLinks: data.messageType === 'RCS' ? (data.lmsUrlLinks || null) : null,
        status: 'draft',
      }).returning();
      
      return res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      console.error('Error creating template:', error);
      return res.status(500).json({ error: 'Failed to create template' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
