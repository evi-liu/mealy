-- Household decision (2026-10-30): the private catalog stores each recipe's
-- cooking directions as well as its ingredient facts.
alter table public.catalog_recipes
  add column instructions jsonb not null default '[]'
    check (jsonb_typeof(instructions) = 'array');
