import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initialState } from './domain'

const householdA = '10000000-0000-0000-0000-000000000001'
const householdB = '10000000-0000-0000-0000-000000000002'
const alice = '20000000-0000-0000-0000-000000000001'
const bob = '20000000-0000-0000-0000-000000000002'
const outsider = '20000000-0000-0000-0000-000000000003'
const third = '20000000-0000-0000-0000-000000000004'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema public, auth, storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;
  `)
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610280001_household.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(`
    insert into public.households(id) values ('${householdA}'), ('${householdB}');
    insert into public.household_access values ('${householdA}',1,'one@example.test'), ('${householdA}',2,'two@example.test');
    insert into auth.users values
      ('${alice}','one@example.test',now(),'{"provider":"google"}'),
      ('${bob}','two@example.test',now(),'{"provider":"google"}'),
      ('${third}','third@example.test',now(),'{"provider":"google"}'),
      ('${outsider}','outsider@example.test',now(),'{"provider":"google"}');
  `)
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610290001_third_household_account.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610300001_ai_recipe_drafts.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610300002_unloved_event.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610300003_recipe_catalog.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(`
    insert into public.catalog_recipes(id, source, url, title, servings, minutes, ingredient_lines)
    values ('tiffycooks:test', 'tiffycooks.com', 'https://tiffycooks.com/test/', 'Test noodles', 4, 20, '["1 tbsp soy sauce"]');
  `)
  for (const id of [householdA, householdB])
    await db.query(
      'insert into public.household_state(household_id,data) values ($1,$2)',
      [id, initialState()],
    )
}, 30000)

afterAll(async () => {
  await db?.close()
})
async function asUser<T>(
  user: string | null,
  action: () => Promise<T>,
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? '',
  ])
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    return await action()
  } finally {
    await db.exec('reset role')
  }
}
describe('actual migration on embedded PostgreSQL', () => {
  it('preserves existing access and permits an administrator-provisioned third account', async () => {
    await asUser(third, async () => {
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toEqual([])
    })
    await db.exec(
      `insert into public.household_access values ('${householdA}',3,'third@example.test')`,
    )
    for (const user of [alice, bob, third])
      await asUser(user, async () => {
        const result = await db.query<{ id: string }>(
          'select public.my_household() as id',
        )
        expect(result.rows[0].id).toBe(householdA)
        const state = await db.query('select * from public.household_state')
        expect(state.rows).toHaveLength(1)
      })
    await expect(
      db.exec(
        `insert into public.household_access values ('${householdA}',4,'fourth@example.test')`,
      ),
    ).rejects.toThrow()
  })
  it('denies anonymous and unlisted users, even with a known household ID', async () => {
    await asUser(null, async () => {
      await expect(
        db.query('select * from public.household_state'),
      ).rejects.toThrow('permission denied')
      await expect(db.query('select public.my_household()')).rejects.toThrow(
        'permission denied',
      )
    })
    await asUser(outsider, async () => {
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toEqual([])
      await expect(
        db.query('select public.save_household(0,$1,$2,null)', [
          initialState(),
          'settings',
        ]),
      ).rejects.toThrow('access denied')
    })
  })
  it('does not trust an unconfirmed email or another auth provider', async () => {
    await db.exec(
      `update auth.users set raw_app_meta_data='{"provider":"email"}' where id='${alice}'`,
    )
    await asUser(alice, async () =>
      expect(
        (await db.query<{ id: null }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBeNull(),
    )
    await db.exec(
      `update auth.users set raw_app_meta_data='{"provider":"google"}',email_confirmed_at=null where id='${alice}'`,
    )
    await asUser(alice, async () =>
      expect(
        (await db.query<{ id: null }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBeNull(),
    )
    await db.exec(
      `update auth.users set email_confirmed_at=now() where id='${alice}'`,
    )
  })
  it('saves state and event atomically, rejects stale writes from the second phone', async () => {
    await asUser(alice, async () => {
      expect(
        (
          await db.query<{ v: number }>(
            'select public.save_household(0,$1,$2,null) as v',
            [initialState(), 'settings'],
          )
        ).rows[0].v,
      ).toBe(1)
    })
    await asUser(bob, async () => {
      await expect(
        db.query('select public.save_household(0,$1,$2,null)', [
          initialState(),
          'settings',
        ]),
      ).rejects.toThrow('reload')
      expect(
        (await db.query('select * from public.household_events')).rows,
      ).toHaveLength(1)
      await expect(
        db.query('select public.save_household(1,$1,$2,null)', [
          initialState(),
          'invalid-event',
        ]),
      ).rejects.toThrow()
      expect(
        (
          await db.query<{ version: number }>(
            'select version from public.household_state',
          )
        ).rows[0].version,
      ).toBe(1)
      // Taking back a loved recipe is a recorded event of its own.
      expect(
        (
          await db.query<{ v: number }>(
            'select public.save_household(1,$1,$2,$3) as v',
            [initialState(), 'unloved', 'fixture-1'],
          )
        ).rows[0].v,
      ).toBe(2)
    })
  })
  it('forbids direct mutation, self-invitation, and cross-household image access', async () => {
    await asUser(alice, async () => {
      await expect(
        db.exec(
          `insert into public.household_access values ('${householdB}',1,'one@example.test')`,
        ),
      ).rejects.toThrow('permission denied')
      await expect(
        db.exec('update public.household_state set version=99'),
      ).rejects.toThrow('permission denied')
      await db.exec(
        `insert into storage.objects(bucket_id,name) values ('recipe-images','${householdA}/photo.png')`,
      )
      await expect(
        db.exec(
          `insert into storage.objects(bucket_id,name) values ('recipe-images','${householdB}/photo.png')`,
        ),
      ).rejects.toThrow('row-level security')
    })
    await asUser(outsider, async () =>
      expect(
        (await db.query('select * from storage.objects')).rows,
      ).toHaveLength(0),
    )
  })
  it('applies database-backed AI rate limits', async () => {
    await asUser(alice, async () => {
      for (let i = 0; i < 21; i++) {
        expect(
          (
            await db.query<{ allowed: boolean }>(
              'select public.claim_ai_call() as allowed',
            )
          ).rows[0].allowed,
        ).toBe(i < 20)
      }
    })
  })
  it('gives recipe drafting its own hourly budget', async () => {
    await asUser(bob, async () => {
      for (let i = 0; i < 61; i++) {
        expect(
          (
            await db.query<{ allowed: boolean }>(
              'select public.claim_ai_draft_call() as allowed',
            )
          ).rows[0].allowed,
        ).toBe(i < 60)
      }
      await expect(
        db.query('select * from public.ai_draft_rate_limits'),
      ).rejects.toThrow('permission denied')
    })
    await asUser(outsider, async () =>
      expect(db.query('select public.claim_ai_draft_call()')).rejects.toThrow(
        'Household access denied',
      ),
    )
  })
  it('lets household members read the recipe catalog but never write it', async () => {
    await asUser(alice, async () => {
      expect(
        (await db.query('select id from public.catalog_recipes')).rows,
      ).toEqual([{ id: 'tiffycooks:test' }])
      await expect(
        db.query(
          `insert into public.catalog_recipes(id, source, url, title, ingredient_lines) values ('x', 'tiffycooks.com', 'https://tiffycooks.com/x/', 'X', '[]')`,
        ),
      ).rejects.toThrow('permission denied')
      await expect(
        db.query(`update public.catalog_recipes set title = 'Changed'`),
      ).rejects.toThrow('permission denied')
      await expect(
        db.query('select * from public.catalog_pages'),
      ).rejects.toThrow('permission denied')
      await expect(
        db.query('select * from public.catalog_sources'),
      ).rejects.toThrow('permission denied')
    })
    for (const user of [outsider, null])
      await asUser(user, async () =>
        expect(
          (
            await db
              .query('select id from public.catalog_recipes')
              .catch(() => ({ rows: [] }))
          ).rows,
        ).toEqual([]),
      )
  })
  it('revokes access immediately when an allowlist entry is removed', async () => {
    await db.exec(
      `delete from public.household_access where email='two@example.test'`,
    )
    await asUser(bob, async () => {
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toEqual([])
      expect((await db.query('select * from storage.objects')).rows).toEqual([])
      expect(
        (await db.query('select * from public.recipe_evidence')).rows,
      ).toEqual([])
    })
  })
})
