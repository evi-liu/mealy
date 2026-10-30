import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('AI drafts a new recipe into the form, refines it, and saves only after review', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByRole('button', { name: 'Add your recipe' }).click()

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
    page.getByText(/Demo mode: this is a canned example/),
  ).toBeVisible()
  await expect(describe).toHaveCount(0)

  // Manual edits survive a refinement round.
  await page.getByLabel('Recipe name', { exact: true }).fill('Our bean soup')
  const refine = page.getByRole('textbox', { name: 'Change this recipe' })
  await refine.fill('Add something bright')
  await page.getByRole('button', { name: 'Update recipe' }).click()
  await expect(
    page.getByText(/added a lemon as an example change/),
  ).toBeVisible()
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

  // Nothing is stored until the household confirms the review.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Our bean soup', exact: true }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Add your recipe' }).click()
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
  const saved = page.getByRole('article').filter({
    hasText: 'Garlicky white bean & greens soup',
  })
  await expect(saved).toContainText('AI-DRAFTED')
  await saved
    .getByRole('button', { name: 'Garlicky white bean & greens soup' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('drafted with AI')
  await expect(page.getByRole('dialog')).toContainText('800 g white beans')
})
