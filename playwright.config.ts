import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4175/mealy/', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/mealy/',
    reuseExistingServer: false,
  },
})
