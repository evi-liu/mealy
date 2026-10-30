import { test, expect } from '@playwright/test'

// Check the public shell without the authenticated mock backend.
test.use({ serviceWorkers: 'allow' })

test('production PWA has scoped assets, hash routing and an offline public shell', async ({
  page,
  context,
}) => {
  await page.goto('./#recipes')
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
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
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Kitchen favorites' }),
  ).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('#recipes')
  const caches = await page.evaluate(async () => {
    const urls: string[] = []
    for (const key of await window.caches.keys()) {
      for (const request of await (await window.caches.open(key)).keys())
        urls.push(request.url)
    }
    return urls
  })
  expect(caches.length).toBeGreaterThan(0)
  expect(
    caches.every((url) => new URL(url).pathname.startsWith('/mealy/')),
  ).toBe(true)
  expect(caches.some((url) => /supabase|auth|recipe-images/.test(url))).toBe(
    false,
  )
})
