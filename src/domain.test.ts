import { describe, expect, it } from 'vitest'
import { demoRecipes } from './demo'
import {
  buildPlan,
  canonical,
  decide,
  groceries,
  initialState,
  newWeek,
  placeRemix,
  shortlist,
  stateSchema,
  swapRecipe,
  targets,
  toggleLoved,
  undo,
  weekKey,
  type PantryItem,
  type Recipe,
  type Slot,
  type State,
  makeBookmark,
  sourceName,
  sourceUrlSchema,
} from './domain'

function ready(): State {
  const state = initialState(demoRecipes)
  return {
    ...state,
    queue: shortlist(state),
    decisions: Object.fromEntries(
      demoRecipes.slice(0, 5).map((r) => [r.id, 'like']),
    ),
  }
}
describe('weekly targets', () => {
  it('defaults to two recipes and 14 home servings, with both toggles off', () => {
    const state = initialState()
    expect(state.settings).toEqual({
      dinners: 2,
      kairos: false,
      traveling: false,
      away: [],
    })

    expect(targets(state.settings)).toEqual({
      lunches: 10,
      dinnerServings: 4,
      home: 14,
      kairos: 0,
    })
  })
  describe('trusted-source bookmarks', () => {
    it('stores only the user label and URL, not invented recipe data', () => {
      const bookmark = makeBookmark(
        'Noodles to try',
        'https://thewoksoflife.com/example/',
      )
      expect(Object.keys(bookmark).sort()).toEqual(['id', 'title', 'url'])
      const state = initialState()
      state.bookmarks = [bookmark]
      expect(shortlist(state)).toEqual([])
      expect(() => buildPlan(state)).toThrow()
      expect(newWeek(state).bookmarks).toEqual([bookmark])
    })
    it('recognizes only the exact trusted domains, not lookalike hosts', () => {
      expect(sourceName('https://www.tiffycooks.com/example/')).toBe(
        'Tiffy Cooks',
      )
      expect(sourceName('https://thewoksoflife.com/example/')).toBe(
        'The Woks of Life',
      )
      expect(sourceName('https://thewoksoflife.com.example.org/')).toBe(
        'thewoksoflife.com.example.org',
      )
    })
    it('rejects script, HTTP and credential-bearing source links', () => {
      for (const url of [
        'javascript:alert(1)',
        'http://tiffycooks.com/',
        'https://name:secret@tiffycooks.com/',
      ]) {
        expect(sourceUrlSchema.safeParse(url).success).toBe(false)
      }
    })
  })
  it('subtracts two per unique weekday, never weekends, and ignores hidden travel days', () => {
    const settings = {
      ...initialState().settings,
      traveling: true,
      away: ['Mon', 'Mon', 'Fri', 'Sat', 'Sun'] as State['settings']['away'],
    }
    expect(targets(settings).lunches).toBe(6)
    expect(targets({ ...settings, traveling: false }).lunches).toBe(10)
    expect(
      targets({ ...settings, away: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] })
        .lunches,
    ).toBe(0)
  })
  it('keeps eight Kairos servings separate', () => {
    expect(targets({ ...initialState().settings, kairos: true })).toEqual({
      lunches: 10,
      dinnerServings: 4,
      home: 14,
      kairos: 8,
    })
  })
  it('uses the local Sunday including across year boundaries', () => {
    expect(weekKey(new Date(2026, 9, 28, 12))).toBe('2026-10-25')
    expect(weekKey(new Date(2026, 0, 1, 12))).toBe('2025-12-28')
  })
})
describe('shared shortlist and feedback', () => {
  it('keeps likes in a shortlist without committing a plan', () => {
    let state = initialState(demoRecipes)
    state.queue = shortlist(state)
    for (const id of state.queue.slice(0, 3)) state = decide(state, id, 'like')
    expect(Object.keys(state.decisions)).toHaveLength(3)
    expect(state.plan).toEqual([])
    expect(state.phase).toBe('setup')
  })
  it('prevents duplicate or stale swipe actions', () => {
    const state = ready()
    expect(() => decide(state, 'demo-1', 'like')).toThrow('no longer')
    expect(() => decide(state, 'unknown', 'like')).toThrow('no longer')
  })
  it('undo clears dependent plan/checks, but never changes durable feedback', () => {
    const state = ready()
    state.history = ['demo-1']
    state.loved = ['demo-1']
    state.plan = buildPlan(state)
    state.confirmed = true
    state.checked = ['rice:g']
    const result = undo(state)
    expect(result.decisions['demo-1']).toBeUndefined()
    expect(result.plan).toEqual([])
    expect(result.confirmed).toBe(false)
    expect(result.checked).toEqual([])
    expect(result.loved).toEqual(['demo-1'])
  })
  it('does not turn a weekly skip into a lasting dislike', () => {
    const state = ready()
    state.decisions['demo-1'] = 'skip'
    const fresh = newWeek(state)
    expect(fresh.decisions).toEqual({})
    expect(shortlist(fresh)).toContain('demo-1')
  })
  it('mixes familiar and new options, excludes explicitly blocked recipes, caps at 12', () => {
    const state = ready()
    state.loved = ['demo-1']
    state.blocked = ['demo-2']
    const result = shortlist(state)
    expect(result[0]).toBe('demo-1')
    expect(result[1]).not.toBe('demo-1')
    expect(result).not.toContain('demo-2')
    expect(result.length).toBeLessThanOrEqual(12)
  })
})
describe('deterministic plan constraints', () => {
  it('builds two dinners with exactly ten lunches using likes only', () => {
    const state = ready()
    const plan = buildPlan(state)
    expect(plan).toHaveLength(2)
    expect(plan.reduce((sum, slot) => sum + slot.servings, 0)).toBe(14)
    expect(
      plan.every((slot) => state.decisions[slot.recipeId] === 'like'),
    ).toBe(true)
    expect(new Set(plan.map((slot) => slot.recipeId)).size).toBe(2)
  })
  it('never includes a skipped or blocked recipe to fill a gap', () => {
    const state = ready()
    state.decisions = { 'demo-1': 'like', 'demo-2': 'skip' }
    expect(() => buildPlan(state)).toThrow('Not enough')
    state.blocked = ['demo-1']
    expect(() => buildPlan(state)).toThrow()
  })
  it('requires a separate viable Kairos dish with eight servings', () => {
    const state = ready()
    state.settings.kairos = true
    const plan = buildPlan(state)
    expect(plan).toHaveLength(3)
    expect(plan.find((p) => p.role === 'kairos')?.servings).toBe(8)
    expect(plan.reduce((sum, p) => sum + p.servings, 0)).toBe(22)
    expect(new Set(plan.map((p) => p.recipeId)).size).toBe(3)
    state.recipes = state.recipes.map((r) => ({ ...r, potluck: false }))
    expect(() => buildPlan(state)).toThrow()
  })
  it('enforces leftover capability and maximum batch sizes', () => {
    const state = ready()
    state.recipes = state.recipes.map((r) => ({ ...r, leftovers: false }))
    expect(() => buildPlan(state)).toThrow()
    state.recipes = demoRecipes.map((r) => ({ ...r, maxServings: 6 }))
    expect(() => buildPlan(state)).toThrow()
  })
  it('handles zero dinners only with zero lunches', () => {
    const state = ready()
    state.settings.dinners = 0
    expect(() => buildPlan(state)).toThrow()
    state.settings = {
      ...state.settings,
      traveling: true,
      away: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    }
    expect(buildPlan(state)).toEqual([])
  })
  it('preserves pinned recipe and role on rebuild', () => {
    const state = ready()
    state.settings.kairos = true
    state.plan = buildPlan(state).map((s) => ({
      ...s,
      pinned: s.role === 'kairos',
    }))
    const pin = state.plan.find((s) => s.pinned)!
    expect(buildPlan(state)).toContainEqual(pin)
  })
  it('swaps only with viable unused likes, preserving servings', () => {
    const state = ready()
    state.plan = buildPlan(state)
    const recipe = state.recipes.find(
      (r) =>
        state.decisions[r.id] === 'like' &&
        !state.plan.some((p) => p.recipeId === r.id),
    )!
    const swapped = swapRecipe(state, 0, recipe.id)
    expect(swapped[0]).toEqual({ ...state.plan[0], recipeId: recipe.id })
    expect(() => swapRecipe(state, 0, 'demo-10')).toThrow('liked')
    expect(() => swapRecipe(state, 0, state.plan[1].recipeId)).toThrow()
    state.plan[0].pinned = true
    expect(() => swapRecipe(state, 0, recipe.id)).toThrow('Unpin')
  })
  it('rejects a swap that loses lunch or serving coverage', () => {
    const state = ready()
    state.plan = buildPlan(state)
    state.decisions['demo-10'] = 'like'
    state.recipes = state.recipes.map((r) =>
      r.id === 'demo-10' ? { ...r, maxServings: 2 } : r,
    )
    expect(() => swapRecipe(state, 0, 'demo-10')).toThrow('servings')
  })
  it('covers every dinner/travel combination without changing requested recipe counts', () => {
    for (let dinners = 1; dinners <= 7; dinners++)
      for (let away = 0; away <= 5; away++) {
        const state = ready()
        state.decisions = Object.fromEntries(
          demoRecipes.map((r) => [r.id, 'like']),
        )
        state.settings = {
          dinners,
          kairos: true,
          traveling: true,
          away: (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).slice(0, away),
        }
        const plan = buildPlan(state)
        expect(plan.filter((p) => p.role === 'dinner')).toHaveLength(dinners)
        expect(plan.reduce((sum, p) => sum + p.servings, 0)).toBe(
          dinners * 2 + 10 - away * 2 + 8,
        )
      }
  })
})
describe('grocery arithmetic', () => {
  const recipe: Recipe = {
    ...demoRecipes[0],
    id: 'rice',
    servings: 4,
    ingredients: [
      { name: ' Rice ', amount: 500, unit: 'g', category: 'Pantry' },
      { name: 'olive oil', amount: 1, unit: 'tbsp', category: 'Pantry' },
    ],
  }
  const plan: Slot[] = [
    { recipeId: 'rice', servings: 6, role: 'dinner', pinned: false },
  ]
  const stock: PantryItem = {
    id: 'stock',
    name: 'rice',
    kind: 'quantity',
    amount: 0.1,
    unit: 'kg',
  }
  it('scales and subtracts a small quantity instead of hiding the entire ingredient', () => {
    expect(
      groceries(plan, [recipe], [stock]).find((i) => i.name === 'rice'),
    ).toMatchObject({ required: 750, owned: 100, buy: 650 })
  })
  it('merges compatible units and deducts stock once', () => {
    const second = {
      ...recipe,
      id: 'second',
      ingredients: [
        {
          name: 'rice',
          amount: 0.25,
          unit: 'kg' as const,
          category: 'Pantry' as const,
        },
      ],
    }
    const items = groceries(
      [...plan, { ...plan[0], recipeId: 'second', servings: 4 }],
      [recipe, second],
      [stock],
    )
    expect(items.find((i) => i.name === 'rice')).toMatchObject({
      required: 1000,
      buy: 900,
    })
  })
  it('never guesses mass to volume, or substring matches unlike ingredients', () => {
    const otherStock = [
      { ...stock, unit: 'cup' as const },
      { ...stock, name: 'rice vinegar', amount: 1000 },
    ]
    expect(
      groceries(plan, [recipe], otherStock).find((i) => i.name === 'rice')?.buy,
    ).toBe(750)
  })
  it('staples flag quantity review without deducting unknown amounts', () => {
    expect(
      groceries(plan, [recipe], [{ ...stock, kind: 'staple' }]).find(
        (i) => i.name === 'rice',
      ),
    ).toMatchObject({ buy: 750, owned: 0, staple: true })
  })
  it('never produces negative buying quantities', () => {
    expect(
      groceries(plan, [recipe], [{ ...stock, amount: 10 }]).find(
        (i) => i.name === 'rice',
      )?.buy,
    ).toBe(0)
  })
  it('uses declared kitchen-volume conversions', () => {
    expect(canonical(1, 'cup')).toEqual({ amount: 240, unit: 'ml' })
    expect(canonical(3, 'tsp')).toEqual(canonical(1, 'tbsp'))
    expect(canonical(1, 'lb').amount).toBeCloseTo(453.59237)
  })
  it('rejects corrupt persisted data rather than silently making a new household', () => {
    expect(
      stateSchema.safeParse({
        ...initialState(),
        settings: { ...initialState().settings, dinners: -1 },
      }).success,
    ).toBe(false)
    expect(
      stateSchema.safeParse({
        ...initialState(),
        recipes: [{ ...recipe, servings: 0 }],
      }).success,
    ).toBe(false)
  })
})

