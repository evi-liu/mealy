create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our kitchen'
);

-- Provisioned by the administrator, never by browser clients.
create table public.household_access (
  household_id uuid not null references public.households(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  email text not null unique check (email = lower(email)),
  primary key (household_id, slot)
);

create table public.household_state (
  household_id uuid primary key references public.households(id) on delete cascade,
  version bigint not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data @> '{"schemaVersion":1}'),
  updated_at timestamptz not null default now()
);

create table public.household_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid not null references auth.users(id),
  kind text not null check (kind in ('settings','like','skip','undo','block','unblock','cooked','loved','plan','swap','pin','confirm','pantry','grocery','recipe','bookmark','new_week')),
  recipe_id text,
  created_at timestamptz not null default now()
);

create function public.my_household() returns uuid
language sql stable security definer set search_path = ''
as $$
  select a.household_id
  from public.household_access a
  join auth.users u on lower(u.email) = a.email
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and u.raw_app_meta_data ->> 'provider' = 'google'
  limit 1
$$;

revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

alter table public.households enable row level security;
alter table public.household_access enable row level security;
alter table public.household_state enable row level security;
alter table public.household_events enable row level security;

create policy "Household reads its name" on public.households for select to authenticated
using (id = (select public.my_household()));
create policy "Household reads its state" on public.household_state for select to authenticated
using (household_id = (select public.my_household()));
create policy "Household reads its evidence" on public.household_events for select to authenticated
using (household_id = (select public.my_household()));

revoke all on public.households, public.household_access, public.household_state, public.household_events from anon, authenticated;
grant select on public.households, public.household_state, public.household_events to authenticated;

-- One atomic compare-and-swap prevents a second phone from overwriting unseen work.
create function public.save_household(p_version bigint, p_data jsonb, p_kind text, p_recipe_id text default null)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  household uuid := public.my_household();
  next_version bigint;
begin
  if household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  if octet_length(p_data::text) > 2000000
    or p_data ->> 'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_data -> 'recipes') is distinct from 'array'
    or jsonb_typeof(p_data -> 'pantry') is distinct from 'array'
    or jsonb_typeof(p_data -> 'plan') is distinct from 'array'
    or jsonb_typeof(p_data -> 'settings') is distinct from 'object'
    or not coalesce(p_data ->> 'phase' in ('setup','swipe','plan'), false)
  then raise exception 'Invalid household document' using errcode = '22023'; end if;
  update public.household_state set data = p_data, version = version + 1, updated_at = now()
  where household_id = household and version = p_version
  returning version into next_version;
  if next_version is null then raise exception 'Household changed; reload before saving' using errcode = '40001'; end if;
  insert into public.household_events(household_id, actor, kind, recipe_id)
  values (household, auth.uid(), p_kind, p_recipe_id);
  return next_version;
end
$$;

revoke all on function public.save_household(bigint,jsonb,text,text) from public, anon;
grant execute on function public.save_household(bigint,jsonb,text,text) to authenticated;

-- Weak weekly skips are deliberately excluded from durable preference evidence.
create view public.recipe_evidence with (security_invoker = true) as
select household_id, recipe_id,
  count(*) filter (where kind = 'cooked') as cooked_events,
  count(*) filter (where kind = 'loved') as loved_events,
  max(created_at) filter (where kind in ('cooked', 'loved')) as last_positive_feedback
from public.household_events
where recipe_id is not null
group by household_id, recipe_id;
grant select on public.recipe_evidence to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 5242880, array['image/jpeg','image/png','image/webp']);

create policy "Household reads recipe images" on storage.objects for select to authenticated
using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select public.my_household())::text);
create policy "Household uploads recipe images" on storage.objects for insert to authenticated
with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select public.my_household())::text);
create policy "Household deletes recipe images" on storage.objects for delete to authenticated
using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select public.my_household())::text);

create table public.ai_rate_limits (
  household_id uuid primary key references public.households(id) on delete cascade,
  window_start timestamptz not null default now(),
  calls integer not null default 1
);
alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated;

create function public.claim_ai_call() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare household uuid := public.my_household(); calls integer;
begin
  if household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  insert into public.ai_rate_limits as limits (household_id) values (household)
  on conflict (household_id) do update set
    calls = case when limits.window_start < now() - interval '1 hour' then 1 else limits.calls + 1 end,
    window_start = case when limits.window_start < now() - interval '1 hour' then now() else limits.window_start end
  returning limits.calls into calls;
  return calls <= 20;
end
$$;
revoke all on function public.claim_ai_call() from public, anon;
grant execute on function public.claim_ai_call() to authenticated;
