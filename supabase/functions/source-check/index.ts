import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { refusal, robotsPolicy } from '../_shared/robots.ts'

// Checks a recipe site's robots.txt before a household adds it as a source,
// so the app can explain right away when the importer isn't allowed there.

const USER_AGENT =
  'MealyHouseholdPlanner/1.0 (checks robots.txt before following a recipe site; +https://evi-liu.github.io/mealy/)'

function siteDomain(value: string): string {
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ||
    /^[\d.]+$/.test(host) ||
    /(^|\.)(localhost|local|internal|home|lan|supabase\.co)$/.test(host)
  )
    throw new Error('Enter the web address of a recipe site.')
  return host
}

/** The site's robots.txt, or '' when it has none. */
async function robotsText(domain: string): Promise<string> {
  let url = new URL(`https://${domain}/robots.txt`)
  // Redirects are followed only within the same site (e.g. to www.).
  for (let hops = 0; hops <= 3; hops++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      break
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') ?? '', url)
      if (
        next.protocol !== 'https:' ||
        next.hostname.replace(/^www\./, '') !== domain
      )
        break
      url = next
      continue
    }
    if (response.status === 404 || response.status === 410) return ''
    if (response.ok) return (await response.text()).slice(0, 500_000)
    break
  }
  throw new Error("Couldn't reach that site to check its robots.txt.")
}

Deno.serve(async (req: Request) => {
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
  if (req.method !== 'POST') return respond(405, { error: 'POST required.' })
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer '))
    return respond(401, { error: 'Sign in required.' })
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    },
  )
  const user = await client.auth.getUser(authorization.slice(7))
  if (user.error || !user.data.user)
    return respond(401, { error: 'Sign in again.' })
  const membership = await client.rpc('my_household')
  if (membership.error || !membership.data)
    return respond(403, { error: 'Household access denied.' })
  let domain: string
  try {
    const { url } = z
      .object({ url: z.string().trim().min(1).max(2048) })
      .parse(await req.json())
    domain = siteDomain(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return respond(400, { error: 'Enter the web address of a recipe site.' })
  }
  try {
    const reason = refusal(robotsPolicy(await robotsText(domain)))
    return respond(200, { domain, allowed: !reason, reason })
  } catch (error) {
    return respond(200, {
      domain,
      allowed: false,
      reason:
        error instanceof Error
          ? error.message
          : "Couldn't check that site's robots.txt.",
    })
  }
})
