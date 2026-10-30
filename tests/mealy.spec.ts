import { test, expect } from './fixtures/kitchen'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { initialState } from '../src/domain'

async function start(page: Page) {
  await page.goto('./')
}
async function like(page: Page, count: number) {
  for (let i = 0; i < count; i++)
    await page.getByRole('button', { name: 'Appealing this week' }).click()
}
test('empty recipe library keeps setup compact and recipe entry accessible', async ({
  page,
  kitchen,
}) => {
  kitchen.state = initialState([])
  await start(page)
  await expect(
    page.getByRole('heading', { name: 'Plan your week' }),
  ).toBeVisible()
  await expect(page.getByText('Your kitchen starts here')).toHaveCount(0)
  await expect(
    page.getByText(/Nothing in your live household is demo/),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Start choosing recipes' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add recipe' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save link bookmark' }),
  ).toBeVisible()
})
test('recipe add action floats above navigation and hides in the editor', async ({
  page,
}) => {
  await page.goto('./#recipes')
  const add = page.getByRole('button', { name: 'Add recipe', exact: true })
  await expect(add).toBeVisible()
  const header = (await page
    .locator('.recipeLibrary .screenHeader')
    .boundingBox())!
  const first = (await page.locator('.recipeEntry').first().boundingBox())!
  expect(first.y - header.y - header.height).toBeGreaterThanOrEqual(12)
  expect(first.y - header.y - header.height).toBeLessThanOrEqual(20)
  const initial = (await add.boundingBox())!
  const nav = (await page
    .getByRole('navigation', { name: 'Main navigation' })
    .boundingBox())!
  expect(initial.y + initial.height).toBeLessThan(nav.y)
  expect(initial.height).toBeGreaterThanOrEqual(44)
  expect(initial.x + initial.width).toBeLessThanOrEqual(
    page.viewportSize()!.width - 16,
  )
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const scrolled = (await add.boundingBox())!
  expect(scrolled.y).toBeCloseTo(initial.y, 0)
  const lastControl = (await page
    .getByRole('button', { name: 'Save link bookmark' })
    .boundingBox())!
  expect(lastControl.y + lastControl.height).toBeLessThan(scrolled.y)
  await add.click()
  await expect(add).toHaveCount(0)
  await expect(page.getByLabel('Recipe name', { exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(add).toBeVisible()
  await page.getByRole('button', { name: 'Pantry', exact: true }).click()
  await expect(add).toHaveCount(0)
})
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
  await item.click()
  await expect(item).toBeChecked()
  await page.reload()
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
  await page.getByRole('button', { name: 'Add recipe' }).click()
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
  // An untouched form goes straight back without asking.
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: 'Back to recipes' }).click()
  await expect(page.getByRole('button', { name: 'Add recipe' })).toBeVisible()
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
// Dispatches a timed pointer gesture inside the page so release velocity is
// measured from realistic event timestamps.
async function gesture(
  page: Page,
  options: {
    id: number
    from: number
    to: number
    moves: number
    pauseBeforeUp?: number
    cancel?: boolean
  },
) {
  return page.evaluate(async (o) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const card = document.querySelector('.recipeCard')!
    const y = card.getBoundingClientRect().top + 120
    const send = (type: string, x: number) =>
      card.dispatchEvent(
        new PointerEvent(type, {
          pointerId: o.id,
          isPrimary: true,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      )
    send('pointerdown', o.from)
    for (let i = 1; i <= o.moves; i++) {
      await sleep(16)
      send('pointermove', o.from + ((o.to - o.from) * i) / o.moves)
    }
    await sleep(o.pauseBeforeUp ?? 0)
    const held = {
      phase: (document.querySelector('.cardStage') as HTMLElement).dataset
        .phase,
      like: Number(
        getComputedStyle(document.querySelector('.dropTarget.like')!).opacity,
      ),
    }
    send(o.cancel ? 'pointercancel' : 'pointerup', o.to)
    return held
  }, options)
}

test('dragging shows drop targets; throws commit, pauses and cancels return', async ({
  page,
}) => {
  await start(page)
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  const card = page.locator('.recipeCard')
  const stage = page.locator('.cardStage')
  const first = await card.locator('h2').innerText()
  const width = page.viewportSize()!.width
  const center = width / 2

  const held = await gesture(page, {
    id: 7,
    from: center - 40,
    to: center + 40,
    moves: 4,
    pauseBeforeUp: 250,
    cancel: true,
  })
  expect(held.phase).toBe('held')
  expect(held.like).toBeGreaterThan(0)
  await expect(stage).toHaveAttribute('data-phase', 'idle')
  await expect
    .poll(() => card.evaluate((el) => (el as HTMLElement).style.transform))
    .toBe('')
  await expect(card.locator('h2')).toHaveText(first)

  // Dragged well right but stopped before letting go: no momentum, no vote.
  await gesture(page, {
    id: 8,
    from: center - 60,
    to: center + 70,
    moves: 8,
    pauseBeforeUp: 250,
  })
  await expect(stage).toHaveAttribute('data-phase', 'idle')
  await expect(card.locator('h2')).toHaveText(first)
  await expect(page.getByText(/0 liked/)).toBeVisible()

  // A quick throw carries the card to the like side.
  await gesture(page, { id: 9, from: center - 40, to: center + 40, moves: 4 })
  await expect(page.getByText(/1 liked/)).toBeVisible()
  await expect(card.locator('h2')).not.toHaveText(first)

  // A slow drag released over the skip target counts without momentum.
  await gesture(page, {
    id: 10,
    from: center,
    to: 20,
    moves: 20,
    pauseBeforeUp: 250,
  })
  await expect(page.getByText(/1 liked · 8 to explore/)).toBeVisible()
  await expect(stage).toHaveAttribute('data-phase', 'idle')
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
  // Source-attributed manual entry is the household's own details, not AI.
  await expect(
    page.getByRole('textbox', { name: 'Describe a recipe to add' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  await like(page, 3)
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.locator('.mealList')).not.toContainText(
    'A noodle recipe to try',
  )
})
