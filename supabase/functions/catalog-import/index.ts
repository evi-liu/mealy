import { createClient } from 'npm:@supabase/supabase-js@2'
import { refusal, robotsPolicy } from '../_shared/robots.ts'

// Importer for the private recipe catalog. Called hourly by pg_cron. For each
// site any household follows, it preloads up to its preload limit in small
// batches, then checks the site's sitemap at most weekly for posts newer than
// its watermark. Stores each recipe's facts and directions, never photographs
// or narrative text.
type Source = string
// The two original sources preload 100 recipes; sites households add, 50.
const ORIGINAL_SOURCES = ['tiffycooks.com', 'thewoksoflife.com']
const preloadFor = (source: string) =>
  ORIGINAL_SOURCES.includes(source) ? 100 : 50
const BACKFILL = 10
const BATCH = 15
// Just under a week, so each Saturday's first run counts as due.
const WEEK_MS = 6 * 24 * 60 * 60 * 1000
const DELAY_MS = 1500
const USER_AGENT =
  'MealyHouseholdPlanner/1.0 (private two-person meal planner; +https://evi-liu.github.io/mealy/)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url: string, source: Source): Promise<string> {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const target = new URL(url)
    if (
      target.protocol !== 'https:' ||
      target.hostname.replace(/^www\./, '') !== source ||
      target.port ||
      target.username ||
      target.password
    )
      throw new Error(`Refusing to fetch outside ${source}`)
    const response = await fetch(target, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirect without a location')
      url = new URL(location, target).href
      continue
    }
    if (!response.ok) throw new Error(`Source returned ${response.status}`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let text = ''
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 5 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('Page too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  }
  throw new Error('Too many redirects')
}

type Entry = { url: string; lastmod: string | null }

/** The site's robots.txt policy; a missing or unreachable file allows all. */
async function sitePolicy(source: Source) {
  try {
    return robotsPolicy(await fetchText(`https://${source}/robots.txt`, source))
  } catch {
    return robotsPolicy('')
  }
}

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])

/**
 * Candidate post URLs from the site's sitemap, newest first. Prefers post or
 * recipe sitemaps in an index, skipping pages, categories, tags and authors.
 */
async function sitemapEntries(source: Source): Promise<Entry[]> {
  let root = ''
  for (const path of ['/sitemap_index.xml', '/sitemap.xml']) {
    try {
      root = await fetchText(`https://${source}${path}`, source)
      if (/<(sitemapindex|urlset)\b/.test(root)) break
    } catch {
      root = ''
    }
  }
  if (!/<(sitemapindex|urlset)\b/.test(root))
    throw new Error('No sitemap found')
  let maps = /<sitemapindex\b/.test(root) ? locs(root) : []
  const posts = maps.filter((loc) => /(post|recipe)[^/]*sitemap/i.test(loc))
  maps = (
    posts.length
      ? posts
      : maps.filter(
          (loc) =>
            !/(page|categor|tag|author|image|video)[^/]*sitemap/i.test(loc),
        )
  ).slice(0, 10)
  const documents = maps.length
    ? await Promise.all(maps.map((map) => fetchText(map, source)))
    : [root]
  const entries: Entry[] = []
  for (const xml of documents) {
    for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(block[1])?.[1]
      if (!loc || new URL(loc).pathname === '/' || /\/blog\/?$/.test(loc))
        continue
      const lastmod =
        /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(block[1])?.[1] ?? null
      entries.push({ url: loc, lastmod })
    }
  }
  return entries.sort((a, b) =>
    (b.lastmod ?? '').localeCompare(a.lastmod ?? ''),
  )
}

