-- Apex AI : run this whole file once in Supabase -> SQL Editor.

-- ============ PROFILES (free-question tracking + upgrade status) ============
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  questions_used  integer not null default 0,
  is_upgraded     boolean not null default false,
  upgraded_at     timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Students may READ their own row. There are deliberately NO insert/update
-- policies: only the server (service role) can change counters or upgrade status.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- ============ PAYMENTS (one row per STK push) ============
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  checkout_request_id  text unique not null,
  merchant_request_id  text,
  phone                text not null,
  amount               integer not null,
  status               text not null default 'pending',  -- pending | success | failed | cancelled
  result_desc          text,
  mpesa_receipt        text,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);

alter table public.payments enable row level security;

drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments
  for select using (auth.uid() = user_id);

create index if not exists payments_user_idx on public.payments(user_id, created_at desc);

-- ============ AUTO-CREATE PROFILE ON SIGN UP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ATOMIC QUESTION COUNTER ============
-- Increments the counter only if the user is upgraded or still under the limit.
create or replace function public.consume_question(p_user uuid, p_limit integer default 10)
returns table (allowed boolean, q_used integer, upgraded boolean)
language plpgsql security definer set search_path = public as $$
declare r public.profiles%rowtype;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  update public.profiles
     set questions_used = questions_used + 1
   where id = p_user and (is_upgraded or questions_used < p_limit)
  returning * into r;

  if found then
    return query select true, r.questions_used, r.is_upgraded;
  else
    select * into r from public.profiles where id = p_user;
    return query select false, r.questions_used, r.is_upgraded;
  end if;
end $$;

-- Gives the question back if the AI call failed (free users only).
create or replace function public.refund_question(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set questions_used = greatest(0, questions_used - 1)
   where id = p_user and not is_upgraded;
$$;

-- Lock these down: only the server (service role) may call them.
revoke all on function public.consume_question(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_question(uuid)           from public, anon, authenticated;
grant execute on function public.consume_question(uuid, integer) to service_role;
grant execute on function public.refund_question(uuid)           to service_role;
