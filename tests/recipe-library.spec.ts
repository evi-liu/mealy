import { test, expect, corsHeaders } from './fixtures/kitchen'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { initialState } from '../src/domain'

async function drag(
  page: Page,
  row: Locator,
  dx: number,
  dy = 0,
  cancel = false,
) {
  const box = (await row.locator('.recipeRowOpen').boundingBox())!
  const x = box.x + Math.min(box.width - 15, 170)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  if (cancel)
    await row
      .locator('.recipeRowFront')
      .dispatchEvent('pointercancel', { pointerId: 1 })
  await page.mouse.up()
}

test('compact rows reveal Edit and Delete without opening details during a swipe', async ({
  page,
}) => {
  await page.goto('./#recipes')
  const rows = page.locator('.libraryRow')
  const first = rows.first()
  for (const row of (await rows.all()).slice(0, 3))
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(82)
  await expect(
    first.getByRole('button', { name: 'Edit', exact: true }),
  ).toHaveCount(0)
  await drag(page, first, -26)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await drag(page, first, -95)
  await expect(
    first.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible()
  await expect(
    first.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await drag(page, first, 140)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await drag(page, first, -95, 0, true)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await first.getByRole('button', { name: /^Recipe actions/ }).click()
  await expect(first).toHaveAttribute('data-revealed', 'true')
  await first.getByRole('button', { name: /^Recipe actions/ }).click()
  await drag(page, first, -10, 60)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await drag(page, first, -95)
  await rows
    .nth(1)
    .getByRole('button', { name: /^Recipe actions/ })
    .click()
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await expect(rows.nth(1)).toHaveAttribute('data-revealed', 'true')
  await rows.nth(1).getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Edit your recipe' }),
  ).toBeVisible()
  await expect(page.getByLabel('Recipe name', { exact: true })).toBeFocused()
})

test('row actions are keyboard accessible and fit a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#recipes')
  const first = page.locator('.libraryRow').first()
  const more = first.getByRole('button', { name: /^Recipe actions/ })
  await more.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(
    first.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    first.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await expect(first).toHaveAttribute('data-revealed', 'false')
})

test('real touch swipes reveal actions while vertical gestures still scroll', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Native touch injection uses Chromium CDP.',
  )
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('./#recipes')
  const first = page.locator('.libraryRow').first()
  const box = (await first.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const x = box.x + 180
  const y = box.y + box.height / 2
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= 6; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - step * 16, y }],
    })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(first).toHaveAttribute('data-revealed', 'true')
  await first.getByRole('button', { name: /^Recipe actions/ }).click()
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 180, y: 440 }],
  })
  for (let step = 1; step <= 6; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 180, y: 440 - step * 20 }],
    })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(30)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await cdp.detach()
})

test('photo cleanup happens after deletion, but never for a shared photo', async ({
  page,
  kitchen,
}) => {
  const imagePath = '10000000-0000-0000-0000-000000000001/shared.png'
  kitchen.state.recipes[0].imagePath = imagePath
  kitchen.state.recipes[1].imagePath = imagePath
  const removals: string[][] = []
  await page.route('**/storage/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          'access-control-allow-methods': 'POST,DELETE,OPTIONS',
        },
      })
    if (route.request().method() === 'DELETE') {
      expect(
        kitchen.state.recipes.some((recipe) => recipe.imagePath === imagePath),
      ).toBe(false)
      removals.push(route.request().postDataJSON().prefixes)
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: '[]',
      })
    }
    return route.fulfill({
      status: 403,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Test photo unavailable' }),
    })
  })
  await page.goto('./#recipes')
  for (let index = 0; index < 2; index++) {
    const row = page.locator('.libraryRow').first()
    await row.getByRole('button', { name: /^Recipe actions/ }).click()
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    await page
      .getByRole('button', { name: 'Delete recipe', exact: true })
      .click()
    await expect
      .poll(
        () =>
          kitchen.state.recipes.filter(
            (recipe) => recipe.imagePath === imagePath,
          ).length,
      )
      .toBe(1 - index)
    if (!index) expect(removals).toEqual([])
  }
  await expect.poll(() => removals).toEqual([[imagePath]])
})

