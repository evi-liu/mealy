import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyIdentity } from './auth.js'

const client = {
  getAuthStatus: async () => ({ isAuthenticated: true }),
}
const token = 'github_pat_test_fixture_not_a_real_credential'
const request: typeof fetch = async (url, options) => {
  assert.equal(url, 'https://api.github.com/user')
  assert.equal(
    new Headers(options?.headers).get('Authorization'),
    `Bearer ${token}`,
  )
  assert.equal(options?.redirect, 'error')
  return Response.json({ login: 'test-user' })
}

test('verifies the explicit token owner when SDK omits its optional login', async () => {
  assert.equal(
    await verifyIdentity(token, 'TEST-user', client, request),
    'test-user',
  )
})

test('rejects mismatched token owners before checking Copilot', async () => {
  await assert.rejects(
    verifyIdentity(
      token,
      'another-user',
      {
        getAuthStatus: async () =>
          assert.fail('must not check another account'),
      },
      request,
    ),
    /token owner does not match/,
  )
})

test('distinguishes Copilot authentication failures and conflicting identities', async () => {
  await assert.rejects(
    verifyIdentity(
      token,
      'test-user',
      {
        getAuthStatus: async () => ({ isAuthenticated: false }),
      },
      request,
    ),
    /GitHub identity matched, but Copilot reports unauthenticated/,
  )
  await assert.rejects(
    verifyIdentity(
      token,
      'test-user',
      {
        getAuthStatus: async () => ({
          isAuthenticated: true,
          login: 'another-user',
        }),
      },
      request,
    ),
    /different identity/,
  )
})

test('identity lookup failures never expose response bodies or raw errors', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      verifyIdentity(
        token,
        'test-user',
        client,
        async () => new Response(token, { status }),
      ),
      (error: Error) => {
        assert(!error.message.includes(token))
        assert.match(
          error.message,
          status === 401 ? /rejected the token/ : new RegExp(`HTTP ${status}`),
        )
        return true
      },
    )
  }
  await assert.rejects(
    verifyIdentity(token, 'test-user', client, async () => {
      throw new Error(token)
    }),
    /^Error: Could not reach GitHub to verify the token owner\.$/,
  )
})

test('rejects missing identity even if the SDK claims authentication', async () => {
  await assert.rejects(
    verifyIdentity(token, 'test-user', client, async () => Response.json({})),
    /did not return a valid username/,
  )
})
