import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { users, transactions, adminLogs } from '../../../../shared/schema';
import { verifyAdminToken, getClientIp } from '../../lib/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId } = req.query;
  const { amount, reason } = req.body;

  if (!userId || typeof amount !== 'number' || !reason) {
    return res.status(400).json({ error: '필수 값이 누락되었습니다' });
  }

  try {
    const db = getDb();

    const [user] = await db.select().from(users).where(eq(users.id, userId as string)).limit(1);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다' });
    }

    const currentBalance = Number(user.balance || 0);
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      return res.status(400).json({ error: '잔액이 마이너스가 될 수 없습니다' });
    }

    await db.update(users)
      .set({ balance: String(newBalance), updatedAt: new Date() })
      .where(eq(users.id, userId as string));

    await db.insert(transactions).values({
      userId: userId as string,
      type: 'admin_adjustment',
      amount: String(amount),
      balanceAfter: String(newBalance),
      description: `[관리자 조정] ${reason}`,
      paymentMethod: 'admin',
    });

    await db.insert(adminLogs).values({
      adminId: admin.id,
      action: 'balance_adjust',
      targetType: 'user',
      targetId: userId as string,
      details: { 
        previousBalance: currentBalance, 
        newBalance, 
        amount, 
        reason,
        userEmail: user.email,
      },
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      previousBalance: currentBalance,
      newBalance,
    });
  } catch (error) {
    console.error('[Admin Balance Adjust] Error:', error);
    return res.status(500).json({ error: '잔액 조정 중 오류가 발생했습니다' });
  }
}
