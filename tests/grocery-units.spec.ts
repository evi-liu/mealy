import { test, expect } from './fixtures/kitchen'
import AxeBuilder from '@axe-core/playwright'

test('ingredient-first quantities convert without losing checks and persist after reload', async ({
  page,
  kitchen,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Appealing this week' }).click()
  await page.getByRole('button', { name: 'Build my week' }).click()
  await page
    .getByRole('button', { name: 'Confirm & make grocery list' })
    .click()
  const row = page.locator('.groceryItem').first()
  await expect(
    page
      .getByRole('group', { name: 'Grocery unit system' })
      .getByRole('button')
      .first(),
  ).toHaveText('US kitchen')
  await expect(
    page.getByRole('button', { name: 'US kitchen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(row.locator('strong')).toHaveText(
    /^[a-z][a-z ]+ · [\d,.]+ (oz|lb)$/,
  )
  const householdBeforeToggle = structuredClone(kitchen.state)
  await page.getByRole('button', { name: 'Metric', exact: true }).click()
  expect(kitchen.state).toEqual(householdBeforeToggle)
  const metricText = await row.locator('strong').innerText()
  expect(metricText).toMatch(/^[a-z][a-z ]+ · [\d,.]+ (g|kg)$/)
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'US kitchen', exact: true }).click()
  await expect(row.locator('strong')).toHaveText(
    /^[a-z][a-z ]+ · [\d,.]+ (oz|lb)$/,
  )
  await expect(row.getByRole('checkbox')).toBeChecked()
  await expect(
    page
      .locator('.groceryItem')
      .filter({ hasText: 'olive oil' })
      .locator('strong'),
  ).toHaveText(/^olive oil · [\d,.]+ (tsp|tbsp|cup)$/)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'US kitchen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Metric', exact: true }).click()
  await expect(row.locator('strong')).toHaveText(metricText)
  expect(
    await page.evaluate(() => localStorage.getItem('mealy-grocery-units')),
  ).toBe('metric')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Metric', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(row.locator('strong')).toHaveText(metricText)
})

test('pantry is a quick ingredient field, rejects duplicates and does not assume quantities', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Add pantry ingredient' })
  // An ingredient plus an optional free-text note; no quantity pickers.
  await expect(page.locator('.pantryQuickAdd input')).toHaveCount(2)
  await expect(
    page.getByRole('textbox', { name: 'How much is left (optional)' }),
  ).toHaveAttribute('placeholder', 'Describe how many or how much is left')
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)
  await input.fill('Rice')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(page.locator('.pantryItem')).toHaveCount(1)
  await expect(page.locator('.pantryItem')).toHaveText('rice')
  await expect(page.locator('.pantryItem small')).toHaveCount(0)
  await expect(page.locator('.pantryDot')).toHaveCount(1)
  await input.fill(' rice ')
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  await expect(page.getByRole('alert')).toContainText('already in your pantry')
  await expect(page.locator('.pantryItem')).toHaveCount(1)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Remove rice' }).click()
  await expect(page.locator('.pantryItem')).toHaveCount(0)
})

test('unit storage failures are visible rather than claiming the preference was saved', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mealy-grocery-units')
        throw new DOMException('Storage unavailable', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Appealing this week' }).click()
  await page.getByRole('button', { name: 'Build my week' }).click()
  await page
    .getByRole('button', { name: 'Confirm & make grocery list' })
    .click()
  await page.getByRole('button', { name: 'Metric', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Could not save your unit preference',
  )
  await expect(
    page.getByRole('button', { name: 'Metric', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(() => localStorage.getItem('mealy-grocery-units')),
  ).toBeNull()
})
