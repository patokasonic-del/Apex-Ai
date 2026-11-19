# Apex AI

Exam study assistant and AI tutor for MUT engineering students. Built by Patrick Njoroge, Structura Digital Solutions.

## Files

- `index.html`, `style.css`, `app.js`, `avatar.png.webp`: frontend (static)
- `api/chat.js`: Gemini tutor, verifies the Supabase login and enforces the 10 free questions server-side
- `api/pay.js`: starts the M-Pesa STK push (KES 10)
- `api/mpesa-callback.js`: Daraja callback, sets `is_upgraded = true` on confirmed payment
- `api/config.js`: serves the public Supabase URL and anon key to the browser
- `api/_lib.js`, `api/_prompts.js`: shared helpers and the system instruction core
- `supabase-schema.sql`: tables, row-level security, atomic counter functions

## Deploy

1. **Supabase**: create a project, open SQL Editor, run `supabase-schema.sql`. In Auth settings, decide whether email confirmation is required.
2. **Vercel**: import the repo. Add every variable from `.env.example` under Project Settings, Environment Variables.
3. **Daraja**: set `APP_URL` to your live HTTPS URL. The callback URL sent to Safaricom is `APP_URL/api/mpesa-callback?token=MPESA_CALLBACK_SECRET`. For production, set `MPESA_ENV=production` and use your own Paybill or Till credentials (for a Till use `CustomerBuyGoodsOnline` and set `MPESA_PARTY_B` to the Till number).
4. Replace `avatar.png` with your own artwork if you like (the included one is a generated placeholder).

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. The browser only receives the anon key.
- Students can read their own `profiles` and `payments` rows but cannot write them. The counter and upgrade flag are changed only by the server.
- The question counter is incremented atomically before the AI call and refunded if the AI call fails.
- Daraja callbacks are unsigned, so the handler requires the secret token, only acts on a CheckoutRequestID created by `/api/pay`, verifies the amount, and is idempotent.

## Behaviour notes

- Upgrade is permanent once paid (`is_upgraded = true`). To make it time-limited, add an `upgraded_until` column and check it in `consume_question`.
- Engineering Drawing diagrams are returned by the model as SVG and sanitised in the browser before rendering in the CAD viewport.
