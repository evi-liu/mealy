// robots.txt rules shared by catalog-import and source-check. Plain
// TypeScript (no Deno APIs) so the app's unit tests can exercise it too.

export const IMPORTER_AGENT = 'MealyHouseholdPlanner'

/** A notice in robots.txt comments that forbids automated scraping or mining. */
const prohibition =
  /(scrap\w*|data[ -]?min\w*|crawl\w*|automated means)[^#\n]{0,200}?\bprohibited\b|\bprohibited\b[^#\n]{0,200}?(scrap\w*|data[ -]?min\w*)/i

export type RobotsPolicy = {
  /** Whether this importer may fetch the path (and query) given. */
  allows: (path: string) => boolean
  /** The site's own words when its comments prohibit scraping. */
  notice: string | null
}

export function robotsPolicy(text: string): RobotsPolicy {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = []
  let current: (typeof groups)[number] | null = null
  let inAgents = false
  const comments: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const hash = raw.indexOf('#')
    if (hash >= 0) comments.push(raw.slice(hash + 1).trim())
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim()
    const match = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const field = match[1].toLowerCase()
    const value = match[2].trim()
    if (field === 'user-agent') {
      if (!current || !inAgents) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      inAgents = true
    } else if (current) {
      inAgents = false
      if (value) current.rules.push([field === 'allow', value])
    }
  }
  // Rules naming this importer win; otherwise every "*" group applies.
  const agent = IMPORTER_AGENT.toLowerCase()
  const named = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && agent.startsWith(a)),
  )
  const rules = (
    named.length ? named : groups.filter((g) => g.agents.includes('*'))
  ).flatMap((g) => g.rules)
  const pattern = (rule: string) =>
    new RegExp(
      '^' +
        rule
          .split('*')
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')
          .replace(/\\\$$/, '$'),
    )
  const joined = comments.join(' ').replace(/\s+/g, ' ')
  const found = prohibition.exec(joined)
  return {
    allows(path: string) {
      let best: [boolean, number] = [true, -1]
      for (const [allow, rule] of rules) {
        const stronger =
          rule.length > best[1] || (rule.length === best[1] && allow)
        if (stronger && pattern(rule).test(path)) best = [allow, rule.length]
      }
      return best[0]
    },
    notice: found ? sentenceAround(joined, found.index) : null,
  }
}

function sentenceAround(text: string, index: number) {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1)
  const end = text.indexOf('.', index)
  const sentence = text.slice(start, end < 0 ? undefined : end + 1).trim()
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence
}

/** Why the importer may not use a site at all, or null when it may. */
export function refusal(policy: RobotsPolicy): string | null {
  if (policy.notice)
    return `its robots.txt says automated scraping is prohibited ("${policy.notice}")`
  if (!policy.allows('/'))
    return 'its robots.txt does not allow automated importers'
  return null
}