test('a pending link import cannot be dismissed into a late unexpected editor', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/functions/v1/recipe-draft', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto('./#recipes')
  await page.getByRole('button', { name: 'Add recipe', exact: true }).click()
  await page.getByRole('button', { name: /Link a website/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Import from a link' })
  await sheet.getByLabel('Recipe link').fill('https://example.com/recipe')
  await sheet.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(
    sheet.getByRole('button', { name: 'Close add recipe' }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  release()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Garlicky white bean & greens soup',
  )
})

test('deletion requires confirmation and clears dependent planning state, not pantry', async ({
  page,
  kitchen,
}) => {
  const recipe = kitchen.state.recipes[0]
  kitchen.state.queue = [recipe.id]
  kitchen.state.decisions = { [recipe.id]: 'like' }
  kitchen.state.history = [recipe.id]
  kitchen.state.loved = [recipe.id]
  kitchen.state.plan = [
    { recipeId: recipe.id, servings: 4, role: 'dinner', pinned: true },
  ]
  kitchen.state.phase = 'plan'
  kitchen.state.confirmed = true
  kitchen.state.checked = ['rice:g']
  kitchen.state.pantry = [
    { id: 'rice-stock', name: 'rice', kind: 'staple', amount: 1, unit: 'cup' },
  ]
  await page.goto('./#recipes')
  const row = page.locator('.libraryRow').filter({
    has: page.getByRole('button', { name: recipe.title, exact: true }),
  })
  const remove = async () => {
    await row.getByRole('button', { name: /^Recipe actions/ }).click()
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
  }
  await remove()
  await expect(page.getByRole('alertdialog')).toContainText(
    'plan and grocery list will need to be rebuilt',
  )
  await page.getByRole('button', { name: 'Keep recipe', exact: true }).click()
  expect(kitchen.state.recipes.some((r) => r.id === recipe.id)).toBe(true)
  await remove()
  await page.getByRole('button', { name: 'Delete recipe', exact: true }).click()
  await expect(row).toHaveCount(0)
  expect(kitchen.state.queue).toEqual([])
  expect(kitchen.state.decisions).toEqual({})
  expect(kitchen.state.history).toEqual([])
  expect(kitchen.state.loved).toEqual([])
  expect(kitchen.state.blocked).toEqual([])
  expect(kitchen.state.plan).toEqual([])
  expect(kitchen.state.confirmed).toBe(false)
  expect(kitchen.state.checked).toEqual([])
  expect(kitchen.state.pantry).toHaveLength(1)
  await expect(
    page.getByRole('button', { name: 'Add recipe', exact: true }),
  ).toBeFocused()
  await page.reload()
  await expect(row).toHaveCount(0)
})

test('failed deletion keeps the saved recipe and reports the failure', async ({
  page,
  kitchen,
}) => {
  kitchen.failSave = true
  await page.goto('./#recipes')
  const count = kitchen.state.recipes.length
  const row = page.locator('.libraryRow').first()
  await row.getByRole('button', { name: /^Recipe actions/ }).click()
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete recipe', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Test save unavailable')
  expect(kitchen.state.recipes).toHaveLength(count)
  await expect(row).toBeVisible()
})

test('a concurrent edit prevents deletion of a stale recipe', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#recipes')
  const row = page.locator('.libraryRow').first()
  await row.getByRole('button', { name: /^Recipe actions/ }).click()
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  kitchen.state.recipes[0] = {
    ...kitchen.state.recipes[0],
    title: 'Updated on another phone',
  }
  kitchen.version++
  await page.getByRole('button', { name: 'Delete recipe', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('other phone')
  await expect(
    page.getByRole('button', { name: 'Updated on another phone', exact: true }),
  ).toBeVisible()
})

test('link import failure stays in the sheet and cannot expose manual creation', async ({
  page,
  kitchen,
}) => {
  kitchen.state = initialState([])
  await page.route('**/functions/v1/recipe-draft', (route) =>
    route.fulfill({
      status: 502,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not read that recipe page.' }),
    }),
  )
  await page.goto('./#recipes')
  await page.getByRole('button', { name: 'Add recipe', exact: true }).click()
  await page.getByRole('button', { name: /Link a website/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Import from a link' })
  await expect(sheet.getByLabel('Recipe link')).toBeFocused()
  await sheet.getByLabel('Recipe link').fill('https://example.com/recipe')
  await sheet.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText('Could not read')
  await expect(sheet.getByLabel('Recipe link')).toHaveValue(
    'https://example.com/recipe',
  )
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Back to add options' }).click()
  await expect(page.getByRole('button', { name: /Add with AI/ })).toBeVisible()
  expect(kitchen.state.recipes).toEqual([])
})
