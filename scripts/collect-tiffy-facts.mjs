import { writeFile } from 'node:fs/promises'

const sources = [
  ['soy-noodles', 'soy-sauce-pan-fried-noodles-15-minutes/'],
  ['yaki-udon', 'yaki-udon-fried-udon/'],
  ['chicken-chow-mein', 'chicken-chow-mein-so-easy/'],
  ['pad-thai', 'pad-thai-in-15-minutes/'],
  ['taiwanese-chow-mein', 'taiwanese-chow-mein-authentic-traditional-recipe/'],
  ['salmon', 'spicy-honey-glazed-salmon-perfect-salmon-every-time/'],
  ['mapo-tofu', 'vegetarian-mapo-tofu-20-minutes/'],
  ['beef-stew', 'braised-taiwanese-instant-pot-beef-stew-紅燒牛肉/'],
  ['braised-pork', 'traditional-taiwanese-braised-pork-rice-滷肉飯/'],
  ['pepper-chicken', 'garlic-black-pepper-chicken-20-minutes-only/'],
]

function recipes(value) {
  if (Array.isArray(value)) return value.flatMap(recipes)
  if (!value || typeof value !== 'object') return []
  const types = Array.isArray(value['@type'])
    ? value['@type']
    : [value['@type']]
  return [
    ...(types.includes('Recipe') ? [value] : []),
    ...recipes(value['@graph']),
  ]
}

async function page(url) {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const target = new URL(url)
    if (
      target.protocol !== 'https:' ||
      target.hostname !== 'tiffycooks.com' ||
      target.port ||
      target.username ||
      target.password
    )
      throw new Error('Only public HTTPS pages on tiffycooks.com are allowed')
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`Redirect without a location: ${target}`)
      url = new URL(location, target).href
      continue
    }
    if (!response.ok)
      throw new Error(`Source returned ${response.status}: ${target}`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error(`Source has no response body: ${target}`)
    const decoder = new TextDecoder()
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 5 * 1024 * 1024) {
        await reader.cancel()
        throw new Error(`Source page is too large: ${target}`)
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return { url: target.href, html: chunks.join('') }
  }
  throw new Error('Too many source redirects')
}

const facts = []
for (const [id, path] of sources) {
  const { url, html } = await page(
    new URL(path, 'https://tiffycooks.com/').href,
  )
  const found = []
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ))
    found.push(...recipes(JSON.parse(match[1])))
  if (found.length !== 1)
    throw new Error(`Expected one structured recipe at ${url}`)
  const recipe = found[0]
  const yields = Array.isArray(recipe.recipeYield)
    ? recipe.recipeYield.map(String)
    : [String(recipe.recipeYield)]
  const yieldText = yields.find((value) =>
    /^\d+ (people|servings?)$/i.test(value),
  )
  const servings = yieldText ? Number.parseInt(yieldText, 10) : NaN
  const time = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(recipe.totalTime)
  const minutes = time ? Number(time[1] || 0) * 60 + Number(time[2] || 0) : NaN
  if (
    !Number.isInteger(servings) ||
    servings < 2 ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    typeof recipe.name !== 'string' ||
    !Array.isArray(recipe.recipeIngredient) ||
    !recipe.recipeIngredient.length ||
    recipe.recipeIngredient.some((line) => typeof line !== 'string')
  )
    throw new Error(`Source facts need manual review before collection: ${url}`)
  // Only factual fields are retained, never directions, descriptions or images.
  facts.push({
    id: `tiffy-facts-${id}`,
    title: recipe.name,
    url,
    servings,
    minutes,
    ingredients: recipe.recipeIngredient,
    retrievedAt: new Date().toISOString(),
  })
}
await writeFile(
  new URL('../src/tiffy-facts.json', import.meta.url),
  JSON.stringify(facts, null, 2) + '\n',
)
console.log(
  `Collected ${facts.length} factual snapshots; review the diff before publishing.`,
)
