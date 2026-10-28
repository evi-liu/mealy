import type { Recipe } from './domain'

// Original illustrative fixtures, not scraped recipes or photographed dishes.
const fixtures = [
  ['Lemony chickpea rice', 'Chickpeas', 'chickpeas', 'rice', 'spinach', 25],
  [
    'Tomato & white bean stew',
    'White beans',
    'white beans',
    'tomatoes',
    'kale',
    35,
  ],
  ['Ginger tofu bowls', 'Tofu', 'firm tofu', 'rice', 'broccoli', 30],
  [
    'Roasted lentil vegetables',
    'Lentils',
    'cooked lentils',
    'potatoes',
    'carrots',
    40,
  ],
  [
    'Smoky black bean skillet',
    'Black beans',
    'black beans',
    'tomatoes',
    'peppers',
    25,
  ],
  ['Creamy mushroom pasta', 'Mushrooms', 'mushrooms', 'pasta', 'spinach', 30],
  [
    'Sweet potato chickpea tray',
    'Chickpeas',
    'chickpeas',
    'sweet potatoes',
    'onions',
    45,
  ],
  ['Sesame edamame rice', 'Edamame', 'shelled edamame', 'rice', 'carrots', 25],
  ['Warm lentil pasta', 'Lentils', 'cooked lentils', 'pasta', 'tomatoes', 30],
  [
    'Herby white bean potatoes',
    'White beans',
    'white beans',
    'potatoes',
    'spinach',
    40,
  ],
] as const

export const demoRecipes: Recipe[] = fixtures.map(
  ([title, protein, main, starch, vegetable, minutes], i) => ({
    id: `demo-${i + 1}`,
    title,
    protein,
    minutes,
    servings: 4,
    maxServings: 12,
    description:
      'Illustrative demo recipe. Replace with one of your own kitchen favorites.',
    leftovers: true,
    potluck: i % 2 === 0,
    source: 'demo',
    ingredients: [
      { name: main, amount: 500, unit: 'g', category: 'Protein' },
      { name: starch, amount: 300, unit: 'g', category: 'Pantry' },
      { name: vegetable, amount: 400, unit: 'g', category: 'Produce' },
      { name: 'olive oil', amount: 2, unit: 'tbsp', category: 'Pantry' },
    ],
    instructions: [
      'Demo only: these ingredients illustrate scaling and shopping, not a tested cooking method. Add your own complete recipe to cook from Mealy.',
    ],
  }),
)
