import { z } from 'zod'

export const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const units = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'each',
] as const
export const categories = [
  'Produce',
  'Protein',
  'Dairy',
  'Pantry',
  'Other',
] as const
const text = z.string().trim().min(1).max(200)
const amount = z.number().finite().positive().max(100000)
export const sourceUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }, 'Use an HTTPS source URL without embedded credentials.')
export const trustedSources = [
  {
    name: 'The Woks of Life',
    domain: 'thewoksoflife.com',
    url: 'https://thewoksoflife.com/',
  },
  {
    name: 'Tiffy Cooks',
    domain: 'tiffycooks.com',
    url: 'https://tiffycooks.com/',
  },
] as const
export function sourceName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return trustedSources.find((source) => source.domain === host)?.name ?? host
}
export const bookmarkSchema = z.object({
  id: text,
  title: text,
  url: sourceUrlSchema,
})
export type Bookmark = z.infer<typeof bookmarkSchema>
export function makeBookmark(title: string, url: string): Bookmark {
  const parsed = sourceUrlSchema.parse(url.trim())
  return bookmarkSchema.parse({
    id: crypto.randomUUID(),
    title,
    url: new URL(parsed).href,
  })
}
export const ingredientSchema = z.object({
  name: text,
  amount,
  unit: z.enum(units),
  category: z.enum(categories),
})
export const pendingIngredientSchema = z.object({
  name: text,
  sourceText: z.string().min(1).max(500),
  reason: z.string().min(1).max(200),
  unit: z.enum(units).optional(),
  category: z.enum(categories),
})
const recipeFactsSchema = z.object({
  retrievedAt: z.iso.datetime(),
  ingredientLines: z.array(z.string().min(1).max(500)).min(1).max(60),
  pendingIngredients: z.array(pendingIngredientSchema).max(60),
  needsReview: z.boolean(),
})
export const recipeSchema = z
  .object({
    id: text,
    title: text,
    description: z.string().max(500),
    servings: z.number().int().min(1).max(30),
    /** Legacy storage/AI field; never a planning or scaling limit. */
    maxServings: z.number().int().min(2).max(60),
    minutes: z.number().int().min(1).max(1440),
    protein: text,
    leftovers: z.boolean(),
    potluck: z.boolean(),
    source: z.enum(['own', 'reference']),
    sourceUrl: sourceUrlSchema.optional(),
    facts: recipeFactsSchema.optional(),
    /** Set while this is an unedited copy of a shared catalog recipe. */
    catalogId: text.optional(),
    imagePath: z.string().max(500).optional(),
    aiDraft: z
      .object({
        createdAt: z.iso.datetime(),
        prompts: z.array(z.string().max(500)).max(20),
        derivedFrom: text.optional(),
      })
      .optional(),
    ingredients: z.array(ingredientSchema).min(1).max(60),
    instructions: z.array(z.string().trim().min(1).max(2000)).max(40),
  })
  .superRefine((recipe, ctx) => {
    if (recipe.source === 'reference') {
      if (!recipe.sourceUrl || !recipe.facts)
        ctx.addIssue({
          code: 'custom',
          message: 'Imported facts require a source link and provenance.',
        })
      if (recipe.facts?.pendingIngredients.length && !recipe.facts.needsReview)
        ctx.addIssue({
          code: 'custom',
          path: ['facts'],
          message:
            'Resolve missing ingredient amounts before marking a recipe reviewed.',
        })
    } else {
      if (!recipe.instructions.length)
        ctx.addIssue({
          code: 'custom',
          path: ['instructions'],
          message: 'Enter at least one cooking instruction.',
        })
      if (recipe.facts)
        ctx.addIssue({
          code: 'custom',
          path: ['facts'],
          message:
            'Imported facts must be identified as a source-linked recipe.',
        })
    }
  })
