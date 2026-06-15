import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eventLogs, insertEventLogSchema } from '../../../shared/schema';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

function getClientIp(req: VercelRequest) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim().slice(0, 45);
  }
  return String(req.socket?.remoteAddress || '').slice(0, 45);
}

function normalizeBody(req: VercelRequest) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const raw = normalizeBody(req);
    const parsed = insertEventLogSchema.parse({
      userId: typeof raw.userId === 'string' && raw.userId ? raw.userId : undefined,
      anonymousId: typeof raw.anonymousId === 'string' ? raw.anonymousId.slice(0, 120) : undefined,
      eventName: String(raw.eventName || '').slice(0, 100),
      funnelStep: typeof raw.funnelStep === 'string' ? raw.funnelStep.slice(0, 80) : undefined,
      pagePath: typeof raw.pagePath === 'string' ? raw.pagePath.slice(0, 1000) : undefined,
      referrer: typeof raw.referrer === 'string' ? raw.referrer.slice(0, 1000) : undefined,
      campaignId: typeof raw.campaignId === 'string' && raw.campaignId ? raw.campaignId : undefined,
      templateId: typeof raw.templateId === 'string' && raw.templateId ? raw.templateId : undefined,
      productType: typeof raw.productType === 'string' ? raw.productType.slice(0, 30) : undefined,
      metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
        ? raw.metadata
        : undefined,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 1000),
      ipAddress: getClientIp(req),
    });

    if (!parsed.eventName) return res.status(400).json({ error: 'eventName is required' });

    await getDb().insert(eventLogs).values(parsed);
    return res.status(204).end();
  } catch (error) {
    console.error('[Events] Error:', error);
    return res.status(204).end();
  }
}