const entities: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
}
function plain(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&([a-z0-9]+);/gi, (m, name) => entities[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function recipeNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(recipeNodes)
  if (!value || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  return [
    ...(types.includes('Recipe') ? [node] : []),
    ...recipeNodes(node['@graph']),
  ]
}

function minutesOf(duration: unknown): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(
    String(duration ?? ''),
  )
  if (!m) return null
  const total =
    Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 ? total : null
}

const list = (value: unknown) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map(plain)
    .filter(Boolean)

/** Steps from recipeInstructions: strings, HowToSteps or HowToSections. */
function steps(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(steps)
  if (typeof value === 'string')
    return value.split(/\n+/).map(plain).filter(Boolean)
  if (!value || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  if (node.itemListElement) return steps(node.itemListElement)
  const text = plain(node.text ?? node.name)
  return text ? [text] : []
}

/** The page's single structured recipe: facts and directions. */
function extractFacts(html: string) {
  const found: Record<string, unknown>[] = []
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      found.push(...recipeNodes(JSON.parse(match[1])))
    } catch {
      // Malformed structured data on one script tag; keep looking.
    }
  }
  if (found.length !== 1) return null
  const recipe = found[0]
  const ingredients = list(recipe.recipeIngredient).slice(0, 60)
  const title = plain(recipe.name).slice(0, 200)
  if (!title || !ingredients.length) return null
  const servings = list(recipe.recipeYield)
    .map((value) => /^(\d+)\b/.exec(value)?.[1])
    .map(Number)
    .find((n) => Number.isInteger(n) && n >= 1 && n <= 60)
  const minutes =
    minutesOf(recipe.totalTime) ??
    ((minutesOf(recipe.prepTime) ?? 0) + (minutesOf(recipe.cookTime) ?? 0) ||
      null)
  return {
    title,
    servings: servings ?? null,
    minutes: minutes && minutes <= 1440 ? minutes : null,
    ingredient_lines: ingredients.map((line) => line.slice(0, 500)),
    instructions: steps(recipe.recipeInstructions)
      .slice(0, 40)
      .map((step) => step.slice(0, 2000)),
    categories: [
      ...list(recipe.recipeCategory),
      ...list(recipe.recipeCuisine),
    ].slice(0, 12),
    published_at:
      typeof recipe.datePublished === 'string' ? recipe.datePublished : null,
  }
}

type Admin = ReturnType<typeof createClient>

/** Fetches one post and records it; true when it held a recipe. */
async function importPage(admin: Admin, source: Source, entry: Entry) {
  await sleep(DELAY_MS)
  let status: 'recipe' | 'not_recipe' | 'failed' = 'failed'
  try {
    const facts = extractFacts(await fetchText(entry.url, source))
    if (facts) {
      const slug = new URL(entry.url).pathname
        .replace(/^\/|\/$/g, '')
        .slice(0, 150)
      const { error } = await admin.from('catalog_recipes').upsert({
        id: `${source.replace(/\.com$/, '').replace(/\./g, '-')}:${slug}`,
        source,
        url: entry.url,
        ...facts,
        published_at: facts.published_at ?? entry.lastmod,
        fetched_at: new Date().toISOString(),
      })
      if (error) throw error
      status = 'recipe'
    } else status = 'not_recipe'
  } catch (error) {
    console.error(
      'Catalog page failed',
      source,
      error instanceof Error ? error.message : error,
    )
  }
  await admin.from('catalog_pages').upsert({
    url: entry.url,
    source,
    status,
    lastmod: entry.lastmod,
    checked_at: new Date().toISOString(),
  })
  return status === 'recipe'
}

/** Posts on a site this importer may read and hasn't seen, newest first. */
async function unseenEntries(admin: Admin, source: Source) {
  const policy = await sitePolicy(source)
  if (refusal(policy)) return []
  const entries = (await sitemapEntries(source)).filter((entry) => {
    const url = new URL(entry.url)
    return policy.allows(url.pathname + url.search)
  })
  const { data: seenRows } = await admin
    .from('catalog_pages')
    .select('url')
    .eq('source', source)
  const seen = new Set((seenRows ?? []).map((row) => row.url))
  return entries.filter((entry) => !seen.has(entry.url))
}

const MANUAL_LIMIT = 50
// Stay well inside the Edge Function time limit.
const MANUAL_BUDGET_MS = 100_000

/**
 * A household's "Fetch new recipes": up to MANUAL_LIMIT recipes it doesn't
 * have yet, taken in turns across its sources, once every 12 hours.
 */
