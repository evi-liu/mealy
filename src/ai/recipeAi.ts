import { z } from 'zod'
import { categories, units, type Recipe } from '../domain'
import { supabase } from '../store'

export type RecipeDraft = Pick<
  Recipe,
  | 'title'
  | 'description'
  | 'servings'
  | 'maxServings'
  | 'minutes'
  | 'protein'
  | 'leftovers'
  | 'potluck'
  | 'ingredients'
  | 'instructions'
>
/** The household's unsaved form, which may still be incomplete. */
export type DraftBase = Omit<
  RecipeDraft,
  'servings' | 'maxServings' | 'minutes' | 'ingredients'
> & {
  servings: number | null
  maxServings: number | null
  minutes: number | null
  ingredients: {
    name: string
    amount: number | null
    unit: string
    category: string
  }[]
}
export type DraftRequest = {
  instruction: string
  base?: DraftBase
  history: string[]
}
export type DraftResult =
  { recipe: RecipeDraft; notes: string[] } | { declined: string }
export type RecipeAi = {
  demo: boolean
  draft: (request: DraftRequest, signal?: AbortSignal) => Promise<DraftResult>
}

const text = z.string().trim().min(1).max(200)
const draftSchema = z.object({
  title: text,
  description: z.string().max(500),
  servings: z.number().int().min(1).max(30),
  maxServings: z.number().int().min(2).max(60),
  minutes: z.number().int().min(1).max(1440),
  protein: text,
  leftovers: z.boolean(),
  potluck: z.boolean(),
  ingredients: z
    .array(
      z.object({
        name: text,
        amount: z.number().finite().positive().max(100000),
        unit: z.enum(units),
        category: z.enum(categories),
      }),
    )
    .min(1)
    .max(60),
  instructions: z.array(z.string().trim().min(1).max(2000)).min(1).max(40),
})
const responseSchema = z.union([
  z.object({ recipe: draftSchema, notes: z.array(z.string()).max(6) }),
  z.object({ declined: z.string().min(1) }),
])

export const liveRecipeAi: RecipeAi = {
  demo: false,
  async draft(request) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.functions.invoke('recipe-draft', {
      body: request,
    })
    if (error) {
      const context = (error as { context?: Response }).context
      const body = await context
        ?.json()
        .then((value: { error?: unknown }) => value)
        .catch(() => undefined)
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : 'AI drafting is unavailable right now. You can still enter the recipe yourself.',
      )
    }
    const parsed = responseSchema.safeParse(data)
    if (!parsed.success)
      throw new Error(
        'AI returned a recipe the app cannot use. Your draft has not changed.',
      )
    return parsed.data
  },
}

// Demo mode has no backend. These canned answers show the flow and say so
// plainly; they never pretend to have read the household's text.
const demoRecipe: RecipeDraft = {
  title: 'Garlicky white bean & greens soup',
  description:
    'Demo example: a brothy, lunch-friendly soup with white beans, kale and lemon.',
  servings: 4,
  maxServings: 10,
  minutes: 35,
  protein: 'White beans',
  leftovers: true,
  potluck: true,
  ingredients: [
    { name: 'olive oil', amount: 2, unit: 'tbsp', category: 'Pantry' },
    { name: 'onion', amount: 1, unit: 'each', category: 'Produce' },
    { name: 'garlic', amount: 4, unit: 'each', category: 'Produce' },
    { name: 'white beans', amount: 800, unit: 'g', category: 'Protein' },
    { name: 'vegetable stock', amount: 1, unit: 'l', category: 'Pantry' },
    { name: 'kale', amount: 200, unit: 'g', category: 'Produce' },
  ],
  instructions: [
    'Warm the olive oil in a large pot and soften the chopped onion for 6-8 minutes.',
    'Add the sliced garlic and cook for 1 minute.',
    'Add the drained beans and stock, bring to a simmer and cook for 15 minutes.',
    'Stir in the chopped kale and simmer until tender, about 5 minutes. Season to taste.',
  ],
}
export const demoRecipeAi: RecipeAi = {
  demo: true,
  async draft(request, signal) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 600)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
    if (!request.base)
      return {
        recipe: demoRecipe,
        notes: [
          'Demo mode: this is a canned example, not generated from your description.',
        ],
      }
    const base = draftSchema.safeParse(request.base)
    if (!base.success)
      return {
        declined:
          'Demo mode can only refine a complete draft. Fill in the missing fields and try again.',
      }
    const hasLemon = base.data.ingredients.some((i) => i.name === 'lemon')
    return {
      recipe: hasLemon
        ? base.data
        : {
            ...base.data,
            ingredients: [
              ...base.data.ingredients,
              { name: 'lemon', amount: 1, unit: 'each', category: 'Produce' },
            ],
            instructions: [
              ...base.data.instructions,
              'Finish with lemon juice just before serving.',
            ],
          },
      notes: [
        hasLemon
          ? 'Demo mode: your request is not interpreted, so nothing changed.'
          : 'Demo mode: added a lemon as an example change; your request is not interpreted.',
      ],
    }
  },
}
