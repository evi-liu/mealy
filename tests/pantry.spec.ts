import { test, expect } from './fixtures/kitchen'
import type { Locator, Page } from '@playwright/test'
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
  await page.getByRole('group', { name, exact: true }).press('ArrowLeft')
  await page.getByRole('button', { name: `Remove ${name}` }).click()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(row.getByRole('checkbox')).not.toBeChecked()
  await expect(
    page.locator('.groceryItem').nth(1).getByRole('checkbox'),
  ).toBeChecked()

  // Only Plan can start a fresh week; it keeps the pantry.
  for (const tab of ['Groceries', 'Pantry', 'Recipes', 'Profile']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Start a fresh week' }),
    ).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
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
    .getByRole('group', { name: 'olive oil', exact: true })
    .press('ArrowLeft')
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

test('pantry removal is hidden until a left swipe and supports keyboard access', async ({
  page,
  kitchen,
}) => {
  kitchen.state.pantry = ['rice', 'soy sauce'].map((name) => ({
    id: name,
    name,
    kind: 'staple',
    amount: 1,
    unit: 'each',
  }))
  await page.setViewportSize({ width: 320, height: 600 })
  await page.goto('./#pantry')
  await expect(
    page.getByText(
      'Remove an ingredient when you run out so it returns to your grocery list.',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)
  const rows = page.locator('.pantryItem')
  const first = rows.first()
  async function swipe(row: Locator, dx: number, dy = 0, cancel = false) {
    const front = row.locator('.pantryRowFront')
    const box = (await front.boundingBox())!
    const x = box.x + 150
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
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
    await page.mouse.move(x + dx, y + dy, { steps: 10 })
    if (cancel) {
      const pointerId = await front.getAttribute('data-test-pointer-id')
      expect(pointerId).not.toBeNull()
      await front.dispatchEvent('pointercancel', {
        pointerId: Number(pointerId),
      })
    }
    await page.mouse.up()
  }
  await first.locator('.pantryRowFront').click()
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await swipe(first, -18)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await swipe(first, -70, 0, true)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await swipe(first, -5, 40)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('')
  await swipe(first, -70)
  await expect(first.getByRole('button', { name: 'Remove rice' })).toBeVisible()
  expect(kitchen.state.pantry).toHaveLength(2)
  await swipe(first, 70)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await swipe(first, -70)
  await swipe(rows.nth(1), -70)
  await expect(first).toHaveAttribute('data-revealed', 'false')
  await expect(rows.nth(1)).toHaveAttribute('data-revealed', 'true')
  await rows.nth(1).locator('.pantryRowFront').press('Escape')
  await expect(rows.nth(1).locator('.pantryRowFront')).toBeFocused()
  await first.locator('.pantryRowFront').press('ArrowLeft')
  const remove = first.getByRole('button', { name: 'Remove rice' })
  await expect(remove).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  kitchen.failSave = true
  await remove.click()
  await expect(page.getByRole('alert')).toContainText('Test save unavailable')
  expect(kitchen.state.pantry).toHaveLength(2)
  kitchen.failSave = false
  await first.locator('.pantryRowFront').press('ArrowLeft')
  await remove.click()
  await expect(rows).toHaveCount(1)
  await expect(
    page.getByRole('heading', { name: 'At home', exact: true }),
  ).toBeFocused()
})

test('pantry supports native touch swipes without blocking vertical scrolling', async ({
  page,
  kitchen,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Native touch injection uses Chromium CDP.',
  )
  kitchen.state.pantry = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    name: `ingredient ${i}`,
    kind: 'staple',
    amount: 1,
    unit: 'each',
  }))
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('./#pantry')
  const first = page.locator('.pantryItem').first()
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
      touchPoints: [{ x: x - step * 14, y }],
    })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(first).toHaveAttribute('data-revealed', 'true')
  await first.locator('.pantryRowFront').press('Escape')
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
  expect(kitchen.state.pantry).toHaveLength(20)
  await cdp.detach()
})