async function manualFetch(req: Request): Promise<Response> {
  const allowedOrigin = Deno.env.get('APP_ORIGIN')
  const origin = req.headers.get('origin')
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin ?? '',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers })
  if (!allowedOrigin || (origin && origin !== allowedOrigin))
    return respond(403, { error: 'Origin not allowed.' })
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  const authorization = req.headers.get('Authorization') ?? ''
  const member = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    },
  )
  const user = await member.auth.getUser(authorization.slice(7))
  if (user.error || !user.data.user)
    return respond(401, { error: 'Sign in again.' })
  const claim = await member.rpc('claim_catalog_fetch')
  if (claim.error) return respond(403, { error: 'Household access denied.' })
  if (claim.data)
    return respond(429, {
      error: 'You can fetch new recipes again later.',
      nextAt: claim.data,
    })
  const { data: followed } = await member
    .from('household_sources')
    .select('domain')
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const queues = new Map<Source, Entry[]>()
  for (const { domain } of followed ?? []) {
    try {
      queues.set(domain, await unseenEntries(admin, domain))
    } catch (error) {
      console.error('Manual fetch skipped a source', domain, error)
    }
  }
  const started = Date.now()
  const perSource: Record<string, number> = {}
  let imported = 0
  let partial = false
  // Take turns across sources so one site isn't asked for everything.
  while (
    imported < MANUAL_LIMIT &&
    [...queues.values()].some((q) => q.length)
  ) {
    for (const [source, queue] of queues) {
      const entry = queue.shift()
      if (!entry) continue
      if (Date.now() - started > MANUAL_BUDGET_MS) {
        partial = true
        break
      }
      if (await importPage(admin, source, entry)) {
        imported++
        perSource[source] = (perSource[source] ?? 0) + 1
        if (imported >= MANUAL_LIMIT) break
      }
    }
    if (partial) break
  }
  return respond(200, { imported, perSource, partial })
}

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  // Household members fetch on demand with their own sign-in; the weekly
  // cron uses the shared secret instead.
  if (!req.headers.has('x-catalog-secret')) return manualFetch(req)
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  // The cron sends the secret that setup-catalog-cron.sql generated in Vault.
  const { data: secret } = await admin.rpc('catalog_cron_secret')
  if (
    typeof secret !== 'string' ||
    !secret ||
    !sameSecret(req.headers.get('x-catalog-secret') ?? '', secret)
  )
    return respond(401, { error: 'Not authorized.' })
  const summary: Record<string, unknown> = {}
  const { data: followed, error: sourcesError } = await admin
    .from('household_sources')
    .select('domain')
  if (sourcesError) return respond(500, { error: 'Could not read sources.' })
  const sources = [...new Set((followed ?? []).map((row) => row.domain))]
  for (const source of sources) {
    try {
      const { count } = await admin
        .from('catalog_recipes')
        .select('id', { count: 'exact', head: true })
        .eq('source', source)
      const { data: progress } = await admin
        .from('catalog_sources')
        .select('watermark, checked_at')
        .eq('source', source)
        .maybeSingle()
      const PRELOAD = preloadFor(source)
      const preloading = (count ?? 0) < PRELOAD
      const due =
        !progress?.checked_at ||
        Date.now() - Date.parse(progress.checked_at) > WEEK_MS
      if (!preloading && !due) {
        summary[source] = { skipped: 'checked this week' }
        continue
      }
      const policy = await sitePolicy(source)
      const refused = refusal(policy)
      if (refused) {
        summary[source] = { skipped: refused }
        continue
      }
      const entries = (await sitemapEntries(source)).filter((entry) => {
        const url = new URL(entry.url)
        return policy.allows(url.pathname + url.search)
      })
      const { data: seenRows } = await admin
        .from('catalog_pages')
        .select('url')
        .eq('source', source)
      const seen = new Set((seenRows ?? []).map((row) => row.url))
      const watermark = progress?.watermark ?? null
      const todo = entries
        .filter((e) => !seen.has(e.url))
        // After the preload, only posts newer than the last check count as new.
        .filter(
          (e) => preloading || !watermark || (e.lastmod ?? '') > watermark,
        )
        .slice(0, preloading ? Math.min(BATCH, PRELOAD - (count ?? 0)) : BATCH)
      let imported = 0
      for (const entry of todo)
        if (await importPage(admin, source, entry)) imported++
      // Recipes imported before directions were kept get them now.
      const { data: missing } = await admin
        .from('catalog_recipes')
        .select('id, url')
        .eq('source', source)
        .eq('instructions', '[]')
        .limit(BACKFILL)
      let backfilled = 0
      for (const row of missing ?? []) {
        await sleep(DELAY_MS)
        try {
          const facts = extractFacts(await fetchText(row.url, source))
          if (facts?.instructions.length) {
            await admin
              .from('catalog_recipes')
              .update({ instructions: facts.instructions })
              .eq('id', row.id)
            backfilled++
          }
        } catch (error) {
          console.error(
            'Directions backfill failed',
            source,
            error instanceof Error ? error.message : error,
          )
        }
      }
      const newest = entries[0]?.lastmod ?? watermark
      // The weekly clock only starts once the preload is finished.
      if (
        !preloading ||
        (count ?? 0) + imported >= PRELOAD ||
        todo.length === 0
      )
        await admin.from('catalog_sources').upsert({
          source,
          watermark: newest,
          checked_at: new Date().toISOString(),
        })
      summary[source] = {
        preloading,
        looked: todo.length,
        imported,
        backfilled,
      }
    } catch (error) {
      console.error(
        'Catalog source failed',
        source,
        error instanceof Error ? error.message : error,
      )
      summary[source] = { error: 'failed; will retry next run' }
    }
  }
  return respond(200, summary)
})
