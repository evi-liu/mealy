-- Recipe drafting is iterative, so it gets its own hourly budget instead of
-- consuming the shortlist ranking allowance.
create table public.ai_draft_rate_limits (
  household_id uuid primary key references public.households(id) on delete cascade,
  window_start timestamptz not null default now(),
  calls integer not null default 1
);
alter table public.ai_draft_rate_limits enable row level security;
revoke all on public.ai_draft_rate_limits from anon, authenticated;

create function public.claim_ai_draft_call() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare household uuid := public.my_household(); calls integer;
begin
  if household is null then raise exception 'Household access denied' using errcode = '42501'; end if;
  insert into public.ai_draft_rate_limits as limits (household_id) values (household)
  on conflict (household_id) do update set
    calls = case when limits.window_start < now() - interval '1 hour' then 1 else limits.calls + 1 end,
    window_start = case when limits.window_start < now() - interval '1 hour' then now() else limits.window_start end
  returning limits.calls into calls;
  return calls <= 60;
end
$$;
revoke all on function public.claim_ai_draft_call() from public, anon;
grant execute on function public.claim_ai_draft_call() to authenticated;
