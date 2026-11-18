import crypto from 'node:crypto';
import { getAdmin } from './_lib.js';

const PRICE_KES = 10;
const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * Safaricom Daraja STK callback.
 * Daraja callbacks are unsigned, so we (1) require our secret token in the
 * callback URL, (2) only act on a CheckoutRequestID we created ourselves, and
 * (3) verify the paid amount. The handler is idempotent.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  if (!tokenMatches(req.query && req.query.token, process.env.MPESA_CALLBACK_SECRET)) {
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cb = body.Body && body.Body.stkCallback;
    if (!cb || !cb.CheckoutRequestID) return res.status(200).json(ACK);

    const db = getAdmin();
    const { data: payment } = await db
      .from('payments')
      .select('id, user_id, status')
      .eq('checkout_request_id', cb.CheckoutRequestID)
      .maybeSingle();

    // Unknown or already-processed request: acknowledge and ignore.
    if (!payment || payment.status !== 'pending') return res.status(200).json(ACK);

    const items = {};
    const list = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
    for (const it of list) items[it.Name] = it.Value;

    const code = Number(cb.ResultCode);
    const desc = cb.ResultDesc || null;

    if (code === 0) {
      if (Number(items.Amount) < PRICE_KES) {
        await db.from('payments')
          .update({ status: 'failed', result_desc: 'Amount paid was less than required.' })
          .eq('id', payment.id).eq('status', 'pending');
        return res.status(200).json(ACK);
      }

      const { data: updated } = await db.from('payments')
        .update({
          status: 'success',
          result_desc: desc,
          mpesa_receipt: items.MpesaReceiptNumber ? String(items.MpesaReceiptNumber) : null,
          paid_at: new Date().toISOString(),
        })
        .eq('id', payment.id).eq('status', 'pending')
        .select('id');

      if (updated && updated.length) {
        const { error } = await db.from('profiles').upsert(
          { id: payment.user_id, is_upgraded: true, upgraded_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
        if (error) console.error('upgrade failed', error);
      }
    } else {
      await db.from('payments')
        .update({ status: code === 1032 ? 'cancelled' : 'failed', result_desc: desc })
        .eq('id', payment.id).eq('status', 'pending');
    }
  } catch (e) {
    console.error('callback error', e);
  }

  return res.status(200).json(ACK);
}
