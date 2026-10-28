import { describe, expect, it } from 'vitest'
import { groceryQuantity } from './domain'

describe('grocery display units', () => {
  it.each([
    [700, 'g', 'metric', '700 g'],
    [1001, 'g', 'metric', '1.001 kg'],
    [1500, 'ml', 'metric', '1.5 l'],
    [700, 'g', 'us', '1.55 lb'],
    [28.349523125, 'g', 'us', '1 oz'],
    [453.59237, 'g', 'us', '1 lb'],
    [105, 'ml', 'us', '7 tbsp'],
    [240, 'ml', 'us', '1 cup'],
    [2.5, 'ml', 'us', '0.5 tsp'],
    [0, 'g', 'us', '0 oz'],
    [3, 'each', 'us', '3 each'],
  ] as const)('formats %s %s in %s', (amount, unit, system, expected) => {
    expect(groceryQuantity(amount, unit, system)).toBe(expected)
  })
  it('keeps mass and volume separate and never changes the input quantity', () => {
    const amount = 700
    for (let i = 0; i < 10; i++) {
      expect(groceryQuantity(amount, 'g', 'us')).toBe('1.55 lb')
      expect(groceryQuantity(amount, 'g', 'metric')).toBe('700 g')
    }
    expect(groceryQuantity(700, 'ml', 'us')).toBe('2.92 cup')
  })
})
