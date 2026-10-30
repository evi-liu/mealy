import { createClient } from 'npm:@supabase/supabase-js@2'

// Facts-only importer for the trusted-source recipe catalog. Called hourly by
// pg_cron; preloads up to PRELOAD recipes per site in small batches, then
// checks each site's sitemap at most weekly for posts newer than its
// watermark. Never stores directions, descriptions or photographs.
const SOURCES = {
  'tiffycooks.com': { short: 'tiffycooks' },
  'thewoksoflife.com': { short: 'thewoksoflife' },
} as const
type Source = keyof typeof SOURCES
const PRELOAD = 100
const BATCH = 15
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
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

/** Post URLs from the Yoast sitemap index, newest first. */
async function sitemapEntries(source: Source): Promise<Entry[]> {
  const index = await fetchText(`https://${source}/sitemap_index.xml`, source)
  const maps = [...index.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1])
    .filter((loc) => /\/post-sitemap\d*\.xml$/.test(loc))
  const entries: Entry[] = []
  for (const map of maps) {
    const xml = await fetchText(map, source)
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

/** The page's single structured recipe, reduced to facts. */
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
    categories: [
      ...list(recipe.recipeCategory),
      ...list(recipe.recipeCuisine),
    ].slice(0, 12),
    published_at:
      typeof recipe.datePublished === 'string' ? recipe.datePublished : null,
  }
}

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const secret = Deno.env.get('CATALOG_CRON_SECRET')
  if (!secret || !sameSecret(req.headers.get('x-catalog-secret') ?? '', secret))
    return respond(401, { error: 'Not authorized.' })
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const summary: Record<string, unknown> = {}
  for (const source of Object.keys(SOURCES) as Source[]) {
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
      const preloading = (count ?? 0) < PRELOAD
      const due =
        !progress?.checked_at ||
        Date.now() - Date.parse(progress.checked_at) > WEEK_MS
      if (!preloading && !due) {
        summary[source] = { skipped: 'checked this week' }
        continue
      }
      const entries = await sitemapEntries(source)
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
      for (const entry of todo) {
        await sleep(DELAY_MS)
        let status: 'recipe' | 'not_recipe' | 'failed' = 'failed'
        try {
          const facts = extractFacts(await fetchText(entry.url, source))
          if (facts) {
            const slug = new URL(entry.url).pathname
              .replace(/^\/|\/$/g, '')
              .slice(0, 150)
            const { error } = await admin.from('catalog_recipes').upsert({
              id: `${SOURCES[source].short}:${slug}`,
              source,
              url: entry.url,
              ...facts,
              published_at: facts.published_at ?? entry.lastmod,
              fetched_at: new Date().toISOString(),
            })
            if (error) throw error
            status = 'recipe'
            imported++
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
      summary[source] = { preloading, looked: todo.length, imported }
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
