-- ─────────────────────────────────────────────────────────────
-- Options facultatives : quota de l'assistant IA et jetons Strava.
-- Ces tables ne sont lisibles QUE par les fonctions serveur (clé
-- service_role, côté Supabase) : RLS activée sans aucune règle, donc
-- aucun accès depuis le navigateur. Idempotent.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  athlete_id bigint,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.strava_tokens enable row level security;

-- Incrément atomique du quota (appelé par la fonction « assistant »)
create or replace function public.ai_take(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into ai_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  where ai_usage.count < p_limit
  returning count into n;
  return coalesce(n, -1); -- -1 : quota du jour atteint
end;
$$;
revoke all on function public.ai_take(uuid, int) from public, anon, authenticated;
