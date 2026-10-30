import { describe, expect, it } from 'vitest'
import {
  catalogRecipe,
  splitCatalog,
  unsaved,
  type CatalogRow,
} from './catalog'
import {
  adoptQueued,
  initialState,
  newWeek,
  recipeReady,
  shortlist,
} from './domain'

// Invented fixtures in each source's format; not copied recipe content.
function row(patch: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 'tiffycooks:test-stir-fry',
    source: 'tiffycooks.com',
    url: 'https://tiffycooks.com/test-stir-fry/',
    title: 'Test Stir Fry',
    servings: 4,
    minutes: 25,
    ingredient_lines: [
      '1 lb chicken thighs (sliced)',
      '2 tbsp soy sauce',
      '8 oz. dried noodles',
      '3 cloves garlic',
      '5 cilantro stems',
      'Salt ((to taste))',
    ],
    categories: ['Dinner', 'Main Course'],
    published_at: '2026-10-29T00:00:00+00:00',
    fetched_at: '2026-10-30T05:00:00.123+00:00',
    ...patch,
  }
}

describe('catalog recipes', () => {
  it('turns a fully parsed import into a ready, plannable reference recipe', () => {
    const entry = catalogRecipe(row())!
    expect(entry.clean).toBe(true)
    expect(entry.meal).toBe(true)
    expect(recipeReady(entry.recipe)).toBe(true)
    expect(entry.recipe).toMatchObject({
      id: 'catalog-tiffycooks-test-stir-fry',
      catalogId: 'tiffycooks:test-stir-fry',
      source: 'reference',
      instructions: [],
      leftovers: true,
      maxServings: 8,
      protein: 'Chicken thighs',
    })
    expect(
      entry.recipe.ingredients.map((i) => [i.amount, i.unit, i.name]),
    ).toEqual([
      [1, 'lb', 'chicken thighs'],
      [2, 'tbsp', 'soy sauce'],
      [8, 'oz', 'dried noodles'],
      [3, 'each', 'garlic (clove)'],
      [5, 'each', 'cilantro stems'],
    ])
    // The original lines, including the to-taste one, stay as facts.
    expect(entry.recipe.facts!.ingredientLines).toHaveLength(6)
  })

  it('never guesses: ranges and amount-less lines wait for review', () => {
    for (const line of ['1-2 shallots (chopped)', 'oil', 'Juice of 1 lemon']) {
      const entry = catalogRecipe(
        row({ ingredient_lines: ['1 lb tofu', line] }),
      )!
      expect(entry.clean).toBe(false)
      expect(recipeReady(entry.recipe)).toBe(false)
      expect(entry.recipe.leftovers).toBe(false)
      expect(entry.recipe.maxServings).toBe(4)
      expect(entry.recipe.facts!.pendingIngredients[0].sourceText).toBe(line)
    }
  })

  it('needs review when the source has no yield or time', () => {
    expect(catalogRecipe(row({ servings: null }))!.clean).toBe(false)
    expect(catalogRecipe(row({ minutes: null }))!.clean).toBe(false)
  })

  it('keeps desserts, drinks and sauces out of the dinner stack', () => {
    for (const categories of [['Dessert'], ['Drinks', 'Japanese'], ['Sauces']])
      expect(catalogRecipe(row({ categories }))!.meal).toBe(false)
    expect(catalogRecipe(row({ categories: [] }))!.meal).toBe(true)
    const { ready, review } = splitCatalog([
      catalogRecipe(row())!,
      catalogRecipe(
        row({
          id: 'tiffycooks:latte',
          url: 'https://tiffycooks.com/latte/',
          categories: ['Drinks'],
        }),
      )!,
      catalogRecipe(
        row({
          id: 'tiffycooks:range',
          url: 'https://tiffycooks.com/range/',
          ingredient_lines: ['1 lb tofu', '1-2 eggs'],
        }),
      )!,
    ])
    expect(ready.map((r) => r.catalogId)).toEqual(['tiffycooks:test-stir-fry'])
    expect(review.map((r) => r.catalogId)).toEqual(['tiffycooks:range'])
  })

  it('skips rows with no usable ingredients', () => {
    expect(
      catalogRecipe(row({ ingredient_lines: ['Salt (to taste)'] })),
    ).toBeNull()
  })
})

describe('catalog recipes in the weekly stack', () => {
  const ready = Array.from(
    { length: 20 },
    (_, i) =>
      catalogRecipe(
        row({
          id: `thewoksoflife:dish-${i}`,
          source: 'thewoksoflife.com',
          url: `https://thewoksoflife.com/dish-${i}/`,
          title: `Dish ${i}`,
        }),
      )!.recipe,
  )

  it('fills the stack from the catalog and adopts only what was queued', () => {
    const state = initialState([])
    const queue = shortlist(state, ready)
    expect(queue).toHaveLength(12)
    const adopted = adoptQueued({ ...state, queue }, ready)
    expect(adopted.recipes.map((r) => r.id).sort()).toEqual([...queue].sort())
    expect(adoptQueued(adopted, ready).recipes).toHaveLength(12)
  })

  it('rotates catalog options from week to week', () => {
    const state = initialState([])
    const weeks = ['2026-10-25', '2026-11-01', '2026-11-08'].map((week) =>
      shortlist({ ...state, week }, ready).join(),
    )
    expect(new Set(weeks).size).toBeGreaterThan(1)
  })

  it('skips blocked recipes and ones the household already saved', () => {
    const state = {
      ...initialState([ready[0]]),
      blocked: [ready[1].id],
    }
    expect(unsaved(ready, state)).toHaveLength(18)
    const queue = shortlist(state, ready)
    expect(queue).not.toContain(ready[1].id)
    expect(queue.filter((id) => id === ready[0].id)).toHaveLength(1)
  })

  it('returns unedited catalog copies at a fresh week unless loved or cooked', () => {
    const own = { ...ready[5], id: 'own-1', catalogId: undefined }
    const state = {
      ...initialState([ready[0], ready[1], ready[2], own]),
      loved: [ready[1].id],
      cooked: [ready[2].id],
    }
    expect(newWeek(state).recipes.map((r) => r.id)).toEqual([
      ready[1].id,
      ready[2].id,
      'own-1',
    ])
  })
})
