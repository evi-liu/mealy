import { test, expect } from './fixtures/kitchen'
import type { Page } from '@playwright/test'

// Requests fail as they would without a connection, and the browser
// reports itself offline.
const disconnected: Parameters<Page['route']>[1] = (route) =>
  new URL(route.request().url()).origin === 'https://mealy-test.supabase.co'
    ? route.abort('internetdisconnected')
    : route.fallback()
async function goOffline(page: Page) {
  await page.context().setOffline(true)
  await page.route('**/*', disconnected)
}
async function goOnline(page: Page) {
  // Removes only this handler; the fixture's mock server stays in place.
  await page.unroute('**/*', disconnected)
  await page.context().setOffline(false)
}

async function addPantryItem(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add to pantry' })
  await sheet.getByRole('textbox', { name: 'Ingredient name' }).fill(name)
  await sheet.getByRole('textbox', { name: 'Ingredient name' }).press('Enter')
  await expect(sheet.getByRole('status')).toContainText(`${name} added`)
  await page.keyboard.press('Escape')
}

test('offline: no disconnected banner, changes apply and sync later, AI waits', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#pantry')
  await expect(page.getByRole('heading', { name: 'Pantry' })).toBeVisible()
  await goOffline(page)

  await addPantryItem(page, 'tofu')
  await expect(page.locator('.pantryItem strong')).toContainText(['tofu'])
  expect(kitchen.state.pantry.map((item) => item.name)).not.toContain('tofu')
  await expect(
    page.getByText(/Connection unavailable|Disconnected/i),
  ).toHaveCount(0)
  await expect(page.locator('.errorBanner')).toHaveCount(0)

  // AI actions say why they're unavailable instead of failing.
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await expect(page.getByRole('button', { name: /Add with AI/ })).toBeDisabled()
  await expect(
    page.getByText(/AI needs an internet connection/).first(),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  // Back online, the queued change reaches the server by itself.
  await goOnline(page)
  await expect
    .poll(() => kitchen.state.pantry.map((item) => item.name))
    .toContain('tofu')
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await expect(page.getByRole('button', { name: /Add with AI/ })).toBeEnabled()
})

test('offline changes replay on top of another phone’s newer save', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#pantry')
  await expect(page.getByRole('heading', { name: 'Pantry' })).toBeVisible()
  await goOffline(page)
  await addPantryItem(page, 'eggs')
  // Meanwhile another phone saves a change to the same household.
  kitchen.state = {
    ...kitchen.state,
    pantry: [
      ...kitchen.state.pantry,
      { id: 'other', name: 'rice', kind: 'staple', amount: 1, unit: 'each' },
    ],
  }
  kitchen.version++
  await goOnline(page)
  await expect
    .poll(() => kitchen.state.pantry.map((item) => item.name).sort())
    .toEqual(['eggs', 'rice'])
  // This phone shows both, in the pantry's own order.
  for (const name of ['rice', 'eggs'])
    await expect(
      page.locator('.pantryItem strong').filter({ hasText: name }),
    ).toBeVisible()
})

test('opens with the last household state when the server is unreachable', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#pantry')
  await addPantryItem(page, 'miso')
  await expect
    .poll(() => kitchen.state.pantry.map((item) => item.name))
    .toContain('miso')
  // The server stops answering; the app still opens from this device.
  await page.route('**/rest/v1/**', (route) =>
    route.abort('internetdisconnected'),
  )
  await page.reload()
  await expect(page.locator('.pantryItem strong')).toContainText(['miso'])
  await expect(page.locator('.errorBanner')).toHaveCount(0)
})

test('Profile stays calm offline: last-known household, no fetch errors', async ({
  page,
}) => {
  await page.goto('./#profile')
  await expect(
    page.getByRole('heading', { name: 'Test kitchen' }),
  ).toBeVisible()
  await goOffline(page)
  // Leave and come back so every card loads again without a connection.
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByText(/You're offline/)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Test kitchen' }),
  ).toBeVisible()
  await expect(page.getByText(/Failed to fetch|Load failed/)).toHaveCount(0)
  await expect(page.locator('.error')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rename' })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Leave household' }),
  ).toBeDisabled()
  await goOnline(page)
  await expect(page.getByText(/You're offline/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rename' })).toBeEnabled()
})
