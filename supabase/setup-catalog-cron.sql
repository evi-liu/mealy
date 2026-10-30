-- Run ONCE in the Supabase SQL editor after deploying catalog-import.
-- Replace <project-ref> with the ref from your dashboard URL
-- (supabase.com/dashboard/project/<project-ref>). Nothing else to fill in:
-- the shared secret is generated here and kept in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<project-ref>.supabase.co', 'catalog_project_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'catalog_cron_secret');

-- Lets catalog-import (service role only) check the cron's secret.
create or replace function public.catalog_cron_secret() returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'catalog_cron_secret'
$$;
revoke all on function public.catalog_cron_secret() from public, anon, authenticated;
grant execute on function public.catalog_cron_secret() to service_role;

-- Saturdays only, 09:00-10:50 UTC, every 10 minutes. The first Saturday
-- finishes the 100-per-site preload in batches; after that each Saturday's
-- first run checks for new recipes and the rest return without visiting
-- any site.
select cron.schedule(
  'catalog-import',
  '*/10 9-10 * * 6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'catalog_project_url')
      || '/functions/v1/catalog-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-catalog-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'catalog_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- To stop importing: select cron.unschedule('catalog-import');
