import { test, expect } from './fixtures/kitchen'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function confirmedWeek(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: 'Appealing this week' }).click()
    await expect(page.getByText(`${i} liked`)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Build my week' }).click()
  await page
    .getByRole('button', { name: /Confirm & make grocery list/ })
    .click()
}

test('checking off a grocery stocks the pantry and unchecking takes it back', async ({
  page,
}) => {
  await confirmedWeek(page)
  const row = page.locator('.groceryItem').first()
  const name = (await row.locator('strong').innerText()).split(' · ')[0]
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.locator('.pantryItem strong')).toHaveText([name])

  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).not.toBeChecked()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.locator('.pantryItem')).toHaveCount(0)

  // Removing a bought item from the pantry unchecks just that grocery.
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.locator('.groceryItem').nth(1).getByRole('checkbox').click()
  await expect(
    page.locator('.groceryItem').nth(1).getByRole('checkbox'),
  ).toBeChecked()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await page.getByRole('button', { name: `Remove ${name}` }).click()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(row.getByRole('checkbox')).not.toBeChecked()
  await expect(
    page.locator('.groceryItem').nth(1).getByRole('checkbox'),
  ).toBeChecked()

  // A fresh week keeps the pantry.
  await page.getByRole('button', { name: 'Start a fresh week' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Start fresh' })
    .click()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.locator('.pantryItem')).toHaveCount(1)
})

test('pantry plus opens a focused field for consecutive additions without weekly controls', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#pantry')
  await expect(
    page.getByRole('button', { name: 'Start a fresh week' }),
  ).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Quick add' })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  const add = page.getByRole('button', { name: 'Add pantry ingredient' })
  await add.click()
  const sheet = page.getByRole('dialog', { name: 'Add to pantry' })
  const input = sheet.getByRole('textbox', { name: 'Ingredient name' })
  await expect(input).toBeFocused()
  await expect(sheet.getByRole('textbox')).toHaveCount(1)
  await expect(sheet.getByRole('spinbutton')).toHaveCount(0)
  await expect(sheet.locator('.dialogClose')).toHaveCount(0)
  await input.fill('Olive oil')
  await input.press('Enter')
  await expect(sheet.getByRole('status')).toContainText('Olive oil added')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await input.fill('eggs')
  await sheet
    .getByRole('button', { name: 'Add ingredient', exact: true })
    .click()
  await expect(sheet.getByRole('status')).toContainText('eggs added')
  expect(kitchen.state.pantry.map((item) => item.name)).toEqual([
    'olive oil',
    'eggs',
  ])
  expect(kitchen.state.plan).toEqual([])
  expect(kitchen.aiRequests).toBe(0)
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([])
  await page.locator('.dialogBackdrop').click({ position: { x: 5, y: 5 } })
  await expect(sheet).toHaveCount(0)
  await expect(add).toBeFocused()
  await expect(page.locator('.pantryItem strong')).toHaveText([
    'eggs',
    'olive oil',
  ])
  await page.reload()
  await expect(page.locator('.pantryItem strong')).toHaveText([
    'eggs',
    'olive oil',
  ])
  await add.click()
  await expect(input).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(add).toBeFocused()
})

test('at-home ingredients cross off groceries and running out restores only that ingredient', async ({
  page,
  kitchen,
}) => {
  kitchen.state.pantry = [
    {
      id: 'existing-oil',
      name: 'olive oil',
      kind: 'quantity',
      amount: 0.1,
      unit: 'ml',
      note: 'legacy note',
    },
  ]
  await confirmedWeek(page)
  const oil = page.locator('.groceryItem').filter({ hasText: 'olive oil' })
  await expect(oil.getByRole('checkbox')).toBeChecked()
  await expect(oil.getByRole('checkbox')).toBeDisabled()
  await expect(oil).toContainText('At home')
  await expect(oil.locator('strong')).not.toContainText('· 0 ')
  await page.reload()
  await expect(oil.getByRole('checkbox')).toBeChecked()
  const other = page
    .locator('.groceryItem')
    .filter({ hasNotText: 'olive oil' })
    .first()
  await other.getByRole('checkbox').click()
  await expect(other.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Start a fresh week' }),
  ).toHaveCount(0)
  expect(
    kitchen.state.pantry.find((item) => item.id === 'existing-oil')?.note,
  ).toBe('legacy note')
  await page
    .getByRole('button', { name: 'Remove olive oil', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'At home', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(oil.getByRole('checkbox')).not.toBeChecked()
  await expect(oil.getByRole('checkbox')).toBeEnabled()
  await expect(other.getByRole('checkbox')).toBeChecked()
})

test('failed pantry saves retain the input and keep the sheet usable', async ({
  page,
  kitchen,
}) => {
  kitchen.failSave = true
  await page.goto('./#pantry')
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  const input = page.getByRole('textbox', { name: 'Ingredient name' })
  await input.fill('rice')
  await input.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Test save unavailable')
  await expect(input).toHaveValue('rice')
  expect(kitchen.state.pantry).toEqual([])
  kitchen.failSave = false
  await page
    .getByRole('button', { name: 'Add ingredient', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('rice added')
  await expect(input).toHaveValue('')
})

test('a pending pantry add cannot be duplicated or dismissed mid-save', async ({
  page,
  kitchen,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/rpc/save_household', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto('./#pantry')
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add to pantry' })
  const input = sheet.getByRole('textbox', { name: 'Ingredient name' })
  await input.fill('rice')
  await input.press('Enter')
  await expect(input).toBeDisabled()
  await expect(
    sheet.getByRole('button', { name: 'Add ingredient', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.locator('.dialogBackdrop').click({ position: { x: 5, y: 5 } })
  await expect(sheet).toBeVisible()
  release()
  await expect(sheet.getByRole('status')).toContainText('rice added')
  expect(kitchen.state.pantry.map((item) => item.name)).toEqual(['rice'])
})
