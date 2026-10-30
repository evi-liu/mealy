import { test, expect, type Page } from '@playwright/test'

async function confirmedWeek(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try the demo' }).click()
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
  await row.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.locator('.pantryItem strong')).toHaveText([name])

  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await row.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(page.locator('.pantryItem')).toHaveCount(0)

  // Removing a bought item from the pantry unchecks just that grocery.
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await row.getByRole('checkbox').check()
  await page.locator('.groceryItem').nth(1).getByRole('checkbox').check()
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

test('pantry items take an optional note when adding and editing', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()

  await page
    .getByRole('textbox', { name: 'Add pantry ingredient' })
    .fill('Olive oil')
  await page
    .getByRole('textbox', { name: 'How much is left (optional)' })
    .fill('half full')
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  await page
    .getByRole('textbox', { name: 'Add pantry ingredient' })
    .fill('eggs')
  await page
    .getByRole('textbox', { name: 'Add pantry ingredient' })
    .press('Enter')

  const oil = page.locator('.pantryItem').filter({ hasText: 'olive oil' })
  await expect(oil).toContainText('half full')
  await expect(
    page.locator('.pantryItem').filter({ hasText: 'eggs' }),
  ).not.toContainText('·')

  await page.getByRole('button', { name: 'Edit eggs' }).click()
  await page
    .getByRole('textbox', { name: 'How much eggs is left' })
    .fill('10 left')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.locator('.pantryItem').filter({ hasText: 'eggs' }),
  ).toContainText('10 left')

  await page.getByRole('button', { name: 'Edit olive oil' }).click()
  await page
    .getByRole('textbox', { name: 'How much olive oil is left' })
    .fill('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(oil).not.toContainText('half full')

  // Renaming onto another item is refused rather than merging silently.
  await page.getByRole('button', { name: 'Edit eggs' }).click()
  await page.getByRole('textbox', { name: 'Name for eggs' }).fill('Olive Oil')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already in your pantry')
})
