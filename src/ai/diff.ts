import { normalize, type Ingredient } from '../domain'
import type { DraftNote, RecipeDraft } from './recipeAi'

export type Change = 'same' | 'added' | 'removed' | 'changed'
export type IngredientChange = {
  change: Change
  ingredient: Ingredient
  before?: Ingredient
  note?: string
}
export type StepChange = {
  change: Change
  text: string
  before?: string
  /** 1-based position in the draft; removed steps have none. */
  number?: number
  note?: string
}
export type FieldChange = {
  field: keyof Omit<RecipeDraft, 'ingredients' | 'instructions'>
  before: string | number | boolean
  after: string | number | boolean
  note?: string
}
export type RecipeDiff = {
  ingredients: IngredientChange[]
  steps: StepChange[]
  fields: FieldChange[]
  /** Model notes that did not match a highlighted change. */
  general: string[]
  counts: Record<'added' | 'removed' | 'changed', number>
}

const fields = [
  'title',
  'description',
  'servings',
  'maxServings',
  'minutes',
  'protein',
  'leftovers',
  'potluck',
] as const
const stepKey = (step: string) => normalize(step).replace(/[.!]+$/, '')

/**
 * Highlights are computed here rather than trusted from the model: ingredients
 * match by normalized name, steps by longest common subsequence, and a
 * removal directly followed by an addition reads as an edited step.
 */
export function diffRecipe(
  before: RecipeDraft,
  after: RecipeDraft,
  notes: DraftNote[] = [],
): RecipeDiff {
  const remaining = new Map<string, Ingredient>()
  for (const item of before.ingredients)
    if (!remaining.has(normalize(item.name)))
      remaining.set(normalize(item.name), item)
  const ingredients: IngredientChange[] = after.ingredients.map(
    (ingredient) => {
      const previous = remaining.get(normalize(ingredient.name))
      if (!previous) return { change: 'added', ingredient }
      remaining.delete(normalize(ingredient.name))
      const same =
        previous.amount === ingredient.amount &&
        previous.unit === ingredient.unit &&
        previous.category === ingredient.category
      return same
        ? { change: 'same', ingredient }
        : { change: 'changed', ingredient, before: previous }
    },
  )
  for (const ingredient of remaining.values())
    ingredients.push({ change: 'removed', ingredient })

  const a = before.instructions.map(stepKey)
  const b = after.instructions.map(stepKey)
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
  const raw: StepChange[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ change: 'same', text: after.instructions[j], number: j + 1 })
      i++
      j++
    } else if (
      i < a.length &&
      (j === b.length || table[i + 1][j] >= table[i][j + 1])
    ) {
      // Removals first, so a replaced step pairs as removed→added below.
      raw.push({ change: 'removed', text: before.instructions[i] })
      i++
    } else {
      raw.push({ change: 'added', text: after.instructions[j], number: j + 1 })
      j++
    }
  }
  const steps: StepChange[] = []
  for (let k = 0; k < raw.length; k++) {
    const next = raw[k + 1]
    if (raw[k].change === 'removed' && next?.change === 'added') {
      steps.push({ ...next, change: 'changed', before: raw[k].text })
      k++
    } else steps.push(raw[k])
  }

  const changedFields: FieldChange[] = fields
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, before: before[field], after: after[field] }))

  const general: string[] = []
  for (const note of notes) {
    const target = note.target ? normalize(note.target) : ''
    const step = /^step (\d+)$/.exec(target)
    const match =
      (step &&
        steps.find(
          (s) => s.change !== 'same' && s.number === Number(step[1]),
        )) ||
      ingredients.find(
        (item) =>
          item.change !== 'same' && normalize(item.ingredient.name) === target,
      ) ||
      changedFields.find((field) => normalize(field.field) === target)
    if (match && !match.note) match.note = note.text
    else general.push(note.text)
  }

  const counts = { added: 0, removed: 0, changed: changedFields.length }
  for (const item of [...ingredients, ...steps])
    if (item.change !== 'same') counts[item.change]++
  return { ingredients, steps, fields: changedFields, general, counts }
}
