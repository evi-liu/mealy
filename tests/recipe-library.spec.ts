import { test, expect, corsHeaders } from './fixtures/kitchen'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { initialState } from '../src/domain'

test('recipe details fill the mobile screen and Back restores the library search', async ({
  page,
  kitchen,
}) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('./#recipes')
  await page
    .getByRole('button', { name: 'Search recipes', exact: true })
    .click()
  const search = page.getByRole('searchbox', { name: 'Search recipes' })
  await search.fill('chickpea')
  const title = page.getByRole('button', {
    name: kitchen.state.recipes[0].title,
    exact: true,
  })
  await title.focus()
  await title.press('Enter')
  const recipe = page.getByRole('dialog')
  await expect(recipe).toBeVisible()
  const box = (await recipe.boundingBox())!
  expect(box.x).toBe(0)
  expect(box.y).toBe(0)
  expect(box.width).toBe(390)
  expect(box.height).toBe(700)
  await expect(recipe).toHaveCSS('border-radius', '0px')
  await expect(page.locator('.dialogBackdrop')).toHaveCount(0)
  const back = recipe.getByRole('button', { name: 'Back to previous screen' })
  await expect(back).toBeFocused()
  const backBox = (await back.boundingBox())!
  expect(backBox.x).toBeLessThan(30)
  expect(backBox.y).toBeLessThan(30)
  await recipe.getByLabel('Remix this recipe').scrollIntoViewIfNeeded()
  expect((await back.boundingBox())!.y).toBeLessThan(30)
  await back.click()
  await expect(recipe).toHaveCount(0)
  await expect(search).toHaveValue('chickpea')
  await expect(title).toBeFocused()
})

test('AI creation uses a focused tall prompt sheet with cancel and no form fields', async ({
  page,
  kitchen,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./#recipes')
  const add = page.getByRole('button', { name: 'Add recipe', exact: true })
  await add.click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  const sheet = page.getByRole('dialog', { name: 'New recipe' })
  const prompt = sheet.getByLabel('Describe a recipe to add')
  await expect(prompt).toBeFocused()
  await expect(
    sheet.getByRole('button', { name: 'Draft recipe' }),
  ).toBeDisabled()
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveCount(0)
  const bounds = (await sheet.boundingBox())!
  expect(bounds.height).toBeGreaterThan(500)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(569)
  await prompt.fill('A quick noodle dish\nwith crunchy vegetables')
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([])
  // A mobile keyboard reduces the visual viewport without resizing the layout viewport.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', {
      configurable: true,
      value: 320,
    })
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect
    .poll(async () => {
      const box = (await sheet
        .getByRole('button', { name: 'Draft recipe' })
        .boundingBox())!
      return box.y + box.height
    })
    .toBeLessThanOrEqual(320)
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(add).toBeFocused()
  expect(kitchen.aiRequests).toBe(0)
  await add.click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await expect(prompt).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('a pending AI prompt stays in its sheet and preserves the prompt on failure', async ({
  page,
  kitchen,
}) => {
  const before = structuredClone(kitchen.state)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  await page.route('**/functions/v1/recipe-draft', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback()
    calls++
    await gate
    await route.fulfill({
      status: 502,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'AI is temporarily unavailable.' }),
    })
  })
  await page.goto('./#recipes')
  await page.getByRole('button', { name: 'Add recipe', exact: true }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  const sheet = page.getByRole('dialog', { name: 'New recipe' })
  const prompt = sheet.getByLabel('Describe a recipe to add')
  await prompt.fill('Ginger noodles')
  await prompt.press('Enter')
  await expect(sheet.getByRole('status')).toContainText('Drafting')
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await prompt.press('Enter')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  release()
  await expect(sheet.getByRole('alert')).toHaveText(
    'AI is temporarily unavailable.',
  )
  await expect(prompt).toHaveValue('Ginger noodles')
  await expect(
    sheet.getByRole('button', { name: 'Draft recipe' }),
  ).toBeEnabled()
  expect(calls).toBe(1)
  expect(kitchen.state).toEqual(before)
})

