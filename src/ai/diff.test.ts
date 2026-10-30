import { describe, expect, it } from 'vitest'
import { diffRecipe } from './diff'
import type { RecipeDraft } from './recipeAi'

const base: RecipeDraft = {
  title: 'Chicken rice',
  description: 'Simple.',
  servings: 4,
  maxServings: 8,
  minutes: 40,
  protein: 'Chicken',
  leftovers: true,
  potluck: false,
  ingredients: [
    { name: 'chicken thighs', amount: 600, unit: 'g', category: 'Protein' },
    { name: 'rice', amount: 2, unit: 'cup', category: 'Pantry' },
    { name: 'scallions', amount: 4, unit: 'each', category: 'Produce' },
  ],
  instructions: [
    'Cook the rice.',
    'Sear the chicken.',
    'Serve with scallions.',
  ],
}

describe('recipe diff', () => {
  it('reports nothing for an identical recipe', () => {
    const diff = diffRecipe(base, structuredClone(base))
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(diff.ingredients.every((i) => i.change === 'same')).toBe(true)
  })

  it('matches ingredients by normalized name', () => {
    const diff = diffRecipe(base, {
      ...base,
      ingredients: [
        {
          name: 'Chicken  Thighs',
          amount: 800,
          unit: 'g',
          category: 'Protein',
        },
        { name: 'rice', amount: 2, unit: 'cup', category: 'Pantry' },
        { name: 'ginger', amount: 20, unit: 'g', category: 'Produce' },
      ],
    })
    expect(diff.ingredients.map((i) => i.change)).toEqual([
      'changed',
      'same',
      'added',
      'removed',
    ])
    expect(diff.ingredients[0].before?.amount).toBe(600)
    expect(diff.ingredients[3].ingredient.name).toBe('scallions')
  })

  it('aligns steps and pairs a replaced step as changed', () => {
    const diff = diffRecipe(base, {
      ...base,
      instructions: [
        'Rinse and cook the rice',
        'Sear the chicken.',
        'Rest for 5 minutes.',
        'Serve with scallions.',
      ],
    })
    expect(diff.steps.map((s) => [s.change, s.number])).toEqual([
      ['changed', 1],
      ['same', 2],
      ['added', 3],
      ['same', 4],
    ])
    expect(diff.steps[0].before).toBe('Cook the rice.')
  })

  it('ignores trailing punctuation and case in steps', () => {
    const diff = diffRecipe(base, {
      ...base,
      instructions: [
        'cook the rice',
        'Sear the chicken!',
        'Serve with scallions.',
      ],
    })
    expect(diff.steps.every((s) => s.change === 'same')).toBe(true)
  })

  it('records removed steps without a number', () => {
    const diff = diffRecipe(base, {
      ...base,
      instructions: ['Cook the rice.', 'Serve with scallions.'],
    })
    expect(diff.steps.find((s) => s.change === 'removed')).toEqual({
      change: 'removed',
      text: 'Sear the chicken.',
    })
  })

  it('attaches model notes to matching changes and keeps the rest general', () => {
    const diff = diffRecipe(
      base,
      {
        ...base,
        minutes: 50,
        ingredients: [
          ...base.ingredients,
          { name: 'ginger', amount: 20, unit: 'g', category: 'Produce' },
        ],
        instructions: [...base.instructions, 'Top with ginger.'],
      },
      [
        { target: 'Ginger', text: 'Adds warmth.' },
        { target: 'step 4', text: 'New finish.' },
        { target: 'minutes', text: 'Extra simmering.' },
        { target: 'rice', text: 'Unchanged, so general.' },
        { target: null, text: 'Overall lighter.' },
      ],
    )
    expect(diff.ingredients.at(-1)?.note).toBe('Adds warmth.')
    expect(diff.steps.at(-1)?.note).toBe('New finish.')
    expect(diff.fields).toEqual([
      { field: 'minutes', before: 40, after: 50, note: 'Extra simmering.' },
    ])
    expect(diff.general).toEqual(['Unchanged, so general.', 'Overall lighter.'])
    expect(diff.counts).toEqual({ added: 2, removed: 0, changed: 1 })
  })

  it('treats every step as added when the original had none', () => {
    const diff = diffRecipe(
      { ...base, instructions: [] },
      { ...base, instructions: ['One.', 'Two.'] },
    )
    expect(diff.steps.map((s) => s.change)).toEqual(['added', 'added'])
  })
})
