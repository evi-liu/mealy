-- A private catalog of trusted-source recipe facts, refreshed by the
-- catalog-import Edge Function. Facts only: no directions, descriptions or
-- photographs. Household members can read it; only the service role writes.
create table public.catalog_recipes (
  id text primary key,
  source text not null check (source in ('tiffycooks.com', 'thewoksoflife.com')),
  url text not null unique check (url like 'https://%'),
  title text not null check (length(title) between 1 and 200),
  servings integer check (servings between 1 and 60),
  minutes integer check (minutes between 1 and 1440),
  ingredient_lines jsonb not null check (jsonb_typeof(ingredient_lines) = 'array'),
  categories jsonb not null default '[]' check (jsonb_typeof(categories) = 'array'),
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index catalog_recipes_source_published on public.catalog_recipes (source, published_at desc);

-- Every post URL the importer has looked at, so non-recipes are never refetched.
create table public.catalog_pages (
  url text primary key,
  source text not null,
  status text not null check (status in ('recipe', 'not_recipe', 'failed')),
  lastmod timestamptz,
  checked_at timestamptz not null default now()
);

-- Per-source progress: the newest sitemap date seen and the last weekly check.
create table public.catalog_sources (
  source text primary key,
  watermark timestamptz,
  checked_at timestamptz
);

alter table public.catalog_recipes enable row level security;
alter table public.catalog_pages enable row level security;
alter table public.catalog_sources enable row level security;
revoke all on public.catalog_recipes, public.catalog_pages, public.catalog_sources from anon, authenticated;
grant select on public.catalog_recipes to authenticated;
create policy "Household members read the recipe catalog" on public.catalog_recipes for select to authenticated
using ((select public.my_household()) is not null);
