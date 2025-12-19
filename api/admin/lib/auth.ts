import type { VercelRequest } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { admins } from './schema';
import crypto from 'crypto';

export function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) {
      return null;
    }

    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

export async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);
  
  if (!verified) {
    return null;
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return null;
    
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema: { admins } });
    
    const admin = await db.select()
      .from(admins)
      .where(eq(admins.id, verified.adminId))
      .limit(1);

    if (admin.length === 0 || !admin[0].isActive) {
      return null;
    }

    return admin[0];
  } catch {
    return null;
  }
}

export function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
         req.headers['x-real-ip'] as string || 
         'unknown';
}
