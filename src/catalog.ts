import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import {
  normalize,
  recipeSchema,
  sourceUrlSchema,
  type Ingredient,
  type PendingIngredient,
  type Recipe,
  type State,
} from './domain'
import { parseIngredientFact } from './recipeFacts'
import { supabase } from './store'

// Rows written by the catalog-import Edge Function for the household's sources.
export const catalogRowSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(200),
  url: sourceUrlSchema,
  title: z.string().min(1).max(200),
  servings: z.number().int().nullable(),
  minutes: z.number().int().nullable(),
  ingredient_lines: z.array(z.string().max(500)).max(60),
  instructions: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  published_at: z.string().nullable(),
  fetched_at: z.string(),
})
export type CatalogRow = z.infer<typeof catalogRowSchema>

// Lines that never become grocery quantities, so they don't block a recipe.
const incidental =
  /\b(to taste|optional|for garnish|garnish(?:ing)?|as needed|for serving|to serve|pinch|dash)\b/i
const notAMeal =
  /\b(desserts?|drinks?|beverages?|cocktails?|sauces?|condiments?|dips?|dressings?|baking|breads?|snacks?|pickles?|spice blends?)\b/i

/**
 * Before parsing: drop the source's parenthetical notes (they help cooks, not
 * grocery merging) and read "8 oz." like "8 oz".
 */
const tidyLine = (line: string) =>
  line
    .replace(/\(+[^()]*\)+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[,;:]\s*$/, '')
    .trim()
    .replace(
      /^([\d\s./½¼¾⅓⅔⅛⅜⅝⅞-]+)\s*(oz|lbs?|tsp|tbsp|g|kg|ml|l)\.(?=\s)/i,
      '$1 $2',
    )

export type CatalogEntry = {
  recipe: Recipe
  /** Every line parsed, with yield and time, so it can be planned at once. */
  clean: boolean
  /** Desserts, drinks and sauces stay out of the dinner stack. */
  meal: boolean
}

export function catalogRecipe(row: CatalogRow): CatalogEntry | null {
  const ingredients: Ingredient[] = []
  const pending: PendingIngredient[] = []
  for (const line of row.ingredient_lines) {
    const parsed = parseIngredientFact(tidyLine(line))
    if (parsed.ingredient) ingredients.push(parsed.ingredient)
    else if (incidental.test(line)) continue
    else if (parsed.amount && parsed.pending.reason.startsWith('Confirm')) {
      // A plain number of things, e.g. "5 cilantro stems": a count.
      ingredients.push({
        name: parsed.pending.name,
        amount: parsed.amount,
        unit: 'each',
        category: parsed.pending.category,
      })
    } else pending.push({ ...parsed.pending, sourceText: line })
  }
  const clean = Boolean(
    !pending.length && row.servings && row.minutes && ingredients.length,
  )
  const servings = Math.min(row.servings ?? 2, 30)
  const protein = ingredients.find((i) => i.category === 'Protein')?.name
  const recipe = recipeSchema.safeParse({
    id: `catalog-${row.id.replace(/[^a-z0-9-]+/gi, '-')}`.slice(0, 200),
    title: row.title,
    description: '',
    servings,
    // Labeled import defaults: a double batch with leftovers for lunches.
    maxServings: clean ? Math.max(2, servings * 2) : Math.max(2, servings),
    minutes: row.minutes ?? 30,
    protein: protein
      ? protein.charAt(0).toUpperCase() + protein.slice(1)
      : 'Vegetables',
    leftovers: clean,
    potluck: false,
    source: 'reference',
    sourceUrl: row.url,
    catalogId: row.id,
    instructions: row.instructions
      .map((step) => step.trim().slice(0, 2000))
      .filter(Boolean)
      .slice(0, 40),
    ingredients,
    facts: {
      retrievedAt: new Date(row.fetched_at).toISOString(),
      ingredientLines: row.ingredient_lines.length
        ? row.ingredient_lines
        : ['(no ingredient lines)'],
      pendingIngredients: pending,
      needsReview: !clean,
    },
  })
  if (!recipe.success) return null
  return {
    recipe: recipe.data,
    clean,
    meal: !row.categories.some((category) => notAMeal.test(category)),
  }
}

const sameUrl = (a?: string, b?: string) =>
  !!a && !!b && a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** Catalog recipes the household hasn't already saved, adopted or blocked. */
export function unsaved(recipes: Recipe[], state: State) {
  return recipes.filter(
    (recipe) =>
      !state.blocked.includes(recipe.id) &&
      !state.recipes.some(
        (r) => r.id === recipe.id || sameUrl(r.sourceUrl, recipe.sourceUrl),
      ),
  )
}

export type Catalog = {
  /** Clean dinner recipes ready for the swipe stack. */
  ready: Recipe[]
  /** Dinner recipes waiting for a quick review of their amounts. */
  review: Recipe[]
  loaded: boolean
  error: string
  /** Loads the catalog again, e.g. after fetching new recipes. */
  reload: () => void
}

export function splitCatalog(entries: CatalogEntry[]) {
  const meals = entries.filter((entry) => entry.meal)
  return {
    ready: meals.filter((e) => e.clean).map((e) => e.recipe),
    review: meals.filter((e) => !e.clean).map((e) => e.recipe),
  }
}

/** Loads the shared catalog once per signed-in session. */
export function useCatalog(): Catalog {
  const [loads, setLoads] = useState(0)
  const [catalog, setCatalog] = useState<Omit<Catalog, 'reload'>>({
    ready: [],
    review: [],
    loaded: false,
    error: '',
  })
  const reload = useCallback(() => setLoads((n) => n + 1), [])
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase
      .from('catalog_recipes')
      .select(
        'id,source,url,title,servings,minutes,ingredient_lines,instructions,categories,published_at,fetched_at',
      )
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return
        if (error)
          return setCatalog((c) => ({
            ...c,
            loaded: true,
            error: 'The recipe catalog could not be loaded.',
          }))
        const entries = (data ?? []).flatMap((row) => {
          const parsed = catalogRowSchema.safeParse(row)
          const entry = parsed.success ? catalogRecipe(parsed.data) : null
          return entry ? [entry] : []
        })
        setCatalog({ ...splitCatalog(entries), loaded: true, error: '' })
      })
    return () => {
      active = false
    }
  }, [loads])
  return { ...catalog, reload }
}

export { normalize }
