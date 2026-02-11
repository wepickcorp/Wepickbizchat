import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { pgTable, text, integer, timestamp, decimal, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

neonConfig.fetchConnectionCache = true;

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

const campaigns = pgTable('campaigns', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  templateId: varchar('template_id'),
  name: varchar('name', { length: 200 }).notNull(),
  tgtCompanyName: varchar('tgt_company_name', { length: 100 }),
  statusCode: integer('status_code').default(0).notNull(),
  status: varchar('status', { length: 20 }).default('temp_registered').notNull(),
  messageType: varchar('message_type', { length: 10 }).notNull(),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  sndNum: varchar('snd_num', { length: 20 }),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  settleCnt: integer('settle_cnt').default(0),
  mdnFileId: varchar('mdn_file_id', { length: 50 }),
  atsSndStartDate: timestamp('ats_snd_start_date'),
  targetCount: integer('target_count').default(0).notNull(),
  sentCount: integer('sent_count').default(0),
  successCount: integer('success_count').default(0),
  clickCount: integer('click_count').default(0),
  budget: decimal('budget', { precision: 12, scale: 0 }).notNull(),
  bizchatCampaignId: varchar('bizchat_campaign_id', { length: 100 }),
  scheduledAt: timestamp('scheduled_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const templates = pgTable('templates', {
  id: varchar('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  messageType: varchar('message_type', { length: 10 }).notNull(),
  title: varchar('title', { length: 60 }),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageFileId: varchar('image_file_id', { length: 100 }),
});

const messages = pgTable('messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar('campaign_id').notNull(),
  title: varchar('title', { length: 60 }),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
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

function generateTid(): string {
  return Date.now().toString();
}

function toUnixTimestamp(date: Date | string | null): number | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor(d.getTime() / 1000);
}

function detectProductionEnvironment(req: VercelRequest): boolean {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
  if (forceDevMode) return false;
  return false;
}

async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const tid = generateTid();
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  
  console.log(`[BizChat Test] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Test] Request body:`, JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat Test] Response: ${response.status} - ${responseText.substring(0, 500)}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }

  return { status: response.status, data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      name,
      templateId,
      messageType,
      sndNum,
      mdnFileId,
      sndGoalCnt,
      targetCount,
      budget,
      scheduledAt,
    } = req.body;

    if (!name || !templateId || !sndNum || !mdnFileId) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, templateId, sndNum, mdnFileId' 
      });
    }

    const db = getDb();
    const useProduction = detectProductionEnvironment(req);

    const templateResult = await db.select().from(templates).where(sql`${templates.id} = ${templateId}`);
    if (templateResult.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = templateResult[0];

    let billingType = 0;
    if (messageType === 'RCS') {
      billingType = 3;
    } else if (messageType === 'MMS') {
      billingType = 2;
    }

    const campaignId = crypto.randomUUID();
    const atsSndStartDate = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 60 * 60 * 1000);

    const bizChatPayload: Record<string, unknown> = {
      tgtCompanyName: '위픽',
      name: name,
      sndNum: sndNum,
      rcvType: 10,
      sndGoalCnt: sndGoalCnt || targetCount,
      billingType: billingType,
      isTmp: 0,
      settleCnt: sndGoalCnt || targetCount,
      mdnFileId: mdnFileId,
      adverDeny: '1504',
      cb: {
        state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
      },
      mms: {
        title: template.title || '',
        msg: template.content || '',
        fileInfo: template.imageFileId ? { list: [{ origId: template.imageFileId }] } : {},
        urlFile: '', // 필수 필드: 사용하지 않을 때 빈 문자열 (문서 규격)
        urlLink: {},
      },
      rcs: [],
      atsSndStartDate: toUnixTimestamp(atsSndStartDate),
    };

    console.log('[Test Campaign] Creating BizChat campaign with rcvType: 10');
    const bizChatResult = await callBizChatAPI('/api/v1/cmpn/create', 'POST', bizChatPayload, useProduction);

    if (bizChatResult.data?.code !== 'S000001') {
      return res.status(400).json({
        success: false,
        error: bizChatResult.data?.msg || 'BizChat campaign creation failed',
        bizchatCode: bizChatResult.data?.code,
      });
    }

    const bizchatCampaignId = bizChatResult.data?.data?.id;

    await db.insert(campaigns).values({
      id: campaignId,
      userId: auth.userId,
      templateId: templateId,
      name: name,
      tgtCompanyName: '위픽',
      statusCode: 0,
      status: 'temp_registered',
      messageType: messageType || 'LMS',
      rcvType: 10,
      billingType: billingType,
      sndNum: sndNum,
      sndGoalCnt: sndGoalCnt || targetCount,
      mdnFileId: mdnFileId,
      atsSndStartDate: atsSndStartDate,
      targetCount: targetCount,
      budget: budget.toString(),
      bizchatCampaignId: bizchatCampaignId,
      scheduledAt: atsSndStartDate,
    });

    await db.insert(messages).values({
      id: crypto.randomUUID(),
      campaignId: campaignId,
      title: template.title || '',
      content: template.content,
      imageUrl: template.imageUrl,
    });

    return res.status(200).json({
      success: true,
      campaign: {
        id: campaignId,
        bizchatCampaignId: bizchatCampaignId,
        name: name,
        rcvType: 10,
        targetCount: targetCount,
        scheduledAt: atsSndStartDate.toISOString(),
      },
      message: '테스트 캠페인이 생성되었어요. 승인 요청 후 발송됩니다.',
    });
  } catch (error) {
    console.error('[Test Campaign] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
