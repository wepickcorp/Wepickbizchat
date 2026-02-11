import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  templateId: text('template_id'),
  budget: numeric('budget'),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  clickCount: integer('click_count'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  clickCount: integer('click_count').default(0),
  optOutCount: integer('opt_out_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(dbUrl);
  return drizzle(sql);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is missing');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 대리 로그인 토큰 검증
function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}

async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  // 대리 로그인 토큰 확인
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
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await verifyAuth(req);
    
    if (!auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const userCampaigns = await db.select().from(campaigns).where(eq(campaigns.userId, auth.userId));
    
    let totalSent = 0;
    let totalSuccess = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;

    for (const campaign of userCampaigns) {
      if (campaign.statusCode === 20 || campaign.statusCode === 30) {
        activeCampaigns++;
      }
      totalSent += campaign.sentCount || 0;
      totalSuccess += campaign.successCount || 0;
      totalClicks += campaign.clickCount || 0;
      
      const reportResult = await db.select().from(reports).where(eq(reports.campaignId, campaign.id));
      const report = reportResult[0];
      if (report) {
        totalSent += report.sentCount || 0;
        totalSuccess += report.deliveredCount || 0;
        totalClicks += report.clickCount || 0;
      }
    }

    const stats = {
      totalCampaigns: userCampaigns.length,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}