export const settingsSchema = z.object({
  dinners: z.number().int().min(0).max(7),
  kairos: z.boolean(),
  traveling: z.boolean(),
  away: z.array(z.enum(days)).max(7),
})
export const pantrySchema = z.object({
  id: text,
  name: text,
  /** Legacy fields retained for stored documents; pantry membership means at home. */
  kind: z.enum(['quantity', 'staple']),
  amount,
  unit: z.enum(units),
  /** The household's own words, e.g. "half full"; never parsed into amounts. */
  note: z.string().trim().max(60).optional(),
  /** Grocery key whose check added this item; unchecking removes it. */
  fromGrocery: z.string().max(210).optional(),
})
export const slotSchema = z.object({
  recipeId: text,
  role: z.enum(['dinner', 'kairos']),
  servings: z.number().int().min(2).max(60),
  pinned: z.boolean(),
})
export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  week: z.string(),
  phase: z.enum(['setup', 'swipe', 'plan']),
  settings: settingsSchema,
  recipes: z.array(recipeSchema).max(200),
  bookmarks: z.array(bookmarkSchema).max(200).default([]),
  pantry: z.array(pantrySchema).max(300),
  queue: z.array(text).max(12),
  decisions: z.record(z.string(), z.enum(['like', 'skip'])),
  history: z.array(text).max(200),
  blocked: z.array(text),
  loved: z.array(text),
  cooked: z.array(text),
  plan: z.array(slotSchema).max(8),
  confirmed: z.boolean(),
  checked: z.array(z.string().min(1).max(210)),
})
export type Recipe = z.infer<typeof recipeSchema>
export type Ingredient = z.infer<typeof ingredientSchema>
export type PendingIngredient = z.infer<typeof pendingIngredientSchema>
export type Settings = z.infer<typeof settingsSchema>
export type PantryItem = z.infer<typeof pantrySchema>
export type Slot = z.infer<typeof slotSchema>
export type State = z.infer<typeof stateSchema>
export type UnitSystem = 'us' | 'metric'
export type EventKind =
  | 'settings'
  | 'like'
  | 'skip'
  | 'undo'
  | 'block'
  | 'unblock'
  | 'cooked'
  | 'loved'
  | 'unloved'
  | 'plan'
  | 'swap'
  | 'pin'
  | 'confirm'
  | 'pantry'
  | 'grocery'
  | 'recipe'
  | 'bookmark'
  | 'new_week'
export type ChangeEvent = { kind: EventKind; recipeId?: string }

export function recipeReady(recipe: Recipe): boolean {
  return !recipe.facts?.needsReview && !recipe.facts?.pendingIngredients.length
}

export function weekKey(date = new Date()): string {
  const sunday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay(),
  )
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
}

export function initialState(recipes: Recipe[] = []): State {
  return {
    schemaVersion: 1,
    week: weekKey(),
    phase: 'setup',
    settings: { dinners: 2, kairos: false, traveling: false, away: [] },
    recipes,
    bookmarks: [],
    pantry: [],
    queue: [],
    decisions: {},
    history: [],
    blocked: [],
    loved: [],
    cooked: [],
    plan: [],
    confirmed: false,
    checked: [],
  }
}

export function removeRecipe(state: State, id: string): State {
  if (!state.recipes.some((recipe) => recipe.id === id))
    throw new Error(
      'This recipe was already removed. Reopen your recipe library.',
    )
  const queue = state.queue.filter((recipeId) => recipeId !== id)
  const decisions = { ...state.decisions }
  delete decisions[id]
  const affectedPlan = state.plan.some((slot) => slot.recipeId === id)
  return {
    ...state,
    recipes: state.recipes.filter((recipe) => recipe.id !== id),
    queue,
    decisions,
    history: state.history.filter((recipeId) => recipeId !== id),
    loved: state.loved.filter((recipeId) => recipeId !== id),
    cooked: state.cooked.filter((recipeId) => recipeId !== id),
    // Deleting isn't an unblock: preserve explicit recommendation exclusions.
    ...(affectedPlan
      ? {
          plan: [],
          phase: queue.length ? 'swipe' : 'setup',
          confirmed: false,
          checked: [],
        }
      : {}),
  }
}

export function targets(settings: Settings) {
  const away = settings.traveling
    ? new Set(settings.away.filter((day) => days.indexOf(day) < 5)).size
    : 0
  const lunches = 10 - away * 2
  return {
    lunches,
    dinnerServings: settings.dinners * 2,
    home: settings.dinners * 2 + lunches,
    kairos: settings.kairos ? 8 : 0,
  }
}

