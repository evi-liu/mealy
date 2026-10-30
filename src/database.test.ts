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
const carol = '20000000-0000-0000-0000-000000000005'
const dave = '20000000-0000-0000-0000-000000000006'
const erin = '20000000-0000-0000-0000-000000000007'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
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
      ('${alice}','one@example.test',now(),'{"provider":"google"}',null),
      ('${bob}','two@example.test',now(),'{"provider":"google"}',null),
      ('${third}','third@example.test',now(),'{"provider":"google"}',null),
      ('${outsider}','outsider@example.test',now(),'{"provider":"google"}',null),
      ('${carol}','carol@gmail.com',now(),'{"provider":"google"}','{"full_name":"Carol Cook","avatar_url":"https://example.test/c.png"}'),
      ('${dave}','dave@gmail.com',now(),'{"provider":"google"}','{"full_name":"Dave Dumpling"}'),
      ('${erin}','erin@gmail.com',null,'{"provider":"google"}','{"full_name":"Erin Unconfirmed"}');
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
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610300004_households.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  for (const file of [
    '202610300005_catalog_directions.sql',
    '202610300006_household_sources.sql',
    '202610300007_household_switching.sql',
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
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
        `insert into public.household_access(household_id, slot, email) values ('${householdA}',9,'fourth@example.test')`,
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
            [initialState(), 'unloved', 'demo-1'],
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
  it('lets a signed-in Google user create exactly one household', async () => {
    await asUser(erin, async () => {
      await expect(db.query('select public.sync_profile()')).rejects.toThrow(
        'Sign in with Google first',
      )
      await expect(
        db.query("select public.create_household('Nope')"),
      ).rejects.toThrow('Sign in with Google first')
    })
    await asUser(carol, async () => {
      await db.query('select public.sync_profile()')
      const created = await db.query<{ id: string }>(
        "select public.create_household('  Carol''s kitchen  ') as id",
      )
      const id = created.rows[0].id
      expect(
        (await db.query<{ id: string }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBe(id)
      expect(
        (
          await db.query<{
            name: string
            display_name: string
            is_me: boolean
          }>(
            'select name, display_name, is_me from public.household_overview()',
          )
        ).rows,
      ).toEqual([
        { name: "Carol's kitchen", display_name: 'Carol Cook', is_me: true },
      ])
      const state = await db.query<{ data: { phase: string } }>(
        'select data from public.household_state',
      )
      expect(state.rows[0].data.phase).toBe('setup')
      await expect(
        db.query("select public.create_household('Second')"),
      ).rejects.toThrow('already in a household')
      await db.query("select public.rename_household('Cozy corner')")
      await expect(db.query('select * from public.profiles')).rejects.toThrow(
        'permission denied',
      )
      await expect(
        db.query('select * from public.household_requests'),
      ).rejects.toThrow('permission denied')
    })
  })

  it('sends join requests only to existing users, who accept or decline them', async () => {
    await asUser(dave, () => db.query('select public.sync_profile()'))
    await asUser(alice, async () => {
      // Short queries return nothing; matches never include the caller.
      expect(
        (await db.query("select * from public.search_users('da')")).rows,
      ).toEqual([])
      const found = await db.query<{
        user_id: string
        display_name: string
        in_household: boolean
      }>("select * from public.search_users('dumpl')")
      expect(found.rows).toEqual([
        expect.objectContaining({
          user_id: dave,
          display_name: 'Dave Dumpling',
          in_household: false,
        }),
      ])
      // Wildcards in the query are literal, not a way to list everyone.
      expect(
        (await db.query("select * from public.search_users('%%%')")).rows,
      ).toEqual([])
      await expect(
        db.query('select public.request_member($1)', [outsider]),
      ).rejects.toThrow('has not used Mealy yet')
      const first = await db.query<{ id: string }>(
        'select public.request_member($1) as id',
        [dave],
      )
      const again = await db.query<{ id: string }>(
        'select public.request_member($1) as id',
        [dave],
      )
      expect(again.rows[0].id).toBe(first.rows[0].id)
      expect(
        (
          await db.query<{ email: string }>(
            'select email from public.household_sent_requests()',
          )
        ).rows,
      ).toEqual([{ email: 'dave@gmail.com' }])
    })
    // Someone else's request is invisible and cannot be answered.
    await asUser(carol, async () => {
      expect(
        (await db.query('select * from public.my_requests()')).rows,
      ).toEqual([])
      const pending = await asUser(dave, () =>
        db.query<{ id: string }>('select id from public.my_requests()'),
      )
      await asUser(carol, async () =>
        expect(
          db.query('select public.respond_to_request($1, true)', [
            pending.rows[0].id,
          ]),
        ).rejects.toThrow('Request not found'),
      )
    })
    await asUser(dave, async () => {
      const mine = await db.query<{ id: string; household_name: string }>(
        'select id, household_name from public.my_requests()',
      )
      expect(mine.rows).toHaveLength(1)
      await db.query('select public.respond_to_request($1, true)', [
        mine.rows[0].id,
      ])
      expect(
        (await db.query<{ id: string }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBe(householdA)
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toHaveLength(1)
      expect(
        (await db.query('select * from public.my_requests()')).rows,
      ).toEqual([])
    })
  })

  it('declines and withdraws requests, and lets members leave', async () => {
    const carolsHousehold = await asUser(carol, () =>
      db.query<{ id: string }>('select public.my_household() as id'),
    )
    // Alice asks Carol, who declines and keeps her own household.
    const toCarol = await asUser(alice, () =>
      db.query<{ id: string }>('select public.request_member($1) as id', [
        carol,
      ]),
    )
    await asUser(carol, async () => {
      await db.query('select public.respond_to_request($1, false)', [
        toCarol.rows[0].id,
      ])
      expect(
        (await db.query<{ id: string }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBe(carolsHousehold.rows[0].id)
    })
    // Carol's household asks Dave, then thinks better of it.
    const toDave = await asUser(carol, () =>
      db.query<{ id: string }>('select public.request_member($1) as id', [
        dave,
      ]),
    )
    await asUser(carol, () =>
      db.query('select public.withdraw_request($1)', [toDave.rows[0].id]),
    )
    await asUser(dave, async () => {
      expect(
        (await db.query('select * from public.my_requests()')).rows,
      ).toEqual([])
      await db.query('select public.leave_household()')
      expect(
        (await db.query<{ id: null }>('select public.my_household() as id'))
          .rows[0].id,
      ).toBeNull()
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toEqual([])
    })
    await asUser(outsider, async () => {
      await expect(
        db.query("select * from public.search_users('dave')"),
      ).rejects.toThrow('Household access denied')
      await expect(
        db.query('select public.request_member($1)', [dave]),
      ).rejects.toThrow('Household access denied')
    })
  })

  it('shows each household only the catalog recipes from its own sources', async () => {
    await db.exec(`
      insert into public.catalog_recipes(id, source, url, title, ingredient_lines, instructions)
      values ('example:pie', 'example.com', 'https://example.com/pie/', 'Pie', '["1 egg"]', '["Bake."]');
    `)
    await asUser(alice, async () => {
      const visible = async () =>
        (
          await db.query<{ id: string }>(
            'select id from public.catalog_recipes order by id',
          )
        ).rows.map((row) => row.id)
      // Existing households start with the two original sites.
      expect(await visible()).toEqual(['tiffycooks:test'])
      expect(
        (
          await db.query<{ add_source: string }>(
            "select public.add_source('https://www.Example.com/recipes/')",
          )
        ).rows[0].add_source,
      ).toBe('example.com')
      expect(await visible()).toEqual(['example:pie', 'tiffycooks:test'])
      for (const bad of [
        'not a url',
        'https://127.0.0.1/',
        'ftp://example.org',
      ])
        await expect(
          db.query('select public.add_source($1)', [bad]),
        ).rejects.toThrow('web address of a recipe site')
      await db.query("select public.remove_source('tiffycooks.com')")
      expect(await visible()).toEqual(['example:pie'])
      await expect(
        db.query(
          "insert into public.household_sources(household_id, domain) values ($1, 'evil.com')",
          [householdA],
        ),
      ).rejects.toThrow('permission denied')
    })
    // Another household's sources are invisible and unaffected.
    await asUser(carol, async () => {
      expect(
        (
          await db.query<{ domain: string }>(
            'select domain from public.household_sources order by domain',
          )
        ).rows.map((row) => row.domain),
      ).toEqual(['thewoksoflife.com', 'tiffycooks.com'])
      expect(
        (await db.query('select id from public.catalog_recipes')).rows,
      ).toEqual([{ id: 'tiffycooks:test' }])
    })
  })
  it('switching households deactivates an emptied one, which its owner can bring back', async () => {
    const myHousehold = () =>
      db
        .query<{ id: string | null }>('select public.my_household() as id')
        .then((r) => r.rows[0].id)
    const carols = await asUser(carol, myHousehold)
    await asUser(carol, () =>
      db.query("select public.add_source('https://example.com/')"),
    )
    const request = await asUser(alice, () =>
      db.query<{ id: string }>('select public.request_member($1) as id', [
        carol,
      ]),
    )
    await asUser(carol, async () => {
      // Carol is her household's only member: accepting deactivates it.
      await db.query('select public.respond_to_request($1, true)', [
        request.rows[0].id,
      ])
      expect(await myHousehold()).toBe(householdA)
      const inactive = await db.query<{ id: string; name: string }>(
        'select id, name from public.my_inactive_households()',
      )
      expect(inactive.rows).toEqual([{ id: carols, name: 'Cozy corner' }])
    })
    // Requests from a deactivated household are no longer offered.
    await db.exec(
      `insert into public.household_requests(household_id, user_id, requested_by)
       values ('${carols}', '${dave}', '${carol}')`,
    )
    await asUser(dave, async () =>
      expect(
        (await db.query('select * from public.my_requests()')).rows,
      ).toEqual([]),
    )
    // Only the owner can bring it back.
    await asUser(dave, () =>
      expect(
        db.query('select public.reactivate_household($1)', [carols]),
      ).rejects.toThrow('Household not found'),
    )
    await asUser(carol, async () => {
      await db.query('select public.reactivate_household($1)', [carols])
      expect(await myHousehold()).toBe(carols)
      expect(
        (await db.query('select * from public.my_inactive_households()')).rows,
      ).toEqual([])
      // Its data and sources came back with it.
      expect(
        (await db.query('select * from public.household_state')).rows,
      ).toHaveLength(1)
      expect(
        (
          await db.query<{ domain: string }>(
            'select domain from public.household_sources order by domain',
          )
        ).rows.map((r) => r.domain),
      ).toContain('example.com')
      // Leaving as the last member deactivates rather than deletes.
      await db.query('select public.leave_household()')
      expect(await myHousehold()).toBeNull()
      expect(
        (await db.query('select id from public.my_inactive_households()')).rows,
      ).toEqual([{ id: carols }])
    })
    // Alice's household kept its other members when Carol moved on.
    await asUser(alice, async () =>
      expect(await myHousehold()).toBe(householdA),
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
