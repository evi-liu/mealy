-- Recipe sources belong to each household. The catalog stays one shared,
-- de-duplicated table, but a household only sees recipes from the sites it
-- has added. Existing and new households start with the two original sites.

alter table public.catalog_recipes drop constraint catalog_recipes_source_check;

create table public.household_sources (
  household_id uuid not null references public.households(id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and domain !~ '^[0-9.]+$'),
  added_at timestamptz not null default now(),
  primary key (household_id, domain)
);
alter table public.household_sources enable row level security;
revoke all on public.household_sources from anon, authenticated;
grant select on public.household_sources to authenticated;
create policy "Household reads its recipe sources" on public.household_sources for select to authenticated
using (household_id = (select public.my_household()));

insert into public.household_sources (household_id, domain)
select h.id, d.domain
from public.households h
cross join (values ('tiffycooks.com'), ('thewoksoflife.com')) as d(domain);

drop policy "Household members read the recipe catalog" on public.catalog_recipes;
create policy "Household reads recipes from its sources" on public.catalog_recipes for select to authenticated
using (source in (
  select s.domain from public.household_sources s
  where s.household_id = (select public.my_household())
));

create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.my_google_email();
  v_household uuid;
  v_name text := left(nullif(trim(p_name), ''), 80);
begin
  if v_email is null then raise exception 'Sign in with Google first' using errcode = '42501'; end if;
  if public.my_household() is not null then raise exception 'You are already in a household' using errcode = '23505'; end if;
  insert into public.households (name) values (coalesce(v_name, 'Our kitchen')) returning id into v_household;
  insert into public.household_access (household_id, slot, email) values (v_household, 1, v_email);
  insert into public.household_state (household_id, data) values (v_household, public.initial_household_data());
  insert into public.household_sources (household_id, domain)
  values (v_household, 'tiffycooks.com'), (v_household, 'thewoksoflife.com');
  return v_household;
end
$$;

-- Adds a recipe site by any page URL on it, e.g. https://www.example.com/recipes/.
create function public.add_source(p_url text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_domain text := lower(substring(trim(coalesce(p_url, '')) from '^https?://([^/:?#@]+)'));
begin
  if v_household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  v_domain := regexp_replace(coalesce(v_domain, ''), '^www\.', '');
  if v_domain !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' or v_domain ~ '^[0-9.]+$' then
    raise exception 'Enter the web address of a recipe site, like https://example.com' using errcode = '22023';
  end if;
  if (select count(*) from public.household_sources s where s.household_id = v_household) >= 10 then
    raise exception 'A household can follow up to 10 recipe sites' using errcode = '22023';
  end if;
  insert into public.household_sources (household_id, domain) values (v_household, v_domain)
  on conflict do nothing;
  return v_domain;
end
$$;

create function public.remove_source(p_domain text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.household_sources s
  where s.household_id = public.my_household() and s.domain = lower(p_domain);
  if not found then raise exception 'Source not found' using errcode = '42704'; end if;
end
$$;

revoke all on function public.add_source(text), public.remove_source(text) from public, anon;
grant execute on function public.add_source(text), public.remove_source(text) to authenticated;
