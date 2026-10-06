-- ═════════════════════════════════════════════════════════════
-- Notre Cuisine — foyers, membres, invitations et données partagées
-- À exécuter une fois dans Supabase : SQL Editor → New query → Run.
-- Idempotent : peut être relancé sans risque.
-- ═════════════════════════════════════════════════════════════

-- ── Foyers ─────────────────────────────────────────────────
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon foyer',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'membre' check (role in ('proprietaire', 'membre')),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.invitations (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

-- Appartenance (security definer : évite la récursion des règles RLS)
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hid and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invitations enable row level security;

drop policy if exists "voir mes foyers" on public.households;
create policy "voir mes foyers" on public.households for select to authenticated using (public.is_member(id));
drop policy if exists "renommer mes foyers" on public.households;
create policy "renommer mes foyers" on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "voir les membres" on public.household_members;
create policy "voir les membres" on public.household_members for select to authenticated using (public.is_member(household_id));
drop policy if exists "quitter un foyer" on public.household_members;
create policy "quitter un foyer" on public.household_members for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "modifier mon nom" on public.household_members;
create policy "modifier mon nom" on public.household_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "voir les invitations" on public.invitations;
create policy "voir les invitations" on public.invitations for select to authenticated using (public.is_member(household_id));
drop policy if exists "annuler une invitation" on public.invitations;
create policy "annuler une invitation" on public.invitations for delete to authenticated using (public.is_member(household_id));

-- ── Fonctions appelées par l'appli ────────────────────────
create or replace function public.create_household(p_name text default 'Mon foyer', p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  insert into households (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Mon foyer'), auth.uid()) returning id into hid;
  insert into household_members (household_id, user_id, role, display_name) values (hid, auth.uid(), 'proprietaire', p_display_name);
  return hid;
end $$;

create or replace function public.create_invitation(p_household uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_member(p_household) then raise exception 'foyer inaccessible'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when length(c) = 8 and not exists (select 1 from invitations where code = c);
  end loop;
  insert into invitations (code, household_id, created_by) values (c, p_household, auth.uid());
  return c;
end $$;

create or replace function public.join_household(p_code text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  select household_id into hid from invitations where code = upper(trim(p_code)) and expires_at > now();
  if hid is null then raise exception 'invitation invalide ou expirée'; end if;
  insert into household_members (household_id, user_id, display_name) values (hid, auth.uid(), p_display_name)
    on conflict (household_id, user_id) do nothing;
  return hid;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ── Données du foyer : une ligne par élément ──────────────
-- Toutes ces tables ont la même forme : (foyer, identifiant, contenu JSON).
-- Le contenu suit les types de l'appli (src/domain/types.ts) ; l'horodatage
-- est posé par le serveur pour une synchronisation fiable entre appareils.
create or replace function public.touch_row()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'household_settings', 'profiles', 'meal_plans', 'shopping_items', 'pantry_items', 'fridge_items', 'basket_items',
    'favorites', 'cooking_history', 'recipe_feedback', 'weight_logs', 'week_templates', 'leftovers',
    'recipes', 'hidden_recipes', 'custom_ingredients'
  ] loop
    execute format('create table if not exists public.%I (
      household_id uuid not null references public.households (id) on delete cascade,
      id text not null,
      data jsonb not null default ''{}''::jsonb,
      deleted boolean not null default false,
      updated_at timestamptz not null default now(),
      updated_by uuid default auth.uid(),
      primary key (household_id, id)
    )', t);
    execute format('create index if not exists %I on public.%I (household_id, updated_at)', t || '_maj', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membres du foyer" on public.%I', t);
    execute format('create policy "membres du foyer" on public.%I for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    execute format('drop trigger if exists horodatage on public.%I', t);
    execute format('create trigger horodatage before insert or update on public.%I for each row execute function public.touch_row()', t);
    -- temps réel (liste de courses cochée en direct, planning partagé…)
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