test('library search filters saved recipes by title, ingredient and source without AI', async ({
  page,
  kitchen,
}) => {
  const first = kitchen.state.recipes[0]
  first.sourceUrl = 'https://tiffycooks.com/example-recipe/'
  first.aiDraft = {
    createdAt: new Date().toISOString(),
    prompts: ['Fill in from the source'],
  }
  await page.goto('./#recipes')
  const search = page.getByRole('button', {
    name: 'Search recipes',
    exact: true,
  })
  const add = page.getByRole('button', { name: 'Add recipe', exact: true })
  expect((await search.boundingBox())!.x).toBeLessThan(
    (await add.boundingBox())!.x,
  )
  const originalCount = kitchen.state.recipes.length
  const row = page.locator('.libraryRow').first()
  await expect(
    row.getByRole('img', { name: 'AI-assisted recipe' }),
  ).toBeVisible()
  await expect(row).toContainText('Tiffy Cooks')
  await expect(row).not.toContainText('AI-DRAFTED')
  await search.click()
  const input = page.getByRole('searchbox', { name: 'Search recipes' })
  await expect(input).toBeFocused()
  await expect(page.locator('.libraryRow')).toHaveCount(originalCount)
  await input.fill('  LEMONY   chickpea ')
  await expect(page.locator('.libraryRow')).toHaveCount(1)
  await expect(page.locator('.libraryRow')).toContainText(first.title)
  await input.fill('tiffy')
  await expect(page.locator('.libraryRow')).toHaveCount(1)
  await input.fill('chickpeas')
  await expect(
    page.locator('.libraryRow').filter({ hasText: first.title }),
  ).toHaveCount(1)
  await input.fill('no matching recipe here')
  await expect(page.getByText(/No recipes found/)).toBeVisible()
  await expect(page.locator('.libraryRow')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.locator('.libraryRow')).toHaveCount(originalCount)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(search).toBeFocused()
  await expect(add).toBeVisible()
  await search.click()
  await expect(input).toHaveValue('')
  await input.press('Escape')
  await expect(search).toBeFocused()
  expect(kitchen.aiRequests).toBe(0)
})

test('search remains accessible at 320px and supports editing a result', async ({
  page,
  kitchen,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./#recipes')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  await page
    .getByRole('button', { name: 'Search recipes', exact: true })
    .click()
  const input = page.getByRole('searchbox', { name: 'Search recipes' })
  await input.fill(kitchen.state.recipes[0].title)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  const row = page.locator('.libraryRow')
  await row.locator('.recipeRowOpen').press('ArrowLeft')
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Recipe name', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Back to recipes' }).click()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue(kitchen.state.recipes[0].title)
  await expect(row).toHaveCount(1)
})

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
  const front = row.locator('.recipeRowFront')
  if (cancel)
    await front.evaluate((element) => {
      element.addEventListener(
        'pointerdown',
        (event) => {
          if (event instanceof PointerEvent)
            element.setAttribute(
              'data-test-pointer-id',
              String(event.pointerId),
            )
        },
        { once: true },
      )
    })
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  if (cancel) {
    const pointerId = await front.getAttribute('data-test-pointer-id')
    expect(pointerId).not.toBeNull()
    await front.dispatchEvent('pointercancel', { pointerId: Number(pointerId) })
  }
  await page.mouse.up()
}

test('compact rows reveal Edit and Delete without opening details during a swipe', async ({
  page,
}) => {
  await page.goto('./#recipes')
  const rows = page.locator('.libraryRow')
  const first = rows.first()
  await expect(
    page.getByRole('button', { name: /^Recipe actions/ }),
  ).toHaveCount(0)
  const heart = first.getByRole('button', {
    name: 'We loved this',
    exact: true,
  })
  const front = (await first.locator('.recipeRowFront').boundingBox())!
  const heartBox = (await heart.boundingBox())!
  expect(
    Math.abs(heartBox.x + heartBox.width - front.x - front.width),
  ).toBeLessThan(1)
  await expect(first).toHaveCSS('border-radius', '0px')
  await expect(first).toHaveCSS('border-bottom-width', '0px')
  await expect(first.locator('.recipeRowFront')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
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
  await heart.click()
  await expect(
    first.getByRole('button', { name: 'Loved', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await drag(page, first, -10, 60)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await drag(page, first, -95)
  await rows.nth(1).locator('.recipeRowOpen').press('ArrowLeft')
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
  const title = first.locator('.recipeRowOpen')
  await title.press('ArrowLeft')
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
  await expect(title).toBeFocused()
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await title.click({ button: 'right' })
  await expect(
    first.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(title).toBeFocused()
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
  await first.locator('.recipeRowOpen').press('Escape')
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
    await row.locator('.recipeRowOpen').press('ArrowLeft')
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
    await expect(
      page.getByRole('button', { name: 'Add recipe', exact: true }),
    ).toBeFocused()
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
    sheet.getByRole('button', { name: 'Back to add options' }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  await page.locator('.dialogBackdrop').click({ position: { x: 5, y: 5 } })
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
    await row.locator('.recipeRowOpen').press('ArrowLeft')
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

test('a rejected deletion restores the recipe and reports the failure', async ({
  page,
  kitchen,
}) => {
  kitchen.rejectSave = true
  await page.goto('./#recipes')
  const count = kitchen.state.recipes.length
  const row = page.locator('.libraryRow').first()
  await row.locator('.recipeRowOpen').press('ArrowLeft')
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete recipe', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Test save rejected')
  expect(kitchen.state.recipes).toHaveLength(count)
  await expect(row).toBeVisible()
})

test('a concurrent edit prevents deletion of a stale recipe', async ({
  page,
  kitchen,
}) => {
  await page.goto('./#recipes')
  const row = page.locator('.libraryRow').first()
  await row.locator('.recipeRowOpen').press('ArrowLeft')
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
