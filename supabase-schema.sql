-- Momentum sync table. Each signed-in user can only read and write their own rows.
create table public.checks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_key text not null check (char_length(period_key) <= 40),
  done jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key)
);
alter table public.checks enable row level security;
create policy "Read own checks" on public.checks for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own checks" on public.checks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own checks" on public.checks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own checks" on public.checks for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.checks from anon;
grant select, insert, update, delete on public.checks to authenticated;
