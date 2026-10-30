import { test, expect } from './fixtures/kitchen'
import AxeBuilder from '@axe-core/playwright'
import { initialState, makeBookmark } from '../src/domain'
import { tiffyRecipeFacts } from '../src/recipeFacts'

test('imports source facts, reviews a recipe and plans only reviewed quantities', async ({
  page,
  kitchen,
}) => {
  const state = initialState()
  state.bookmarks = tiffyRecipeFacts.map((recipe) =>
    makeBookmark(recipe.title, recipe.sourceUrl!),
  )
  kitchen.state = state
  await page.goto('./#recipes')
  await page
    .getByRole('button', { name: 'Add recipe facts for 10 Tiffy Cooks links' })
    .click()
  await expect(page.locator('.recipeEntry')).toHaveCount(10)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await expect(page.locator('.bookmarks article')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Add recipe facts for/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Start choosing recipes' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  const salmon = tiffyRecipeFacts[5]
  const row = page.locator('.recipeEntry').filter({ hasText: salmon.title })
  await row.locator('.recipeTitle').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('2 servings')
  await expect(
    dialog.getByRole('heading', { name: 'Method', exact: true }),
  ).toHaveCount(0)
  await expect(
    dialog.getByRole('link', {
      name: 'Read cooking directions on Tiffy Cooks',
    }),
  ).toHaveAttribute('href', salmon.sourceUrl!)
  await expect(dialog.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close recipe' }).click()
  await row.getByRole('button', { name: 'Review details' }).click()
  await expect(page.getByLabel('Max batch servings')).toHaveValue('2')
  await expect(page.getByLabel('Instructions (one step per line)')).toHaveCount(
    0,
  )
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByLabel('Main protein / variety').fill('salmon')
  await page.getByLabel('Max batch servings').fill('4')
  await page
    .getByRole('checkbox', { name: 'Good for leftover lunches' })
    .check()
  await page
    .getByRole('checkbox', { name: /I reviewed the ingredient amounts/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  await expect(
    row.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Fewer dinners' }).click()
  await page.getByRole('switch', { name: /Traveling this week/ }).click()
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu'])
    await page.getByRole('button', { name: `Away ${day}` }).click()
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  await expect(page.locator('.recipeCard h2')).toHaveText(salmon.title)
  await page.getByRole('button', { name: 'Appealing this week' }).click()
  await page.getByRole('button', { name: 'Build my week' }).click()
  await page
    .getByRole('button', { name: 'Confirm & make grocery list' })
    .click()
  await expect(
    page.locator('.groceryItem').filter({ hasText: 'soy sauce' }),
  ).toContainText('6 tbsp')
  await page.reload()
  await expect(
    page.locator('.groceryItem').filter({ hasText: 'soy sauce' }),
  ).toContainText('6 tbsp')
})

test('unresolved source amounts stay blank until the household reviews them', async ({
  page,
  kitchen,
}) => {
  const recipe = tiffyRecipeFacts[0]
  const state = initialState([recipe])
  kitchen.state = state
  await page.goto('./#recipes')
  await page.getByRole('button', { name: 'Review details' }).click()
  const chili = page
    .locator('.ingredientEditor')
    .filter({ hasText: '1-3 Red Chili' })
  await expect(chili.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(
    '',
  )
  await expect(chili).toContainText('Choose an amount within the source range.')
  await page.getByLabel('Main protein / variety').fill('vegetables')
  await page
    .getByRole('checkbox', { name: /I reviewed the ingredient amounts/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Review recipe facts' }),
  ).toBeVisible()
  await chili.getByRole('spinbutton', { name: 'Amount' }).fill('2')
  await chili
    .getByRole('combobox', { name: 'Unit', exact: true })
    .selectOption('each')
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  await expect(
    page
      .locator('.recipeEntry')
      .getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible()
})
