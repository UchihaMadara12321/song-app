// api/ping.ts
export const config = { runtime: 'nodejs18.x' };

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, ts: Date.now() });
}
