-- Self-serve households. Anyone signing in with a confirmed Google account can
-- create a household, or accept a request to join one from a member. Requests
-- go only to people who already use Mealy and never expire. Membership stays
-- in household_access (keyed by email), so my_household() and every existing
-- policy keep working. All writes go through the checked functions below;
-- clients still cannot write these tables directly.

alter table public.household_access
  drop constraint household_access_slot_check,
  add constraint household_access_slot_check check (slot between 1 and 8),
  add column joined_at timestamptz not null default now();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  display_name text not null default '' check (length(display_name) <= 120),
  avatar_url text check (avatar_url is null or avatar_url like 'https://%'),
  updated_at timestamptz not null default now()
);

create table public.household_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index household_requests_one_pending
  on public.household_requests (household_id, user_id) where status = 'pending';

alter table public.profiles enable row level security;
alter table public.household_requests enable row level security;
revoke all on public.profiles, public.household_requests from anon, authenticated;

-- The caller's email, only for a confirmed Google identity.
create function public.my_google_email() returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and u.raw_app_meta_data ->> 'provider' = 'google'
$$;

create function public.initial_household_data() returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'week', to_char(current_date - extract(dow from current_date)::int, 'YYYY-MM-DD'),
    'phase', 'setup',
    'settings', '{"dinners":2,"kairos":false,"traveling":false,"away":[]}'::jsonb,
    'recipes', '[]'::jsonb, 'bookmarks', '[]'::jsonb, 'pantry', '[]'::jsonb,
    'queue', '[]'::jsonb, 'decisions', '{}'::jsonb, 'history', '[]'::jsonb,
    'blocked', '[]'::jsonb, 'loved', '[]'::jsonb, 'cooked', '[]'::jsonb,
    'plan', '[]'::jsonb, 'confirmed', false, 'checked', '[]'::jsonb
  )
$$;

-- Keeps the caller's profile in step with their Google account; signing in
-- is what makes someone findable by household members.
create function public.sync_profile() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.my_google_email();
  v_meta jsonb;
