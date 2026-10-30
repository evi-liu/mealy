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
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.locator('.groceryScreen').evaluate((screen) => {
      const firstRow = screen.querySelector('.groceryItem')!
      const bounds = firstRow.getBoundingClientRect()
      return {
        rowTop: bounds.top,
        rowHeight: bounds.height,
        border: getComputedStyle(firstRow).borderBottomWidth,
        paddingTop: getComputedStyle(screen).paddingTop,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        toggleHeight: screen
          .querySelector('.unitToggle')!
          .getBoundingClientRect().height,
        toggleWidth: screen
          .querySelector('.unitToggle')!
          .getBoundingClientRect().width,
        buttons: Array.from(screen.querySelectorAll('.unitToggle button')).map(
          (button) => button.getBoundingClientRect().height,
        ),
      }
    })
    expect(layout.rowTop).toBeLessThan(180)
    expect(layout.rowHeight).toBeGreaterThanOrEqual(44)
    expect(layout.rowHeight).toBeLessThanOrEqual(48)
    expect(layout.border).toBe('0px')
    expect(layout.paddingTop).toBe('12px')
    expect(layout.overflow).toBe(false)
    expect(layout.buttons.every((height) => height >= 32)).toBe(true)
    expect(layout.toggleHeight).toBeLessThanOrEqual(38)
    expect(layout.toggleWidth).toBeLessThanOrEqual(160)
  }
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

test('pantry plus opens a single ingredient field and rejects duplicates', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  const input = page.getByRole('textbox', { name: 'Ingredient name' })
  await expect(input).toBeFocused()
  await expect(page.locator('.pantryQuickAdd input')).toHaveCount(1)
  await expect(
    page.getByRole('textbox', { name: 'How much is left (optional)' }),
  ).toHaveCount(0)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const field = (await input.boundingBox())!
    const add = (await page
      .getByRole('button', { name: 'Add ingredient', exact: true })
      .boundingBox())!
    expect(Math.abs(field.y - add.y)).toBeLessThan(1)
    expect(add.x + add.width).toBeLessThanOrEqual(width)
  }
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)
  await input.fill('Rice')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.locator('.pantryItem')).toHaveCount(1)
  await expect(page.locator('.pantryItem strong')).toHaveText('rice')
  await expect(page.locator('.pantryItem small')).toHaveCount(0)
  await expect(page.locator('.pantryCheck')).toHaveCount(1)
  await input.fill(' rice ')
  await page
    .getByRole('button', { name: 'Add ingredient', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('already in your pantry')
  await expect(page.locator('.pantryItem')).toHaveCount(1)
  await input.fill('')
  await input.press('Escape')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page
    .getByRole('group', { name: 'rice', exact: true })
    .press('ArrowLeft')
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
