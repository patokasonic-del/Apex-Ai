import { createClient } from '@supabase/supabase-js';

let admin = null;

/** Service-role Supabase client. Server-side only. */
export function getAdmin() {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase environment variables are missing.');
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** Verifies the Bearer access token and returns the Supabase user, or null. */
export async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
