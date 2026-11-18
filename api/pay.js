import { getAdmin, requireUser, send } from './_lib.js';

const PRICE_KES = 10;

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 254XXXXXXXXX, +254XXXXXXXXX. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()+]/g, '');
  const m = digits.match(/^(?:254|0)?([17]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

/** Daraja timestamp in East Africa Time: YYYYMMDDHHmmss */
function timestampEAT() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds())
  );
}

function darajaBase() {
  return process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const r = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error(`Daraja token request failed (${r.status})`);
  const j = await r.json();
  if (!j.access_token) throw new Error('Daraja returned no access token');
  return j.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  let user;
  try {
    user = await requireUser(req);
  } catch (e) {
    console.error('auth error', e);
    return send(res, 500, { error: 'SERVER_MISCONFIGURED' });
  }
  if (!user) return send(res, 401, { error: 'UNAUTHORIZED' });

  const required = [
    'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE',
    'MPESA_PASSKEY', 'MPESA_CALLBACK_SECRET', 'APP_URL',
  ];
  if (required.some((k) => !process.env[k])) {
    console.error('M-Pesa env vars missing');
    return send(res, 500, { error: 'PAYMENTS_NOT_CONFIGURED' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const phone = normalizePhone(body.phone);
  if (!phone) {
    return send(res, 400, { error: 'INVALID_PHONE', message: 'Enter a valid Safaricom number like 07XXXXXXXX.' });
  }

  const db = getAdmin();

  // Already upgraded? Nothing to charge.
  const { data: profile } = await db
    .from('profiles').select('is_upgraded').eq('id', user.id).maybeSingle();
  if (profile && profile.is_upgraded) return send(res, 200, { already_upgraded: true });

  // Basic abuse guard: one STK push per minute per user.
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent } = await db
    .from('payments').select('id').eq('user_id', user.id).gte('created_at', since).limit(1);
  if (recent && recent.length) {
    return send(res, 429, { error: 'TOO_MANY_REQUESTS', message: 'Please wait a minute before trying again.' });
  }

  try {
    const token = await getAccessToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    const timestamp = timestampEAT();
    const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const callbackUrl =
      `${process.env.APP_URL.replace(/\/$/, '')}/api/mpesa-callback` +
      `?token=${encodeURIComponent(process.env.MPESA_CALLBACK_SECRET)}`;

    const r = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
        Amount: PRICE_KES,
        PartyA: phone,
        PartyB: process.env.MPESA_PARTY_B || shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: 'ApexAI',
        TransactionDesc: 'Apex AI Unlimited Revision',
      }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || String(j.ResponseCode) !== '0' || !j.CheckoutRequestID) {
      console.error('STK push rejected', r.status, j);
      return send(res, 502, {
        error: 'STK_FAILED',
        message: j.errorMessage || j.ResponseDescription || 'Could not start the M-Pesa request. Try again.',
      });
    }

    const { error: insErr } = await db.from('payments').insert({
      user_id: user.id,
      checkout_request_id: j.CheckoutRequestID,
      merchant_request_id: j.MerchantRequestID || null,
      phone,
      amount: PRICE_KES,
      status: 'pending',
    });
    if (insErr) console.error('payment insert failed', insErr);

    return send(res, 200, {
      checkout_request_id: j.CheckoutRequestID,
      message: j.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
    });
  } catch (e) {
    console.error('pay error', e);
    return send(res, 502, { error: 'STK_FAILED', message: 'M-Pesa is unreachable right now. Try again shortly.' });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