describe('remixes and loved feedback', () => {
  function planned(): State {
    const state = ready()
    return { ...state, plan: buildPlan(state), phase: 'plan', confirmed: true }
  }
  it('puts a fitting remix in its original slot, pinned and liked', () => {
    const state = planned()
    const original = state.recipes.find((r) => r.id === state.plan[0].recipeId)!
    const remix: Recipe = { ...original, id: 'remix-1', source: 'own' }
    const next = placeRemix(state, 0, original.id, remix)!
    expect(next.plan[0]).toMatchObject({ recipeId: 'remix-1', pinned: true })
    expect(next.plan[1]).toEqual(state.plan[1])
    expect(next.decisions['remix-1']).toBe('like')
    expect(next.confirmed).toBe(false)
    expect(next.checked).toEqual([])
  })
  it('leaves the plan alone when the remix cannot cover the slot', () => {
    const state = planned()
    const slot = state.plan.find((s) => s.servings > 2)!
    const index = state.plan.indexOf(slot)
    const original = state.recipes.find((r) => r.id === slot.recipeId)!
    expect(
      placeRemix(state, index, original.id, {
        ...original,
        id: 'remix-2',
        leftovers: false,
      }),
    ).toBeNull()
    expect(
      placeRemix(state, index, 'someone-else', { ...original, id: 'remix-3' }),
    ).toBeNull()
  })
  it('toggles loved and records which way', () => {
    const state = initialState(demoRecipes)
    const loved = toggleLoved(state, demoRecipes[0].id)
    expect(loved.state.loved).toEqual([demoRecipes[0].id])
    expect(loved.event.kind).toBe('loved')
    const unloved = toggleLoved(loved.state, demoRecipes[0].id)
    expect(unloved.state.loved).toEqual([])
    expect(unloved.event.kind).toBe('unloved')
  })
})
