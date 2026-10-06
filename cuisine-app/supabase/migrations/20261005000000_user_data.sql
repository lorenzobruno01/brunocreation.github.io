-- Notre Cuisine : une ligne de données par utilisateur, lisible et
-- modifiable uniquement par cet utilisateur (Row Level Security).
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  device text,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "lire ses données" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "créer ses données" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "modifier ses données" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "supprimer ses données" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);
