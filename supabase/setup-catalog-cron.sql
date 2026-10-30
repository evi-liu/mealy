-- Run ONCE in the Supabase SQL editor after deploying catalog-import.
-- Replace both placeholders privately; do not commit the edited file.
--   <project-ref>   from the dashboard URL, e.g. hxglhpiplcpejevmnhpr
--   <cron-secret>   a long random string; set the same value as the
--                   CATALOG_CRON_SECRET Edge Function secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<project-ref>.supabase.co', 'catalog_project_url');
select vault.create_secret('<cron-secret>', 'catalog_cron_secret');

-- Hourly ticks are cheap: while the 100-per-site preload is incomplete each
-- run imports a small batch, and afterwards the function only reaches the
-- source sites once a week.
select cron.schedule(
  'catalog-import',
  '17 * * * *',
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
