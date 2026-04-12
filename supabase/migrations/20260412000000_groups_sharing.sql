-- Flow: groups, shared tasks/events, join-by-code RPC.
-- After applying: Supabase Dashboard → Database → Replication → enable for `tasks`, `events` (and optionally `group_members`) for Realtime.

create extension if not exists "pgcrypto";

-- ——— Core tables ———
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null,
  created_at timestamptz not null default now(),
  constraint groups_invite_code_unique unique (invite_code)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  constraint group_members_group_user_unique unique (group_id, user_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_id_idx on public.group_members (group_id);

alter table public.tasks add column if not exists group_id uuid references public.groups (id) on delete set null;
alter table public.events add column if not exists group_id uuid references public.groups (id) on delete set null;

create index if not exists tasks_group_id_idx on public.tasks (group_id) where group_id is not null;
create index if not exists events_group_id_idx on public.events (group_id) where group_id is not null;

-- ——— Join by invite code (bypasses RLS on groups for lookup) ———
create or replace function public.join_group_by_code(p_code text)
returns table (gid uuid, gname text, gcode text)
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return;
  end if;

  select * into g
  from public.groups
  where upper(replace(trim(invite_code), ' ', '')) = upper(replace(trim(p_code), ' ', ''))
     or lower(id::text) = lower(trim(p_code))
  limit 1;

  if g.id is null then
    return;
  end if;

  insert into public.group_members (group_id, user_id)
  values (g.id, uid)
  on conflict (group_id, user_id) do nothing;

  gid := g.id;
  gname := g.name;
  gcode := g.invite_code;
  return next;
end;
$$;

revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.join_group_by_code(text) to service_role;

-- ——— RLS: groups & members ———
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "flow_groups_select" on public.groups;
create policy "flow_groups_select" on public.groups
  for select using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.group_members m
      where m.group_id = groups.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "flow_groups_insert" on public.groups;
create policy "flow_groups_insert" on public.groups
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "flow_groups_update" on public.groups;
create policy "flow_groups_update" on public.groups
  for update using (owner_id = (select auth.uid()));

drop policy if exists "flow_group_members_select" on public.group_members;
create policy "flow_group_members_select" on public.group_members
  for select using (
    exists (
      select 1 from public.group_members m
      where m.group_id = group_members.group_id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "flow_group_members_insert" on public.group_members;
create policy "flow_group_members_insert" on public.group_members
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "flow_group_members_delete" on public.group_members;
create policy "flow_group_members_delete" on public.group_members
  for delete using (user_id = (select auth.uid()));

-- ——— RLS: tasks (own + group-shared) ———
-- Drop legacy-style policies if present (adjust names to match your project if needed).
drop policy if exists "Users can view own tasks" on public.tasks;
drop policy if exists "Users can insert own tasks" on public.tasks;
drop policy if exists "Users can update own tasks" on public.tasks;
drop policy if exists "Users can delete own tasks" on public.tasks;

drop policy if exists "flow_tasks_select" on public.tasks;
create policy "flow_tasks_select" on public.tasks
  for select using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = tasks.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_tasks_insert" on public.tasks;
create policy "flow_tasks_insert" on public.tasks
  for insert with check (
    user_id = (select auth.uid())
    and (
      group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = tasks.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_tasks_update" on public.tasks;
create policy "flow_tasks_update" on public.tasks
  for update using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = tasks.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_tasks_delete" on public.tasks;
create policy "flow_tasks_delete" on public.tasks
  for delete using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = tasks.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

-- ——— RLS: events (same pattern) ———
drop policy if exists "Users can view own events" on public.events;
drop policy if exists "Users can insert own events" on public.events;
drop policy if exists "Users can update own events" on public.events;
drop policy if exists "Users can delete own events" on public.events;

drop policy if exists "flow_events_select" on public.events;
create policy "flow_events_select" on public.events
  for select using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = events.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_events_insert" on public.events;
create policy "flow_events_insert" on public.events
  for insert with check (
    user_id = (select auth.uid())
    and (
      group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = events.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_events_update" on public.events;
create policy "flow_events_update" on public.events
  for update using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = events.group_id and gm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "flow_events_delete" on public.events;
create policy "flow_events_delete" on public.events
  for delete using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = events.group_id and gm.user_id = (select auth.uid())
      )
    )
  );
