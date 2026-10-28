import { describe, expect, it } from 'vitest'
import snapshots from './tiffy-facts.json'
import { demoRecipes } from './demo'
import {
  buildPlan,
  decide,
  groceries,
  initialState,
  makeBookmark,
  recipeReady,
  recipeSchema,
  shortlist,
  swapRecipe,
} from './domain'
import {
  addRecipeFacts,
  availableRecipeFacts,
  parseIngredientFact,
  recipeFromFacts,
  tiffyRecipeFacts,
} from './recipeFacts'

describe('facts-only recipe snapshots', () => {
  it('keeps all ten sources and every ingredient line without directions or photos', () => {
    expect(tiffyRecipeFacts).toHaveLength(10)
    for (const [index, recipe] of tiffyRecipeFacts.entries()) {
      const source = snapshots[index]
      expect(recipe.source).toBe('reference')
      expect(recipe.sourceUrl).toBe(source.url)
      expect(recipe.instructions).toEqual([])
      expect(recipe.imagePath).toBeUndefined()
      expect(recipe.facts?.ingredientLines).toEqual(source.ingredients)
      expect(
        recipe.ingredients.length + recipe.facts!.pendingIngredients.length,
      ).toBe(source.ingredients.length)
      expect(recipe.maxServings).toBe(source.servings)
      expect(recipe.leftovers).toBe(false)
      expect(recipe.potluck).toBe(false)
      expect(recipeReady(recipe)).toBe(false)
    }
    expect(tiffyRecipeFacts[0].minutes).toBe(20)
    expect(tiffyRecipeFacts[0].servings).toBe(4)
    expect(() =>
      recipeFromFacts({
        ...snapshots[0],
        instructions: ['Not an allowed snapshot field'],
      }),
    ).toThrow()
    expect(() => recipeFromFacts({ ...snapshots[0], servings: null })).toThrow()
  })

  it('parses fractions and explicit units without guessing density or package weights', () => {
    expect(parseIngredientFact('2 ½ tbsp Fish Sauce').ingredient).toMatchObject(
      { amount: 2.5, unit: 'tbsp' },
    )
    expect(parseIngredientFact('1/3 cup Pork Belly').ingredient).toMatchObject({
      amount: 1 / 3,
      unit: 'cup',
    })
    expect(parseIngredientFact('¼ Cabbage (sliced)').ingredient).toMatchObject({
      amount: 0.25,
      unit: 'each',
    })
    expect(parseIngredientFact('2 packs Frozen Udon').ingredient).toMatchObject(
      { name: 'Frozen Udon (pack)', amount: 2, unit: 'each' },
    )
    expect(
      parseIngredientFact('450 g Noodles (cooked)').ingredient,
    ).toMatchObject({ name: 'Noodles (cooked)', amount: 450, unit: 'g' })
  })

  it('preserves ambiguous, missing and compound amounts as unresolved facts', () => {
    for (const line of [
      '1-3 Red Chili (chopped)',
      '20-30 Shiitake Mushroom',
      'Black Pepper',
      'Salt and Pepper (to season)',
      '6 cups beef stock + rest is water enough to cover the beef',
      '2 pinches Salt',
      '1/0 cup Rice',
    ]) {
      const parsed = parseIngredientFact(line)
      expect(parsed.ingredient).toBeUndefined()
      expect(parsed.pending?.sourceText).toBe(line)
      expect(parsed.pending?.reason).toBeTruthy()
    }
    expect(parseIngredientFact('1-2 tbsp neutral oil').pending?.unit).toBe(
      'tbsp',
    )
  })

  it('adds only missing snapshots matching saved links and never overwrites edits', () => {
    const state = initialState()
    state.bookmarks = [makeBookmark('Salmon', tiffyRecipeFacts[5].sourceUrl!)]
    expect(availableRecipeFacts(state)).toHaveLength(1)
    const added = addRecipeFacts(state)
    expect(added.recipes).toHaveLength(1)
    expect(added.bookmarks).toEqual(state.bookmarks)
    added.recipes[0] = { ...added.recipes[0], title: 'Our preferred salmon' }
    expect(availableRecipeFacts(added)).toEqual([])
    expect(() => addRecipeFacts(added)).toThrow('No new')
    expect(added.recipes[0].title).toBe('Our preferred salmon')
  })

  it('blocks unreviewed facts in shortlist, votes, planning, swaps and groceries', () => {
    const state = initialState(tiffyRecipeFacts)
    const recipe = tiffyRecipeFacts[5]
    state.queue = [recipe.id]
    expect(shortlist(state)).toEqual([])
    expect(() => decide(state, recipe.id, 'like')).toThrow()
    state.decisions = Object.fromEntries(
      state.recipes.map((r) => [r.id, 'like']),
    )
    expect(() => buildPlan(state)).toThrow()
    expect(() =>
      groceries(
        [{ recipeId: recipe.id, role: 'dinner', servings: 2, pinned: false }],
        state.recipes,
        [],
      ),
    ).toThrow('Review')
    state.plan = [
      {
        recipeId: demoRecipes[0].id,
        role: 'dinner',
        servings: 2,
        pinned: false,
      },
    ]
    expect(() => swapRecipe(state, 0, recipe.id)).toThrow('different liked')
  })

  it('requires source attribution and keeps existing own-recipe instruction validation', () => {
    const pending = tiffyRecipeFacts[0]
    expect(
      recipeSchema.safeParse({
        ...pending,
        facts: { ...pending.facts, needsReview: false },
      }).success,
    ).toBe(false)
    expect(
      recipeSchema.safeParse({ ...pending, sourceUrl: undefined }).success,
    ).toBe(false)
    expect(
      recipeSchema.safeParse({
        ...pending,
        instructions: ['Copied directions'],
      }).success,
    ).toBe(false)
    expect(
      recipeSchema.safeParse({ ...demoRecipes[0], instructions: [] }).success,
    ).toBe(false)
  })

  it('uses reviewed source yields and user-confirmed capacity for exact scaling', () => {
    const source = tiffyRecipeFacts[5]
    const recipe = recipeSchema.parse({
      ...source,
      protein: 'salmon',
      leftovers: true,
      maxServings: 4,
      facts: { ...source.facts, needsReview: false },
    })
    expect(recipeReady(recipe)).toBe(true)
    const state = initialState([recipe])
    state.settings = {
      dinners: 1,
      kairos: false,
      traveling: true,
      away: ['Mon', 'Tue', 'Wed', 'Thu'],
    }
    state.decisions[recipe.id] = 'like'
    expect(shortlist(state)).toEqual([recipe.id])
    const plan = buildPlan(state)
    expect(plan[0].servings).toBe(4)
    const soy = groceries(plan, [recipe], []).find(
      (item) => item.name === 'soy sauce',
    )
    expect(soy).toMatchObject({ required: 90, buy: 90, unit: 'ml' })
  })
})