begin
  if v_email is null then raise exception 'Sign in with Google first' using errcode = '42501'; end if;
  select u.raw_user_meta_data into v_meta from auth.users u where u.id = auth.uid();
  insert into public.profiles as p (id, email, display_name, avatar_url)
  values (
    auth.uid(), v_email,
    left(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', ''), 120),
    case when v_meta ->> 'avatar_url' like 'https://%' then v_meta ->> 'avatar_url' end
  )
  on conflict (id) do update set
    email = excluded.email, display_name = excluded.display_name,
    avatar_url = excluded.avatar_url, updated_at = now();
end
$$;

create function public.create_household(p_name text) returns uuid
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
  return v_household;
end
$$;

create function public.rename_household(p_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_name text := left(nullif(trim(p_name), ''), 80);
begin
  if v_household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  if v_name is null then raise exception 'Enter a household name' using errcode = '22023'; end if;
  update public.households h set name = v_name where h.id = v_household;
end
$$;

create function public.household_overview()
returns table (household_id uuid, name text, email text, display_name text, avatar_url text, joined_at timestamptz, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.name, a.email, coalesce(p.display_name, ''), p.avatar_url, a.joined_at,
    a.email = public.my_google_email()
  from public.households h
  join public.household_access a on a.household_id = h.id
  left join public.profiles p on p.email = a.email
  where h.id = public.my_household()
  order by a.joined_at
$$;

-- Name or email search for members adding someone. At least three
-- characters, a handful of matches, never the caller or current members.
create function public.search_users(p_query text)
returns table (user_id uuid, display_name text, email text, avatar_url text, in_household boolean, requested boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if v_household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  if length(v_q) < 3 then return; end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.display_name, p.email, p.avatar_url,
      exists (select 1 from public.household_access a where a.email = p.email),
      exists (select 1 from public.household_requests r
              where r.household_id = v_household and r.user_id = p.id and r.status = 'pending')
    from public.profiles p
    where p.id <> auth.uid()
      and not exists (select 1 from public.household_access a
                      where a.household_id = v_household and a.email = p.email)
      and (p.email like v_q || '%' or lower(p.display_name) like '%' || v_q || '%')
    order by p.display_name, p.email
    limit 8;
end
$$;

create function public.request_member(p_user uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_email text;
  v_request uuid;
begin
  if v_household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  select p.email into v_email from public.profiles p where p.id = p_user;
  if v_email is null then raise exception 'That person has not used Mealy yet' using errcode = '42704'; end if;
  if exists (select 1 from public.household_access a where a.household_id = v_household and a.email = v_email) then
    raise exception 'They are already in your household' using errcode = '23505';
  end if;
  if (select count(*) from public.household_access a where a.household_id = v_household) >= 8 then
    raise exception 'A household can have up to 8 members' using errcode = '22023';
  end if;
  if (select count(*) from public.household_requests r
      where r.household_id = v_household and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Request limit reached. Try again tomorrow.' using errcode = '22023';
  end if;
  select r.id into v_request from public.household_requests r
  where r.household_id = v_household and r.user_id = p_user and r.status = 'pending';
  if v_request is null then
    insert into public.household_requests (household_id, user_id, requested_by)
    values (v_household, p_user, auth.uid()) returning id into v_request;
  end if;
  return v_request;
end
$$;

-- Requests this household has sent that are still waiting.
create function public.household_sent_requests()
returns table (id uuid, display_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, p.display_name, p.email, r.created_at
  from public.household_requests r
  join public.profiles p on p.id = r.user_id
  where r.household_id = public.my_household() and r.status = 'pending'
  order by r.created_at desc
$$;

create function public.withdraw_request(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.household_requests r set status = 'withdrawn', responded_at = now()
  where r.id = p_id and r.household_id = public.my_household() and r.status = 'pending';
  if not found then raise exception 'Request not found' using errcode = '42704'; end if;
end
$$;

-- Requests waiting for the caller's answer.
create function public.my_requests()
returns table (id uuid, household_name text, requested_by text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, h.name, coalesce(nullif(p.display_name, ''), p.email, 'A household member'), r.created_at
  from public.household_requests r
  join public.households h on h.id = r.household_id
  left join public.profiles p on p.id = r.requested_by
  where r.user_id = auth.uid() and r.status = 'pending' and public.my_google_email() is not null
  order by r.created_at desc
$$;

create function public.respond_to_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.my_google_email();
  v_household uuid;
  v_slot smallint;
begin
  if v_email is null then raise exception 'Sign in with Google first' using errcode = '42501'; end if;
  select r.household_id into v_household from public.household_requests r
  where r.id = p_id and r.user_id = auth.uid() and r.status = 'pending'
  for update;
  if v_household is null then raise exception 'Request not found' using errcode = '42704'; end if;
  if p_accept then
    if public.my_household() is not null then
      raise exception 'Leave your current household before joining another' using errcode = '23505';
    end if;
    select s into v_slot from generate_series(1, 8) s
    where s not in (select a.slot from public.household_access a where a.household_id = v_household)
    order by s limit 1;
    if v_slot is null then raise exception 'That household is full' using errcode = '22023'; end if;
    insert into public.household_access (household_id, slot, email) values (v_household, v_slot, v_email);
  end if;
  update public.household_requests r
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where r.id = p_id;
end
$$;

-- The last member cannot leave: the household's data would be orphaned.
create function public.leave_household() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_email text := public.my_google_email();
begin
  if v_household is null then raise exception 'You are not in a household' using errcode = '42501'; end if;
  if (select count(*) from public.household_access a where a.household_id = v_household) = 1 then
    raise exception 'You are the only member. Add someone before leaving.' using errcode = '22023';
  end if;
  delete from public.household_access a where a.household_id = v_household and a.email = v_email;
end
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'my_google_email()', 'sync_profile()', 'create_household(text)', 'rename_household(text)',
    'household_overview()', 'search_users(text)', 'request_member(uuid)',
    'household_sent_requests()', 'withdraw_request(uuid)', 'my_requests()',
    'respond_to_request(uuid,boolean)', 'leave_household()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$$;
revoke all on function public.initial_household_data() from public, anon, authenticated;
