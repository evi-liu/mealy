-- Run ONCE in the Supabase SQL editor after applying migrations.
-- Replace both example addresses with your two Google account emails.
-- This file contains no credentials and should never contain your actual emails in Git.
begin;
do $$
declare
  household uuid;
begin
  insert into public.households(name) values ('Our kitchen') returning id into household;
  insert into public.household_access(household_id, slot, email) values
    (household, 1, lower('first@example.com')),
    (household, 2, lower('second@example.com'));
  insert into public.household_state(household_id, data) values (
    household,
    jsonb_build_object(
      'schemaVersion', 1,
      'week', to_char(current_date - extract(dow from current_date)::int, 'YYYY-MM-DD'),
      'phase', 'setup',
      'settings', '{"dinners":2,"kairos":false,"traveling":false,"away":[]}'::jsonb,
      'recipes', '[]'::jsonb,
      'bookmarks', '[]'::jsonb,
      'pantry', '[]'::jsonb,
      'queue', '[]'::jsonb,
      'decisions', '{}'::jsonb,
      'history', '[]'::jsonb,
      'blocked', '[]'::jsonb,
      'loved', '[]'::jsonb,
      'cooked', '[]'::jsonb,
      'plan', '[]'::jsonb,
      'confirmed', false,
      'checked', '[]'::jsonb
    )
  );
end
$$;
commit;
