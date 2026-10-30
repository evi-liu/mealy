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
  /** Remix: the saved recipe. Live mode sends only its id. */
  original?: Recipe
  /** Import: a recipe page the server fetches and reads. */
  url?: string
}
/** A model comment; `target` names an ingredient, "step N" or a field. */
export type DraftNote = { target: string | null; text: string }
export type DraftResult =
  { recipe: RecipeDraft; notes: DraftNote[] } | { declined: string }
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
  z.object({
    recipe: draftSchema,
    notes: z
      .array(z.object({ target: z.string().nullable(), text: z.string() }))
      .max(12),
  }),
  z.object({ declined: z.string().min(1) }),
])

/**
 * A friendly message for a failed function call. Only HTTP errors carry a
 * response; network and relay failures (such as a function that was never
 * deployed) carry other context, which must not be read as JSON.
 */
export async function draftErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  const response =
    context && typeof (context as Response).json === 'function'
      ? (context as Response)
      : undefined
  if (!response)
    return "Couldn't reach AI drafting. It may not be set up yet, or you may be offline. Your recipe hasn't changed."
  const body: unknown = await response.json().catch(() => undefined)
  const message = (body as { error?: unknown } | undefined)?.error
  if (typeof message === 'string') return message
  if (response.status === 404)
    return "AI drafting isn't set up yet. Your recipe hasn't changed."
  return "AI drafting is unavailable right now. Your recipe hasn't changed."
}

export const liveRecipeAi: RecipeAi = {
  demo: false,
  async draft(request) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { original, ...rest } = request
    const { data, error } = await supabase.functions.invoke('recipe-draft', {
      body: original ? { ...rest, recipeId: original.id } : rest,
    })
    if (error) throw new Error(await draftErrorMessage(error))
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
    if (request.url)
      return {
        recipe: demoRecipe,
        notes: [
          {
            target: null,
            text: "Demo mode: this is a canned example; the link wasn't read.",
          },
        ],
      }
    if (request.original && !request.base) return demoRemix(request.original)
    if (!request.base)
      return {
        recipe: demoRecipe,
        notes: [
          {
            target: null,
            text: 'Demo mode: this is a canned example, not generated from your description.',
          },
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
          ? {
              target: null,
              text: 'Demo mode: your request is not interpreted, so nothing changed.',
            }
          : {
              target: 'lemon',
              text: 'Demo mode: added a lemon as an example change; your request is not interpreted.',
            },
      ],
    }
  },
}

// A first demo remix makes one of each kind of change so the highlights can
// be explored without a model.
function demoRemix(original: Recipe): DraftResult {
  const [first, ...rest] = original.ingredients
  const removed = rest.length > 1 ? rest.at(-1) : undefined
  const kept = removed ? rest.slice(0, -1) : rest
  const step = original.instructions.length
    ? 'Scatter the fresh herbs over just before serving.'
    : 'Cook as you usually would, then scatter the fresh herbs over before serving.'
  const recipe = draftSchema.safeParse({
    ...original,
    ingredients: [
      ...(first
        ? [{ ...first, amount: Math.round(first.amount * 15) / 10 }]
        : []),
      ...kept,
      { name: 'fresh herbs', amount: 15, unit: 'g', category: 'Produce' },
    ],
    instructions: [...original.instructions, step],
  })
  if (!recipe.success)
    return {
      declined:
        'Demo mode cannot remix this recipe until its ingredient amounts are reviewed.',
    }
  return {
    recipe: recipe.data,
    notes: [
      {
        target: null,
        text: 'Demo mode: example changes only; your request is not interpreted.',
      },
      ...(first
        ? [{ target: first.name, text: 'Demo: increased by half.' }]
        : []),
      ...(removed
        ? [{ target: removed.name, text: 'Demo: removed as an example.' }]
        : []),
      { target: 'fresh herbs', text: 'Demo: added for freshness.' },
      {
        target: `step ${recipe.data.instructions.length}`,
        text: 'Demo: new finishing step.',
      },
    ],
  }
}
