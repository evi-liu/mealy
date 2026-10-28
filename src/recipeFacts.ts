import { z } from 'zod'
import snapshots from './tiffy-facts.json' with { type: 'json' }
import {
  recipeSchema,
  sourceUrlSchema,
  type Ingredient,
  type PendingIngredient,
  type Recipe,
  type State,
} from './domain'

const snapshotSchema = z.strictObject({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  url: sourceUrlSchema.refine(
    (url) => new URL(url).hostname === 'tiffycooks.com',
  ),
  servings: z.number().int().min(2).max(30),
  minutes: z.number().int().min(1).max(1440),
  ingredients: z.array(z.string().min(1).max(500)).min(1).max(60),
  retrievedAt: z.iso.datetime(),
})

const aliases: Partial<Record<string, Ingredient['unit']>> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
}
const counts: Partial<Record<string, string>> = {
  clove: 'clove',
  cloves: 'clove',
  pack: 'pack',
  packs: 'pack',
  block: 'block',
  blocks: 'block',
  stalk: 'stalk',
  stalks: 'stalk',
  slice: 'slice',
  slices: 'slice',
  piece: '',
  pieces: '',
}
const fractions: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
}
const countable =
  /^(green onions?|(?:large |small )?(?:onions?|carrots?|shallots?|potatoes|cabbage)|shiitake mushrooms?|peeled shrimp|eggs?|hard-boiled eggs?|chicken thighs?|bay leaf|star anise pods?)\b/i

function category(name: string): Ingredient['category'] {
  if (/sauce|stock|broth/i.test(name)) return 'Pantry'
  if (/chicken|pork|beef|salmon|shrimp|tofu|\beggs?\b/i.test(name))
    return 'Protein'
  if (/butter/i.test(name)) return 'Dairy'
  if (
    /onion|shallot|mushroom|garlic|ginger|carrot|cabbage|sprouts|red chili|potato/i.test(
      name,
    )
  )
    return 'Produce'
  if (
    /noodle|rice|sugar|oil|water|salt|pepper|vinegar|wine|starch|flour|honey|ketchup|spice|doubanjiang|tamarind|peanut|anise|bay leaf/i.test(
      name,
    )
  )
    return 'Pantry'
  return 'Other'
}

export function parseIngredientFact(
  sourceText: string,
):
  | { ingredient: Ingredient; pending?: never }
  | { ingredient?: never; pending: PendingIngredient } {
  const line = sourceText
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (value) => ` ${fractions[value]}`)
    .replace(/\s+/g, ' ')
    .trim()
  const range = /^\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s+/.test(line)
  const match = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/.exec(line)
  let amount: number | undefined
  let name = line.replace(/^\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s+/, '')
  if (match && !range) {
    const parts = match[1].split(' ')
    const fraction = parts.at(-1)!.split('/').map(Number)
    amount =
      fraction.length === 2
        ? (parts.length === 2 ? Number(parts[0]) : 0) +
          fraction[0] / fraction[1]
        : Number(parts[0])
    name = match[2]
  }
  let unit: Ingredient['unit'] | undefined
  const token = /^([a-z]+)\s+(.+)$/i.exec(name)
  const word = token?.[1].toLowerCase()
  if (word && aliases[word]) {
    unit = aliases[word]
    name = token![2]
  } else if (word && counts[word] !== undefined) {
    unit = 'each'
    name = token![2] + (counts[word] ? ` (${counts[word]})` : '')
  } else if (countable.test(name)) {
    unit = 'each'
  }
  const combined = /\+|\benough to\b/i.test(line)
  if (range || combined || !unit || !amount || !Number.isFinite(amount)) {
    return {
      pending: {
        name,
        unit,
        category: category(name),
        sourceText,
        reason: range
          ? 'Choose an amount within the source range.'
          : combined
            ? 'Separate the combined ingredients and enter each amount.'
            : !amount || !Number.isFinite(amount)
              ? 'The source does not specify one usable amount.'
              : 'Confirm a supported unit; no package weight or density was assumed.',
      },
    }
  }
  return { ingredient: { name, amount, unit, category: category(name) } }
}

export function recipeFromFacts(input: unknown): Recipe {
  const snapshot = snapshotSchema.parse(input)
  const parsed = snapshot.ingredients.map(parseIngredientFact)
  return recipeSchema.parse({
    id: snapshot.id,
    title: snapshot.title,
    description: '',
    servings: snapshot.servings,
    maxServings: snapshot.servings,
    minutes: snapshot.minutes,
    protein: 'Not reviewed',
    leftovers: false,
    potluck: false,
    source: 'reference',
    sourceUrl: snapshot.url,
    instructions: [],
    ingredients: parsed.flatMap((item) =>
      item.ingredient ? [item.ingredient] : [],
    ),
    facts: {
      retrievedAt: snapshot.retrievedAt,
      ingredientLines: snapshot.ingredients,
      pendingIngredients: parsed.flatMap((item) =>
        item.pending ? [item.pending] : [],
      ),
      needsReview: true,
    },
  })
}

export const tiffyRecipeFacts = snapshots.map(recipeFromFacts)

export function availableRecipeFacts(state: State): Recipe[] {
  return tiffyRecipeFacts.filter(
    (recipe) =>
      state.bookmarks.some((bookmark) => bookmark.url === recipe.sourceUrl) &&
      !state.recipes.some(
        (existing) =>
          existing.id === recipe.id || existing.sourceUrl === recipe.sourceUrl,
      ),
  )
}

export function addRecipeFacts(state: State): State {
  const available = availableRecipeFacts(state)
  if (!available.length)
    throw new Error(
      'No new Tiffy Cooks facts are available for your saved links.',
    )
  return { ...state, recipes: [...state.recipes, ...available] }
}
