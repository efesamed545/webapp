-- Flow: self-care, focus sessions, achievements, buddy state, points log (Supabase source of truth)
-- Run in Supabase SQL Editor or via CLI.

-- ——— 1. Self-care ———
create table if not exists public.selfcare_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists selfcare_entries_user_day_idx on public.selfcare_entries (user_id, day desc);

-- ——— 2. Focus sessions ———
create table if not exists public.focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  duration integer not null,
  day date not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_created_idx on public.focus_sessions (user_id, created_at desc);

-- ——— 3. Achievements (unlocks) ———
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists achievements_user_idx on public.achievements (user_id);

-- ——— 4. Buddy state ———
create table if not exists public.buddy_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mood text not null default '{}',
  last_interaction timestamptz,
  updated_at timestamptz not null default now()
);

-- ——— 5. Points log ———
create table if not exists public.points_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  points integer not null,
  source text not null,
  day date not null,
  ref_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists points_log_user_day_idx on public.points_log (user_id, day);

-- ——— RLS ———
alter table public.selfcare_entries enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.achievements enable row level security;
alter table public.buddy_state enable row level security;
alter table public.points_log enable row level security;

drop policy if exists "flow_selfcare_all" on public.selfcare_entries;
create policy "flow_selfcare_all" on public.selfcare_entries for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "flow_focus_all" on public.focus_sessions;
create policy "flow_focus_all" on public.focus_sessions for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "flow_ach_all" on public.achievements;
create policy "flow_ach_all" on public.achievements for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "flow_buddy_all" on public.buddy_state;
create policy "flow_buddy_all" on public.buddy_state for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "flow_points_all" on public.points_log;
create policy "flow_points_all" on public.points_log for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
