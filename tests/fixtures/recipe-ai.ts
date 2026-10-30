import type { RecipeDraft, DraftResult } from '../../src/ai/recipeAi'
import type { Recipe } from '../../src/domain'

const soup: RecipeDraft = {
  title: 'Garlicky white bean & greens soup',
  description: 'A mock response used only by browser tests.',
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
  instructions: ['Simmer the beans and vegetables until tender.'],
}

export function mockDraft(base?: RecipeDraft, original?: Recipe): DraftResult {
  if (base)
    return {
      recipe: {
        ...base,
        ingredients: [
          ...base.ingredients,
          { name: 'lemon', amount: 1, unit: 'each', category: 'Produce' },
        ],
        instructions: [...base.instructions, 'Finish with lemon juice.'],
      },
      notes: [{ target: 'lemon', text: 'Added lemon for brightness.' }],
    }
  if (!original)
    return {
      recipe: soup,
      notes: [{ target: null, text: 'Review the quantities before cooking.' }],
    }
  const [first, ...rest] = original.ingredients
  const removed = rest.at(-1)!
  return {
    recipe: {
      ...original,
      ingredients: [
        { ...first, amount: first.amount * 1.5 },
        ...rest.slice(0, -1),
        { name: 'fresh herbs', amount: 15, unit: 'g', category: 'Produce' },
      ],
      instructions: [
        ...original.instructions,
        'Scatter fresh herbs over before serving.',
      ],
    },
    notes: [
      { target: first.name, text: 'Increased by half.' },
      { target: removed.name, text: 'Removed from the recipe.' },
      { target: 'fresh herbs', text: 'Added for freshness.' },
    ],
  }
}
