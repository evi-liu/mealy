import { test as base, expect } from '@playwright/test'
import { initialState, stateSchema, type State } from '../../src/domain'
import { fixtureRecipes } from './recipes'
import { mockDraft } from './recipe-ai'

const household = '10000000-0000-0000-0000-000000000001'
export const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4175',
  'access-control-allow-headers':
    'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const user = {
  id: '20000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.test',
  app_metadata: { provider: 'google' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}
type Kitchen = {
  state: State
  version: number
  authorized: boolean
  failSave: boolean
  aiRequests: number
}

export const test = base.extend<{ kitchen: Kitchen }>({
  kitchen: [
    async ({ page }, use) => {
      const kitchen: Kitchen = {
        state: initialState(structuredClone(fixtureRecipes)),
        version: 0,
        authorized: true,
        failSave: false,
        aiRequests: 0,
      }
      // Every non-local request is intercepted; tests cannot touch production.
      await page.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.origin === 'http://127.0.0.1:4175') return route.continue()
        if (url.origin !== 'https://mealy-test.supabase.co')
          throw new Error(
            `Unexpected external request in browser test: ${url.origin}${url.pathname}`,
          )
        const json = (body: unknown, status = 200) =>
          route.fulfill({
            status,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify(body),
          })
        if (request.method() === 'OPTIONS') return json({})
        if (url.pathname === '/auth/v1/token')
          return json({
            access_token: `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.token`,
            refresh_token: 'test-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            user,
          })
        if (url.pathname === '/auth/v1/user') return json(user)
        if (url.pathname === '/auth/v1/logout') {
          return json({})
        }
        if (url.pathname === '/rest/v1/rpc/my_household')
          return json(kitchen.authorized ? household : null)
        if (url.pathname === '/rest/v1/household_state')
          return json({ data: kitchen.state, version: kitchen.version })
        if (url.pathname === '/rest/v1/catalog_recipes') return json([])
        if (url.pathname === '/rest/v1/rpc/save_household') {
          if (kitchen.failSave)
            return json({ message: 'Test save unavailable' }, 503)
          const body = request.postDataJSON()
          if (body.p_version !== kitchen.version)
            return json(
              { code: '40001', message: 'Household changed; reload' },
              409,
            )
          kitchen.state = stateSchema.parse(body.p_data)
          return json(++kitchen.version)
        }
        if (url.pathname === '/functions/v1/recipe-draft') {
          kitchen.aiRequests++
          const body = request.postDataJSON()
          const original = kitchen.state.recipes.find(
            (r) => r.id === body.recipeId,
          )
          return json(mockDraft(body.base, original))
        }
        throw new Error(`Unhandled mock Supabase endpoint: ${url.pathname}`)
      })
      await page.addInitScript(
        ({ user }) => {
          if (!sessionStorage.getItem('test-session-initialized')) {
            sessionStorage.setItem('test-session-initialized', 'true')
            localStorage.setItem(
              'sb-mealy-test-auth-token',
              JSON.stringify({
                access_token: `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.token`,
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                expires_in: 3600,
                token_type: 'bearer',
                user,
              }),
            )
          }
        },
        { user },
      )
      await use(kitchen)
    },
    { auto: true },
  ],
})

export { expect }