export const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')
const conversions = {
  g: ['g', 1],
  kg: ['g', 1000],
  oz: ['g', 28.349523125],
  lb: ['g', 453.59237],
  ml: ['ml', 1],
  l: ['ml', 1000],
  tsp: ['ml', 5],
  tbsp: ['ml', 15],
  cup: ['ml', 240],
  each: ['each', 1],
} as const
export function canonical(amount: number, unit: Ingredient['unit']) {
  const [base, factor] = conversions[unit]
  return { amount: amount * factor, unit: base }
}
export type Grocery = {
  key: string
  name: string
  category: Ingredient['category']
  unit: 'g' | 'ml' | 'each'
  required: number
  buy: number
  atHome: boolean
}
export function groceries(
  plan: Slot[],
  recipes: Recipe[],
  pantry: PantryItem[],
): Grocery[] {
  const merged = new Map<string, Grocery>()
  for (const slot of plan) {
    const recipe = recipes.find((recipe) => recipe.id === slot.recipeId)
    if (!recipe)
      throw new Error('A planned recipe is missing. Rebuild the plan.')
    if (!recipeReady(recipe))
      throw new Error(
        'Review the imported recipe facts before making a grocery list.',
      )
    for (const ingredient of recipe.ingredients) {
      const quantity = canonical(
        (ingredient.amount * slot.servings) / recipe.servings,
        ingredient.unit,
      )
      const name = normalize(ingredient.name)
      const key = `${name}:${quantity.unit}`
      const item = merged.get(key) ?? {
        key,
        name,
        category: ingredient.category,
        unit: quantity.unit,
        required: 0,
        buy: 0,
        atHome: false,
      }
      item.required += quantity.amount
      merged.set(key, item)
    }
  }
  for (const item of merged.values()) {
    // Keep a purchase's own checkbox reversible rather than disabling it.
    item.atHome = pantry.some(
      (stock) =>
        normalize(stock.name) === item.name && stock.fromGrocery !== item.key,
    )
    item.buy = item.atHome ? 0 : item.required
  }
  return [...merged.values()].sort(
    (a, b) =>
      categories.indexOf(a.category) - categories.indexOf(b.category) ||
      a.name.localeCompare(b.name),
  )
}

