import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function start(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try the demo' }).click()
}
async function like(page: Page, count: number) {
  for (let i = 0; i < count; i++)
    await page.getByRole('button', { name: 'Appealing this week' }).click()
}
test('setup, shortlist, plan, pantry and durable grocery checks', async ({
  page,
}) => {
  await start(page)
  await expect(
    page.getByRole('switch', { name: /Cooking for Kairos/ }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('switch', { name: /Traveling this week/ }),
  ).not.toBeChecked()
  await expect(page.getByText('14 home servings')).toBeVisible()
  await page.getByRole('switch', { name: /Traveling this week/ }).click()
  await page.getByRole('button', { name: 'Away Mon' }).click()
  await page.getByRole('button', { name: 'Away Sat' }).click()
  await expect(page.getByText('12 home servings')).toBeVisible()
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  await page.getByRole('button', { name: 'Not this week', exact: true }).click()
  await like(page, 4)
  await expect(
    page.getByRole('heading', { name: 'What sounds good?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.locator('.plannedRecipe')).toHaveCount(2)
  await expect(page.locator('.plannedRecipe .recipeThumb')).toHaveCount(2)
  for (const row of await page.locator('.plannedRecipe').all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(150)
  }
  await expect(page.locator('.summaryBanner')).toContainText('8 lunch servings')
  const pin = page.getByRole('button', { name: /^Pin / }).first()
  await pin.click()
  await expect(
    page.getByRole('button', { name: /^Unpin / }).first(),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.planScreen select')).toHaveCount(0)
  await expect(page.getByText('Your lunches start at dinner.')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'We cooked this' }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'We loved this' })).toHaveCount(
    2,
  )
  await page
    .getByRole('button', { name: 'Confirm & make grocery list' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Groceries', exact: true }),
  ).toBeVisible()
  const item = page.locator('.groceryItem input').first()
  await item.check()
  await page.reload()
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.locator('.groceryItem input').first()).toBeChecked()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Add pantry ingredient' })
    .fill('olive oil')
  await expect(page.getByRole('combobox', { name: 'Track as' })).toHaveCount(0)
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add pantry ingredient' }).click()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(page.getByText(/staple on hand: check quantity/)).toBeVisible()
  await expect(
    page
      .locator('.groceryItem')
      .filter({ hasText: 'olive oil' })
      .getByRole('checkbox'),
  ).not.toBeChecked()
})
test('swiping honors skips, undo, keyboard controls and recipe details', async ({
  page,
}) => {
  await start(page)
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  const firstTitle = await page.locator('.recipeCard h2').innerText()
  await page.getByRole('button', { name: 'Not this week', exact: true }).click()
  await page.getByRole('button', { name: 'Undo last choice' }).click()
  await expect(page.locator('.recipeCard h2')).toHaveText(firstTitle)
  await page.getByRole('button', { name: 'Recipe details' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close recipe' }).click()
  const skip = page.getByRole('button', { name: 'Not this week', exact: true })
  await skip.focus()
  await page.keyboard.press('Enter')
  await like(page, 3)
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.locator('.mealList')).not.toContainText(firstTitle)
})
test('adds an actual recipe with precise unit selections', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add your recipe' }).click()
  await page.getByLabel('Recipe name', { exact: true }).fill('Our rice')
  await page.getByLabel('Main protein / variety').fill('Beans')
  await page.getByLabel('Ingredient 1', { exact: true }).fill('rice')
  await page.getByLabel('Amount', { exact: true }).fill('2')
  await page
    .getByRole('combobox', { name: 'Unit', exact: true })
    .selectOption('cup')
  await page
    .getByLabel('Instructions (one step per line)')
    .fill('Cook the rice using your usual method.')
  await page
    .getByRole('checkbox', { name: /These are my own recipe details/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  await page.getByRole('button', { name: 'Our rice', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2 cup rice')
})
test('no overlap or horizontal overflow with expanded travel at narrow widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await start(page)
  await page.getByRole('switch', { name: /Traveling this week/ }).click()
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    await page.getByRole('button', { name: `Away ${day}` }).click()
  await expect(page.getByText('4 home servings')).toBeVisible()
  await page
    .getByRole('button', { name: 'Start choosing recipes' })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('button', { name: 'Start choosing recipes' }),
  ).toBeInViewport()
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    pickerBottom: document.querySelector('.travelDays')!.getBoundingClientRect()
      .bottom,
    footerTop: document.querySelector('.setupFooter')!.getBoundingClientRect()
      .top,
    ctaBottom: document
      .querySelector('.setupFooter button')!
      .getBoundingClientRect().bottom,
    navTop: document.querySelector('.bottomNav')!.getBoundingClientRect().top,
  }))
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.footerTop).toBeGreaterThanOrEqual(dimensions.pickerBottom)
  expect(dimensions.ctaBottom).toBeLessThanOrEqual(dimensions.navTop)
})

