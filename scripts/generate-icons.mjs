import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const svg = await readFile(
    new URL('../public/icon.svg', import.meta.url),
    'utf8',
  )
  for (const [file, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
    ['icon-maskable.png', 512],
  ]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>body{margin:0;background:#f7f1e7}svg{display:block;width:100%;height:100%}</style>${svg}`,
    )
    await page.screenshot({
      path: new URL(`../public/${file}`, import.meta.url).pathname,
    })
  }
} finally {
  await browser.close()
}
