-- Switching households without losing one. When the last member leaves a
-- household (including by accepting a request to join another), it is
-- deactivated rather than deleted. Its owner can bring it back later, which
-- moves them out of their current household.

alter table public.households
  add column owner_email text check (owner_email = lower(owner_email)),
  add column deactivated_at timestamptz;

-- Existing households: the first member is the owner.
update public.households h
set owner_email = (
  select a.email from public.household_access a
  where a.household_id = h.id order by a.slot limit 1
);

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
  insert into public.households (name, owner_email) values (coalesce(v_name, 'Our kitchen'), v_email)
  returning id into v_household;
  insert into public.household_access (household_id, slot, email) values (v_household, 1, v_email);
  insert into public.household_state (household_id, data) values (v_household, public.initial_household_data());
  insert into public.household_sources (household_id, domain)
  values (v_household, 'tiffycooks.com'), (v_household, 'thewoksoflife.com');
  return v_household;
end
$$;

-- Moves the caller out of their household; a household left empty is
-- deactivated, never deleted. Internal: only the functions below call it.
create function public.vacate_my_household() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid := public.my_household();
  v_email text := public.my_google_email();
begin
  if v_household is null then return; end if;
  delete from public.household_access a where a.household_id = v_household and a.email = v_email;
  if not exists (select 1 from public.household_access a where a.household_id = v_household) then
    update public.households h set deactivated_at = now() where h.id = v_household;
  end if;
end
$$;
revoke all on function public.vacate_my_household() from public, anon, authenticated;

create or replace function public.leave_household() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_household() is null then raise exception 'You are not in a household' using errcode = '42501'; end if;
  perform public.vacate_my_household();
end
$$;

-- Requests only count while the inviting household is active.
create or replace function public.my_requests()
returns table (id uuid, household_name text, requested_by text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, h.name, coalesce(nullif(p.display_name, ''), p.email, 'A household member'), r.created_at
  from public.household_requests r
  join public.households h on h.id = r.household_id and h.deactivated_at is null
  left join public.profiles p on p.id = r.requested_by
  where r.user_id = auth.uid() and r.status = 'pending' and public.my_google_email() is not null
  order by r.created_at desc
$$;

-- Accepting moves the caller: out of (and, if they were the last member,
-- deactivating) their current household, into the inviting one.
create or replace function public.respond_to_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.my_google_email();
  v_household uuid;
  v_slot smallint;
begin
  if v_email is null then raise exception 'Sign in with Google first' using errcode = '42501'; end if;
  select r.household_id into v_household
  from public.household_requests r
  join public.households h on h.id = r.household_id and h.deactivated_at is null
  where r.id = p_id and r.user_id = auth.uid() and r.status = 'pending'
  for update of r;
  if v_household is null then raise exception 'Request not found' using errcode = '42704'; end if;
  if p_accept then
    if public.my_household() = v_household then
      raise exception 'You are already in that household' using errcode = '23505';
    end if;
    select s into v_slot from generate_series(1, 8) s
    where s not in (select a.slot from public.household_access a where a.household_id = v_household)
    order by s limit 1;
    if v_slot is null then raise exception 'That household is full' using errcode = '22023'; end if;
    perform public.vacate_my_household();
    insert into public.household_access (household_id, slot, email) values (v_household, v_slot, v_email);
  end if;
  update public.household_requests r
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where r.id = p_id;
end
$$;

-- Deactivated households the caller owns and can bring back.
create function public.my_inactive_households()
returns table (id uuid, name text, deactivated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.name, h.deactivated_at from public.households h
  where h.owner_email = public.my_google_email() and h.deactivated_at is not null
  order by h.deactivated_at desc
$$;

create function public.reactivate_household(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_email text := public.my_google_email();
begin
  if v_email is null then raise exception 'Sign in with Google first' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.households h
    where h.id = p_id and h.owner_email = v_email and h.deactivated_at is not null
  ) then
    raise exception 'Household not found' using errcode = '42704';
  end if;
  perform public.vacate_my_household();
  insert into public.household_access (household_id, slot, email) values (p_id, 1, v_email);
  update public.households h set deactivated_at = null where h.id = p_id;
end
$$;

revoke all on function public.my_inactive_households(), public.reactivate_household(uuid) from public, anon;
grant execute on function public.my_inactive_households(), public.reactivate_household(uuid) to authenticated;