test('key mobile screens meet automated WCAG AA checks', async ({ page }) => {
  await start(page)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await like(page, 3)
  await page.getByRole('button', { name: 'Build my week' }).click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page
    .getByRole('button', { name: 'Confirm & make grocery list' })
    .click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
})
test('touch-like pointer swipe and cancellation do not double vote', async ({
  page,
}) => {
  await start(page)
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  const card = page.locator('.recipeCard')
  const first = await card.locator('h2').innerText()
  await card.dispatchEvent('pointerdown', {
    pointerId: 7,
    isPrimary: true,
    clientX: 100,
    clientY: 200,
  })

  await card.dispatchEvent('pointercancel', { pointerId: 7 })
  await card.dispatchEvent('pointerup', {
    pointerId: 7,
    clientX: 240,
    clientY: 205,
  })
  await expect(card.locator('h2')).toHaveText(first)
  await card.dispatchEvent('pointerdown', {
    pointerId: 8,
    isPrimary: true,
    clientX: 100,
    clientY: 200,
  })
  await card.dispatchEvent('pointerup', {
    pointerId: 8,
    clientX: 240,
    clientY: 205,
  })
  await expect(page.getByText(/1 liked/)).toBeVisible()
})

test('trusted-source links stay bookmarks until reviewed manual details exist', async ({
  page,
}) => {
  const requestedSources: string[] = []
  page.on('request', (request) => {
    if (/thewoksoflife|tiffycooks/.test(request.url()))
      requestedSources.push(request.url())
  })
  await start(page)
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'The Woks of Life', exact: true }),
  ).toHaveAttribute('href', 'https://thewoksoflife.com/')
  await expect(
    page.getByRole('link', { name: 'Tiffy Cooks', exact: true }),
  ).toHaveAttribute('href', 'https://tiffycooks.com/')
  await page.getByLabel('Your label').fill('A noodle recipe to try')
  await page
    .getByLabel('Recipe link', { exact: true })
    .fill('https://thewoksoflife.com/example-recipe/')
  await page.getByRole('button', { name: 'Save link bookmark' }).click()
  await expect(page.getByRole('status')).toContainText(
    'No recipe details were imported',
  )
  await page
    .getByRole('button', { name: 'Enter my own recipe details' })
    .click()
  await expect(page.getByLabel('Makes (servings)')).toHaveValue('')
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Total minutes')).toHaveValue('')
  await expect(
    page.getByLabel('Source reference (optional HTTPS link)'),
  ).toHaveValue('https://thewoksoflife.com/example-recipe/')
  expect(requestedSources).toEqual([])
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  await like(page, 3)
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.locator('.mealList')).not.toContainText(
    'A noodle recipe to try',
  )
})

test('production PWA has scoped assets, hash routing and an offline public shell', async ({
  page,
  context,
}) => {
  await page.goto('./#recipes')
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!
    return await (await fetch(link.href)).json()
  })
  expect(manifest.scope).toBe('/mealy/')
  expect(manifest.start_url).toBe('/mealy/')
  for (const icon of manifest.icons) {
    const response = await page.request.get(`./${icon.src}`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(
    page.getByRole('heading', { name: 'Kitchen favorites' }),
  ).toBeVisible()
  const caches = await page.evaluate(async () => {
    const urls: string[] = []
    for (const key of await window.caches.keys()) {
      for (const request of await (await window.caches.open(key)).keys())
        urls.push(request.url)
    }
    return urls
  })
  expect(
    caches.every((url) => new URL(url).pathname.startsWith('/mealy/')),
  ).toBe(true)
  expect(caches.some((url) => /supabase|auth|recipe-images/.test(url))).toBe(
    false,
  )
})
