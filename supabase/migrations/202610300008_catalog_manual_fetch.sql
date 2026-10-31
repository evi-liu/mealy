-- A household can ask for a fresh batch of catalog recipes from its sources,
-- at most once every 12 hours, so the source sites are never hammered.
create table public.catalog_fetches (
  household_id uuid primary key references public.households(id) on delete cascade,
  last_at timestamptz not null
);
alter table public.catalog_fetches enable row level security;
revoke all on public.catalog_fetches from anon, authenticated;

-- When the household may fetch next; null means now.
create function public.next_catalog_fetch() returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select case when f.last_at > now() - interval '12 hours'
    then f.last_at + interval '12 hours' end
  from public.catalog_fetches f
  where f.household_id = public.my_household()
$$;

-- Claims this household's fetch: null when granted (and recorded), else
-- the time it becomes available again.
create function public.claim_catalog_fetch() returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_last timestamptz;
begin
  if v_household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  select f.last_at into v_last from public.catalog_fetches f
  where f.household_id = v_household for update;
  if v_last > now() - interval '12 hours' then return v_last + interval '12 hours'; end if;
  insert into public.catalog_fetches as f (household_id, last_at) values (v_household, now())
  on conflict (household_id) do update set last_at = excluded.last_at;
  return null;
end
$$;

revoke all on function public.next_catalog_fetch(), public.claim_catalog_fetch() from public, anon;
grant execute on function public.next_catalog_fetch(), public.claim_catalog_fetch() to authenticated;
