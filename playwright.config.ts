import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4175/mealy/',
    trace: 'retain-on-failure',
    // Service-worker requests bypass Playwright's isolated backend routes.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    // Firefox has no mobile emulation; check it at a phone-sized viewport.
    {
      name: 'firefox-phone',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/mealy/',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://mealy-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
  },
})
