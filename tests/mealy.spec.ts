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
test('finished swiping can build beyond legacy batch limits using only likes', async ({
  page,
  kitchen,
}) => {
  kitchen.state.phase = 'swipe'
  kitchen.state.recipes = kitchen.state.recipes
    .slice(0, 5)
    .map((recipe, index) => ({
      ...recipe,
      maxServings: index === 1 ? 8 : 4,
      leftovers: index < 2,
    }))
  kitchen.state.queue = kitchen.state.recipes.map((recipe) => recipe.id)
  kitchen.state.decisions = Object.fromEntries(
    kitchen.state.queue.map((id, index) => [id, index < 4 ? 'like' : 'skip']),
  )
  await page.goto('./#plan')
  await expect(page.getByText('4 liked · 0 to explore')).toBeVisible()
  const build = page.getByRole('button', { name: 'Build my week' })
  await expect(build).toBeEnabled()
  await build.click()
  await expect(page.locator('.plannedRecipe')).toHaveCount(2)
  expect(kitchen.state.plan.reduce((sum, slot) => sum + slot.servings, 0)).toBe(
    14,
  )
  expect(
    kitchen.state.plan.every(
      (slot) => kitchen.state.decisions[slot.recipeId] === 'like',
    ),
  ).toBe(true)
})

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
  await expect(page.getByRole('textbox', { name: 'Recipe link' })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await expect(page.getByRole('button', { name: /Add with AI/ })).toBeVisible()
  await page.getByRole('button', { name: /Link a website/ }).click()
  await expect(page.getByRole('textbox', { name: 'Recipe link' })).toBeVisible()
})
test('recipe plus opens an accessible choice sheet and hides in the editor', async ({
  page,
}) => {
  await page.goto('./#recipes')
  const add = page.getByRole('button', { name: 'Add recipe', exact: true })
  await expect(add).toBeVisible()
  const header = (await page
    .locator('.recipeLibrary .screenHeader')
    .boundingBox())!
  const initial = (await add.boundingBox())!
  expect(initial.y).toBeGreaterThanOrEqual(header.y)
  expect(initial.y + initial.height).toBeLessThanOrEqual(
    header.y + header.height,
  )
  expect(initial.height).toBeGreaterThanOrEqual(44)
  expect(initial.x + initial.width).toBeLessThanOrEqual(
    page.viewportSize()!.width - 16,
  )
  await add.click()
  const sheet = page.getByRole('dialog', { name: 'Add a recipe' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Add with AI/ })).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: /Link a website/ }),
  ).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(add).toBeFocused()
  await add.click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await expect(add).toHaveCount(0)
  await expect(page.getByLabel('Describe a recipe to add')).toBeFocused()
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Save recipe', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('dialog', { name: 'New recipe' })
    .getByRole('button', { name: 'Cancel' })
    .click()
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
  await page.getByRole('button', { name: 'Back to previous screen' }).click()
  const skip = page.getByRole('button', { name: 'Not this week', exact: true })
  await skip.focus()
  await page.keyboard.press('Enter')
  await like(page, 3)
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.locator('.mealList')).not.toContainText(firstTitle)
})
test('existing recipes remain editable with precise unit selections', async ({
  page,
  kitchen,
}) => {
  const original = kitchen.state.recipes[0]
  kitchen.state = initialState([
    {
      ...original,
      source: 'own',
      ingredients: [
        { name: 'rice', amount: 1, unit: 'cup', category: 'Pantry' },
      ],
    },
  ])
  await start(page)
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page
    .getByRole('button', { name: original.title, exact: true })
    .press('ArrowLeft')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Recipe name', { exact: true }).fill('Our rice')
  await page.getByLabel('Makes (servings)').fill('4')
  await expect(page.getByLabel('Max batch servings')).toHaveCount(0)
  await page.getByLabel('Total minutes').fill('25')
  await page.getByLabel('Main protein / variety').fill('Beans')
  await page.getByLabel('Ingredient 1', { exact: true }).fill('rice')
  await page.getByLabel('Amount', { exact: true }).fill('2')
  await page
    .getByRole('combobox', { name: 'Unit', exact: true })
    .selectOption('cup')
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption('Pantry')
  await page
    .getByLabel('Instructions (one step per line)')
    .fill('Cook the rice using your usual method.')
  await page
    .getByRole('checkbox', { name: /These are my own recipe details/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  expect(kitchen.state.recipes).toHaveLength(1)
  // An untouched AI composer goes straight back without asking.
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await page
    .getByRole('dialog', { name: 'New recipe' })
    .getByRole('button', { name: 'Cancel' })
    .click()
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

test('importing a link opens Add recipe filled in by AI, never fetching from the browser', async ({
  page,
}) => {
  const requestedSources: string[] = []
  page.on('request', (request) => {
    if (/thewoksoflife|tiffycooks|example\.com/.test(request.url()))
      requestedSources.push(request.url())
  })
  await start(page)
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add recipe', exact: true }).click()
  await page.getByRole('button', { name: /Link a website/ }).click()
  const link = page.getByRole('textbox', { name: 'Recipe link' })
  await link.fill('not a link')
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(link).toBeFocused()
  await link.fill('https://www.example.com/great-soup/')
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Garlicky white bean & greens soup',
  )
  await expect(
    page.getByLabel('Source reference (optional HTTPS link)'),
  ).toHaveValue('https://www.example.com/great-soup/')
  await expect(
    page.getByText('Not kitchen-tested', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'AI-assisted recipe' }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Instructions (one step per line)'),
  ).not.toHaveValue('')
  // The server reads pages; the browser never contacts the recipe site.
  expect(requestedSources).toEqual([])
})
