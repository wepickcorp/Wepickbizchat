import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CREDIT_POLICY, listCreditProducts } from '../../../shared/credit-policy';
import { verifyUserAuth } from '../_shared/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyUserAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  return res.status(200).json({
    enabled: process.env.CREDIT_MODE_ENABLED === 'true',
    policy: CREDIT_POLICY,
    products: listCreditProducts(),
  });
}
