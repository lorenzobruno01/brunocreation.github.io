-- ─────────────────────────────────────────────────────────────
-- RÉPARATION : crée les 16 tables partagées du foyer si elles manquent
-- (planning, courses, profils, favoris…). À exécuter si l'appli indique
-- « Le serveur ne trouve pas les tables … ». Sans risque, relançable.
-- Prérequis : les tables households / household_members existent
-- (début de 20261006000000_foyers.sql).
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hid and user_id = auth.uid());
$$;

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
    -- facultatif : si la publication n'existe pas ou refuse l'ajout, on continue (l'appli relève toutes les 20 s)
    begin
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    exception when others then
      raise notice 'temps réel non activé pour % : %', t, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- vérification : doit afficher 16 lignes
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('household_settings', 'profiles', 'meal_plans', 'shopping_items', 'pantry_items', 'fridge_items', 'basket_items', 'favorites', 'cooking_history', 'recipe_feedback', 'weight_logs', 'week_templates', 'leftovers', 'recipes', 'hidden_recipes', 'custom_ingredients')
order by 1;
