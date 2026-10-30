import { test, expect, corsHeaders } from './fixtures/kitchen'

test('requires Google sign-in and never opens legacy demo storage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('test-session-initialized', 'true')
    localStorage.removeItem('sb-mealy-test-auth-token')
    localStorage.setItem(
      'mealy-demo-v1',
      '{"recipes":[{"title":"Old local recipe"}]}',
    )
  })
  await page.goto('./')
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeEnabled()
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0)
  await expect(page.getByText('Old local recipe')).toHaveCount(0)
  await expect(page.getByRole('navigation')).toHaveCount(0)
})

test('unauthorized accounts cannot fall back to local recipes', async ({
  page,
  kitchen,
}) => {
  kitchen.authorized = false
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Set up your kitchen' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0)
  await expect(page.locator('.recipeEntry')).toHaveCount(0)
})

test('failed live saves show an error without local success or household storage', async ({
  page,
  kitchen,
}) => {
  kitchen.failSave = true
  await page.goto('./#pantry')
  await page
    .getByRole('textbox', { name: 'Add pantry ingredient' })
    .fill('rice')
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  await expect(page.getByRole('alert')).toContainText('Test save unavailable')
  await expect(page.locator('.pantryItem')).toHaveCount(0)
  expect(kitchen.state.pantry).toEqual([])
  expect(
    await page.evaluate(() => localStorage.getItem('mealy-demo-v1')),
  ).toBeNull()
})

test('signing out closes the real kitchen', async ({ page }) => {
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Plan your week' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
})

test('AI failures leave the form unchanged instead of supplying a canned recipe', async ({
  page,
}) => {
  await page.route('**/functions/v1/recipe-draft', (route) =>
    route.fulfill({
      status: 502,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'AI provider unavailable.' }),
    }),
  )
  await page.goto('./#recipes')
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await page.getByLabel('Describe a recipe to add').fill('Bean soup')
  await page.getByRole('button', { name: 'Draft recipe' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'AI provider unavailable.',
  )
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Save recipe', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Describe a recipe to add')).toHaveValue(
    'Bean soup',
  )
})