/** A stable 0-1 value per week and recipe, so catalog options rotate weekly. */
function weeklyJitter(week: string, id: string) {
  let hash = 2166136261
  for (const char of `${week}:${id}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967295
}

/**
 * The week's swipe stack. Clean catalog recipes join the pool of new options,
 * rotating weekly; the household's own copy of a recipe takes precedence.
 */
export function shortlist(state: State, catalog: Recipe[] = []): string[] {
  const saved = new Set(state.recipes.map((recipe) => recipe.id))
  const available = [
    ...state.recipes,
    ...catalog.filter((recipe) => !saved.has(recipe.id)),
  ].filter(
    (recipe) => recipeReady(recipe) && !state.blocked.includes(recipe.id),
  )
  const score = (recipe: Recipe) =>
    (state.loved.includes(recipe.id) ? 20 : 0) +
    (state.cooked.includes(recipe.id) ? 5 : 0) +
    recipe.ingredients.filter((i) =>
      state.pantry.some((p) => normalize(p.name) === normalize(i.name)),
    ).length -
    recipe.minutes / 60 +
    (recipe.catalogId ? weeklyJitter(state.week, recipe.id) * 4 : 0)
  const sort = (a: Recipe, b: Recipe) =>
    score(b) - score(a) || a.id.localeCompare(b.id)
  const familiar = available
    .filter((r) => state.cooked.includes(r.id) || state.loved.includes(r.id))
    .sort(sort)
  const fresh = available
    .filter((r) => !state.cooked.includes(r.id) && !state.loved.includes(r.id))
    .sort(sort)
  const result: string[] = []
  while (result.length < 12 && (familiar.length || fresh.length)) {
    for (const pool of [familiar, fresh]) {
      const recipe = pool.shift()
      if (recipe && result.length < 12) result.push(recipe.id)
    }
  }
  return result
}

function combinations<T>(values: T[], size: number): T[][] {
  if (size === 0) return [[]]
  return values.flatMap((value, i) =>
    combinations(values.slice(i + 1), size - 1).map((rest) => [value, ...rest]),
  )
}

function allocate(
  dinners: Recipe[],
  potluck: Recipe | undefined,
  settings: Settings,
): Slot[] | null {
  if (potluck && !potluck.potluck) return null
  const slots: Slot[] = dinners.map((recipe) => ({
    recipeId: recipe.id,
    servings: 2,
    role: 'dinner',
    pinned: false,
  }))
  let remaining = targets(settings).lunches
  // Round-robin leftovers avoid assigning an entire week's lunches to one dinner.
  while (remaining > 0) {
    let placed = false
    for (let i = 0; i < dinners.length && remaining > 0; i++) {
      if (dinners[i].leftovers) {
        slots[i].servings++
        remaining--
        placed = true
      }
    }
    if (!placed) return null
  }
  if (potluck)
    slots.push({
      recipeId: potluck.id,
      servings: 8,
      role: 'kairos',
      pinned: false,
    })
  return slots
}

export function buildPlan(state: State): Slot[] {
  const liked = state.recipes.filter(
    (recipe) =>
      recipeReady(recipe) &&
      state.decisions[recipe.id] === 'like' &&
      !state.blocked.includes(recipe.id),
  )
  const pins = state.plan.filter((slot) => slot.pinned)
  let best: Slot[] | null = null
  let bestScore = -Infinity
  const potlucks: (Recipe | undefined)[] = state.settings.kairos
    ? liked.filter((r) => r.potluck)
    : [undefined]
  for (const potluck of potlucks) {
    for (const dinnerRecipes of combinations(
      liked.filter((r) => r.id !== potluck?.id),
      state.settings.dinners,
    )) {
      const plan = allocate(dinnerRecipes, potluck, state.settings)
      if (
        !plan ||
        pins.some(
          (pin) =>
            !plan.some(
              (slot) =>
                slot.recipeId === pin.recipeId && slot.role === pin.role,
            ),
        )
      )
        continue
      const selected = [...dinnerRecipes, ...(potluck ? [potluck] : [])]
      const ingredients = selected.flatMap((r) =>
        r.ingredients.map((i) => normalize(i.name)),
      )
      const score =
        new Set(dinnerRecipes.map((r) => normalize(r.protein))).size * 8 -
        selected.reduce((sum, r) => sum + r.minutes, 0) / 15 +
        (ingredients.length - new Set(ingredients).size) * 1.5 +
        selected.filter((r) => state.loved.includes(r.id)).length * 3 +
        groceries(plan, state.recipes, state.pantry).filter(
          (item) => item.atHome,
        ).length
      if (score > bestScore) {
        bestScore = score
        best = plan.map((slot) => ({
          ...slot,
          pinned: pins.some(
            (pin) => pin.recipeId === slot.recipeId && pin.role === slot.role,
          ),
        }))
      }
    }
  }
  if (!best)
    throw new Error(
      'Your likes need to cover the selected dinner count, leftover lunches and a separate potluck-friendly recipe if Kairos is on. Quantities scale automatically. Zero dinners cannot supply lunches.',
    )
  return best
}

export function swapRecipe(
  state: State,
  index: number,
  recipeId: string,
): Slot[] {
  const slot = state.plan[index]
  const recipe = state.recipes.find((recipe) => recipe.id === recipeId)
  if (!slot || slot.pinned)
    throw new Error('Unpin this recipe before swapping.')
  if (
    !recipe ||
    !recipeReady(recipe) ||
    state.decisions[recipeId] !== 'like' ||
    state.blocked.includes(recipeId) ||
    state.plan.some((s) => s.recipeId === recipeId)
  )
    throw new Error('Choose a different liked recipe.')
  if (
    slot.role === 'kairos'
      ? !recipe.potluck
      : slot.servings > 2 && !recipe.leftovers
  )
    throw new Error(
      'Choose a recipe suitable for this slot: leftover lunches or a potluck.',
    )
  return state.plan.map((item, i) =>
    i === index ? { ...item, recipeId } : item,
  )
}

export function decide(
  state: State,
  recipeId: string,
  choice: 'like' | 'skip',
): State {
  if (
    !state.queue.includes(recipeId) ||
    !state.recipes.some(
      (recipe) => recipe.id === recipeId && recipeReady(recipe),
    ) ||
    state.decisions[recipeId] ||
    state.blocked.includes(recipeId)
  )
    throw new Error('This recipe is no longer waiting for a choice.')
  return {
    ...state,
    decisions: { ...state.decisions, [recipeId]: choice },
    history: [...state.history, recipeId],
  }
}

/**
 * A remix saved from a planned recipe takes over that plan slot, pinned and
 * liked, when it can still cover the slot's servings. Groceries must then be
 * confirmed again. Returns null when it does not fit.
 */
export function placeRemix(
  state: State,
  slotIndex: number,
  originalId: string,
  recipe: Recipe,
): State | null {
  const slot = state.plan[slotIndex]
  if (!slot || slot.recipeId !== originalId || !recipeReady(recipe)) return null
  const fits =
    slot.role === 'kairos'
      ? recipe.potluck
      : slot.servings <= 2 || recipe.leftovers
  if (!fits) return null
  return {
    ...state,
    plan: state.plan.map((p, i) =>
      i === slotIndex ? { ...p, recipeId: recipe.id, pinned: true } : p,
    ),
    decisions: { ...state.decisions, [recipe.id]: 'like' },
    confirmed: false,
    checked: [],
  }
}

/** Loved is a durable preference the household can take back. */
export function toggleLoved(
  state: State,
  recipeId: string,
): { state: State; event: ChangeEvent } {
  const loved = state.loved.includes(recipeId)
  return {
    state: {
      ...state,
      loved: loved
        ? state.loved.filter((id) => id !== recipeId)
        : [...state.loved, recipeId],
    },
    event: { kind: loved ? 'unloved' : 'loved', recipeId },
  }
}

export function undo(state: State): State {
  const id = state.history.at(-1)
  if (!id) return state
  const decisions = { ...state.decisions }
  delete decisions[id]
  return {
    ...state,
    decisions,
    history: state.history.slice(0, -1),
    plan: [],
    confirmed: false,
    checked: [],
  }
}

export function addPantryItem(state: State, ingredient: string): State {
  const name = normalize(ingredient)
  if (!name) throw new Error('Enter an ingredient name.')
  if (state.pantry.some((item) => normalize(item.name) === name))
    throw new Error('That ingredient is already in your pantry.')
  return {
    ...state,
    pantry: [
      ...state.pantry,
      {
        id: crypto.randomUUID(),
        name,
        kind: 'staple',
        amount: 1,
        unit: 'each',
      },
    ],
  }
}

export function removePantryItem(state: State, id: string): State {
  const item = state.pantry.find((stock) => stock.id === id)
  if (!item) throw new Error('That ingredient is no longer in your pantry.')
  return {
    ...state,
    pantry: state.pantry.filter((stock) => stock.id !== id),
    checked: state.checked.filter(
      (key) => key.slice(0, key.lastIndexOf(':')) !== normalize(item.name),
    ),
  }
}

/**
 * Purchases become persistent pantry entries. Their own shopping checkbox
 * remains reversible; unchecking removes only the stock that check added.
 */
export function toggleGroceryCheck(
  state: State,
  key: string,
  name: string,
): State {
  if (state.checked.includes(key))
    return {
      ...state,
      checked: state.checked.filter((k) => k !== key),
      pantry: state.pantry.filter((item) => item.fromGrocery !== key),
    }
  const stocked = state.pantry.some(
    (item) => normalize(item.name) === normalize(name),
  )
  return {
    ...state,
    checked: [...state.checked, key],
    pantry: stocked
      ? state.pantry
      : [
          ...state.pantry,
          {
            id: crypto.randomUUID(),
            name: normalize(name),
            kind: 'staple',
            amount: 1,
            unit: 'each',
            fromGrocery: key,
          },
        ],
  }
}

/** Copies the catalog recipes queued this week into the household's recipes. */
export function adoptQueued(state: State, catalog: Recipe[]): State {
  const saved = new Set(state.recipes.map((recipe) => recipe.id))
  const adopted = catalog.filter(
    (recipe) => state.queue.includes(recipe.id) && !saved.has(recipe.id),
  )
  return adopted.length
    ? { ...state, recipes: [...state.recipes, ...adopted] }
    : state
}

export function newWeek(state: State): State {
  return {
    // Unedited catalog copies return to the catalog unless loved or cooked.
    ...initialState(
      state.recipes.filter(
        (recipe) =>
          !recipe.catalogId ||
          state.loved.includes(recipe.id) ||
          state.cooked.includes(recipe.id),
      ),
    ),
    // Bought groceries stay as ordinary pantry items for the new week.
    pantry: state.pantry.map(({ fromGrocery: _bought, ...item }) => item),
    bookmarks: state.bookmarks,
    blocked: state.blocked,
    loved: state.loved,
    cooked: state.cooked,
  }
}

export const displayAmount = (value: number) =>
  Number((Math.ceil((value - 1e-8) * 10) / 10).toFixed(1)).toLocaleString()

/** A recipe amount shown in the household's chosen unit system. */
export function recipeQuantity(
  amount: number,
  unit: Ingredient['unit'],
  system: UnitSystem,
): string {
  const base = canonical(amount, unit)
  return groceryQuantity(base.amount, base.unit, system)
}

export function groceryQuantity(
  value: number,
  unit: Grocery['unit'],
  system: UnitSystem,
): string {
  let displayUnit: Ingredient['unit'] = unit
  let decimals = 1
  if (system === 'metric') {
    if (value >= 1000 && unit !== 'each') {
      displayUnit = unit === 'g' ? 'kg' : 'l'
      decimals = 3
    }
  } else if (unit === 'g') {
    displayUnit = value >= conversions.lb[1] ? 'lb' : 'oz'
    decimals = 2
  } else if (unit === 'ml') {
    displayUnit =
      value >= conversions.cup[1]
        ? 'cup'
        : value >= conversions.tbsp[1]
          ? 'tbsp'
          : 'tsp'
    decimals = 2
  }
  const converted = value / conversions[displayUnit][1]
  const precision = 10 ** decimals
  const rounded = Math.max(
    0,
    Math.ceil((converted - 1e-10) * precision) / precision,
  )
  return `${rounded.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${displayUnit}`
}
