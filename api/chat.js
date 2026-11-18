import { GoogleGenAI } from '@google/genai';
import { getAdmin, requireUser, send } from './_lib.js';
import { buildSystemInstruction, UNIT_IDS } from './_prompts.js';

const FREE_LIMIT = 10;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_CHARS = 3500;

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const items = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    .slice(-MAX_HISTORY_ITEMS)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text.slice(0, MAX_HISTORY_CHARS) }],
    }));
  while (items.length && items[0].role !== 'user') items.shift();
  return items;
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

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const unit = String(body.unit || '');
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!UNIT_IDS.includes(unit)) return send(res, 400, { error: 'INVALID_UNIT' });
  if (!message) return send(res, 400, { error: 'EMPTY_MESSAGE' });
  if (message.length > MAX_MESSAGE_CHARS) {
    return send(res, 400, { error: 'MESSAGE_TOO_LONG', max: MAX_MESSAGE_CHARS });
  }
  if (!process.env.GEMINI_API_KEY) return send(res, 500, { error: 'SERVER_MISCONFIGURED' });

  const db = getAdmin();

  // 1) Atomically reserve a question (server-side enforcement of the 10 free questions).
  const { data: gate, error: gateErr } = await db.rpc('consume_question', {
    p_user: user.id,
    p_limit: FREE_LIMIT,
  });
  if (gateErr || !gate || !gate[0]) {
    console.error('consume_question failed', gateErr);
    return send(res, 500, { error: 'COUNTER_ERROR' });
  }
  const g = gate[0];
  if (!g.allowed) {
    return send(res, 402, {
      error: 'LIMIT_REACHED',
      used: g.q_used,
      remaining: 0,
      is_upgraded: g.upgraded,
    });
  }

  // 2) Ask the model.
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = [
      ...cleanHistory(body.history),
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: buildSystemInstruction(unit),
        temperature: 0.6,
        maxOutputTokens: 8192,
      },
    });

    const reply = (response && response.text ? response.text : '').trim();
    if (!reply) throw new Error('Empty model response');

    return send(res, 200, {
      reply,
      used: g.q_used,
      remaining: g.upgraded ? null : Math.max(0, FREE_LIMIT - g.q_used),
      is_upgraded: g.upgraded,
    });
  } catch (e) {
    console.error('model error', e);
    // The student got no answer, so give the question back.
    await db.rpc('refund_question', { p_user: user.id });
    return send(res, 502, { error: 'AI_UNAVAILABLE' });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
