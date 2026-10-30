import { test, expect } from './fixtures/kitchen'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('AI drafts a new recipe into the form, refines it, and saves only after review', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()

  const describe = page.getByRole('textbox', {
    name: 'Describe a recipe to add',
  })
  await expect(describe).toBeVisible()
  await describe.fill('A cozy bean soup that reheats well')
  await describe.press('Enter')

  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Garlicky white bean & greens soup',
  )
  await expect(page.getByText('AI-drafted · not kitchen-tested')).toBeVisible()
  await expect(
    page.getByText('Review the quantities before cooking.'),
  ).toBeVisible()
  await expect(describe).toHaveCount(0)

  // Manual edits survive a refinement round.
  await page.getByLabel('Recipe name', { exact: true }).fill('Our bean soup')
  const refine = page.getByRole('textbox', { name: 'Change this recipe' })
  await refine.fill('Add something bright')
  await page.getByRole('button', { name: 'Update recipe' }).click()
  await expect(page.getByText('Added lemon for brightness.')).toBeVisible()
  await expect(refine).toHaveValue('')
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Our bean soup',
  )
  await expect(page.getByLabel('Ingredient 7', { exact: true })).toHaveValue(
    'lemon',
  )

  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])

  // Nothing is stored until the household confirms the review, and the
  // floating back button asks before discarding the draft.
  const back = page.getByRole('button', { name: 'Back to recipes' })
  await back.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep editing' })
    .click()
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Our bean soup',
  )
  await back.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Leave', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Add recipe' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Our bean soup', exact: true }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await page
    .getByRole('textbox', { name: 'Describe a recipe to add' })
    .fill('Bean soup')
  await page.getByRole('button', { name: 'Draft recipe' }).click()
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Garlicky white bean & greens soup',
  )
  await page
    .getByRole('checkbox', { name: /I reviewed this AI-drafted recipe/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()
  // The new recipe is tossed into the Recipes tab as it saves.
  await expect(page.locator('.deckGhost')).toHaveCount(1)
  await expect(page.locator('.deckGhost')).toHaveCount(0)
  const saved = page.getByRole('article').filter({
    hasText: 'Garlicky white bean & greens soup',
  })
  await expect(saved).toContainText('AI-DRAFTED')
  await saved
    .getByRole('button', {
      name: 'Garlicky white bean & greens soup',
      exact: true,
    })
    .click()
  await expect(page.getByRole('dialog')).toContainText('drafted with AI')
  // The card follows the shared unit preference: US kitchen by default.
  await expect(page.getByRole('dialog')).toContainText('1.77 lb white beans')
  await page
    .getByRole('dialog')
    .getByRole('group', { name: 'Recipe unit system' })
    .getByRole('button', { name: 'Metric' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('800 g white beans')
  await expect(page.getByRole('dialog')).toContainText('30 ml olive oil')
})

async function openRecipes(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
}

test('remixing highlights changes, can be undone, and saves as a reviewed new recipe', async ({
  page,
}) => {
  await openRecipes(page)
  await page
    .getByRole('button', { name: 'Lemony chickpea rice', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  const remix = dialog.getByRole('textbox', { name: 'Remix this recipe' })
  await expect(remix).toHaveAttribute(
    'placeholder',
    'I want to remix this recipe...',
  )
  await remix.fill('Make it spicier')
  await remix.press('Enter')

  await expect(dialog.getByText('Unsaved remix · AI-drafted')).toBeVisible()
  await expect(
    dialog.getByText('2 added · 1 removed · 1 changed'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Metric' }).click()
  await expect(dialog.locator('.chg-changed')).toContainText('750 g chickpeas')
  await expect(dialog.locator('.chg-changed')).toContainText('was 500 g')
  await expect(dialog.locator('.chg-added').first()).toContainText(
    'fresh herbs',
  )
  await expect(dialog.locator('.chg-removed')).toContainText('olive oil')
  await expect(dialog.getByText('Added for freshness.')).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Replace original' }),
  ).toBeVisible()

  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])

  await dialog.getByRole('button', { name: 'Undo last change' }).click()
  await expect(dialog.getByText('Unsaved remix · AI-drafted')).toHaveCount(0)
  await expect(dialog).toContainText('500 g chickpeas')

  await remix.fill('Make it spicier')
  await dialog.getByRole('button', { name: 'Remix recipe' }).click()
  // Saving a new remix goes straight to Recipes, no review form.
  await dialog.getByRole('button', { name: 'Save as new recipe' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.deckGhost')).toHaveCount(1)
  await expect(
    page.getByRole('heading', { name: 'Review your remix' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Lemony chickpea rice remix',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Lemony chickpea rice', exact: true }),
  ).toBeVisible()
})

test('closing an unsaved remix asks first', async ({ page }) => {
  await openRecipes(page)
  await page
    .getByRole('button', { name: 'Lemony chickpea rice', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('textbox', { name: 'Remix this recipe' })
    .fill('Swap the rice')
  await dialog.getByRole('button', { name: 'Remix recipe' }).click()
  await expect(dialog.getByText('Unsaved remix · AI-drafted')).toBeVisible()

  await dialog.getByRole('button', { name: 'Close recipe' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep editing' })
    .click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Unsaved remix · AI-drafted')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close recipe' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard' })
    .click()
  await expect(dialog).toHaveCount(0)
})

test('a remix can replace a household recipe after review', async ({
  page,
}) => {
  await openRecipes(page)
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('button', { name: /Add with AI/ }).click()
  await page
    .getByRole('textbox', { name: 'Describe a recipe to add' })
    .fill('Bean soup')
  await page.getByRole('button', { name: 'Draft recipe' }).click()
  await page
    .getByRole('checkbox', { name: /I reviewed this AI-drafted recipe/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()

  const soups = page.getByRole('button', {
    name: 'Garlicky white bean & greens soup',
    exact: true,
  })
  await soups.click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('textbox', { name: 'Remix this recipe' })
    .fill('Less oil')
  await dialog.getByRole('button', { name: 'Remix recipe' }).click()
  await dialog.getByRole('button', { name: 'Replace original' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Replace original' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Review your remix' }),
  ).toBeVisible()
  await page
    .getByRole('checkbox', { name: /I reviewed this AI-drafted recipe/ })
    .check()
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click()

  await expect(soups).toHaveCount(1)
  await soups.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Metric' }).click()
  await expect(page.getByRole('dialog')).toContainText('15 g fresh herbs')
  await expect(page.getByRole('dialog')).not.toContainText('200 g kale')
})

test('the full recipe card can pin a planned recipe and mark it loved', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start choosing recipes' }).click()
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: 'Appealing this week' }).click()
    await expect(page.getByText(`${i} liked`)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Build my week' }).click()

  const first = page.locator('.plannedRecipe').first()
  const title = await first.locator('.plannedRecipeCopy strong').innerText()
  await first.getByRole('button', { name: `View ${title}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: `Pin ${title}` }).click()
  // Pinning throws a little card into the Recipes tab, then cleans it up.
  await expect(page.locator('.deckGhost')).toHaveCount(1)
  await expect(page.locator('.deckGhost')).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: `Unpin ${title}` }),
  ).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'We loved this' }).click()
  await expect(dialog.getByRole('button', { name: 'Loved' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await dialog.getByRole('button', { name: 'Close recipe' }).click()

  await expect(
    first.getByRole('button', { name: `Unpin ${title}` }),
  ).toContainText('Unpin')
  await expect(first.getByRole('button', { name: 'Loved' })).toBeVisible()

  // Both are toggles: unpin from the row, un-love from the Recipes tab.
  await first.getByRole('button', { name: `Unpin ${title}` }).click()
  await expect(
    first.getByRole('button', { name: `Pin ${title}` }),
  ).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  const entry = page.getByRole('article').filter({
    has: page.getByRole('button', { name: title, exact: true }),
  })
  await entry.getByRole('button', { name: 'Loved' }).click()
  await expect(
    entry.getByRole('button', { name: 'We loved this' }),
  ).toHaveAttribute('aria-pressed', 'false')

  // Recipes opened outside the plan offer loved, not pin.
  await page.getByRole('button', { name: title, exact: true }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /^(Un)?[Pp]in / }),
  ).toHaveCount(0)
})

test('a remix saved from the plan takes its slot pinned, and cannot be pinned or loved before saving', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Plan', exact: true }).click()

  const first = page.locator('.plannedRecipe').first()
  const title = await first.locator('.plannedRecipeCopy strong').innerText()
  await first.getByRole('button', { name: `View ${title}` }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: `Pin ${title}` }),
  ).toBeVisible()
  await dialog
    .getByRole('textbox', { name: 'Remix this recipe' })
    .fill('More vegetables')
  await dialog.getByRole('button', { name: 'Remix recipe' }).click()
  await expect(dialog.getByText('Unsaved remix · AI-drafted')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Pin / })).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: 'We loved this' }),
  ).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Save as new recipe' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(first.locator('.plannedRecipeCopy strong')).toHaveText(
    `${title} remix`,
  )
  await expect(
    first.getByRole('button', { name: `Unpin ${title} remix` }),
  ).toHaveAttribute('aria-pressed', 'true')
  // Changed ingredients mean the grocery list needs confirming again.
  await expect(
    page.getByRole('button', { name: /Confirm & make grocery list/ }),
  ).toBeVisible()
})
