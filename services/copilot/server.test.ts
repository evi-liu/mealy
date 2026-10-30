import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createGateway,
  ServiceError,
  type Generate,
  type GenerateRequest,
} from './server.js'
import { createGenerator, restrictedSession } from './runtime.js'
import type { SessionConfig } from '@github/copilot-sdk'

const config = {
  token: 'test-only-not-a-real-secret-1234567890',
  householdId: '10000000-0000-4000-8000-000000000001',
}
const request: GenerateRequest = {
  householdId: config.householdId,
  task: 'recipe_draft',
  instructions: 'Draft a recipe.',
  input: '{"instruction":"Beans"}',
  schema: { type: 'object', properties: {}, additionalProperties: false },
}

test('startup refuses missing credentials without borrowing a local login', () => {
  const result = spawnSync(
    process.execPath,
    [new URL('./index.js', import.meta.url).pathname],
    {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 10000,
    },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Configure COPILOT_GITHUB_TOKEN/)
})

test('setup rejects piped credentials without echoing them', () => {
  const secret = 'github_pat_test_fixture_not_a_real_credential'
  const result = spawnSync(
    'bash',
    [fileURLToPath(new URL('../configure.sh', import.meta.url))],
    {
      input: `test-user\n${secret}\n`,
      encoding: 'utf8',
      timeout: 10000,
    },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /interactive terminal/)
  assert(!`${result.stdout}${result.stderr}`.includes(secret))
})

async function setup(generate: Generate, run: (url: string) => Promise<void>) {
  const server = createGateway(config, generate)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address !== 'string')
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
function post(url: string, body: unknown = request, token = config.token) {
  return fetch(`${url}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

test('requires a secret, authorized household and bounded request before model use', async () => {
  let calls = 0
  await setup(
    async () => {
      calls++
      return '{}'
    },
    async (url) => {
      assert.equal((await fetch(`${url}/health`)).status, 200)
      assert.equal((await post(url, request, 'wrong')).status, 401)
      assert.equal(
        (
          await post(url, {
            ...request,
            householdId: '10000000-0000-4000-8000-000000000002',
          })
        ).status,
        403,
      )
      assert.equal((await post(url, { ...request, task: 'shell' })).status, 400)
      assert.equal(
        (await post(url, { ...request, input: 'x'.repeat(260000) })).status,
        413,
      )
      assert.equal(calls, 0)
      const response = await post(url)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
      assert.deepEqual(await response.json(), { text: '{}' })
      assert.equal(calls, 1)
    },
  )
})

test('rejects invalid output and does not expose raw provider errors', async () => {
  await setup(
    async () => {
      throw new Error('secret-provider-detail')
    },
    async (url) => {
      const response = await post(url)
      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), { error: 'unavailable' })
    },
  )
  await setup(
    async () => 'not JSON',
    async (url) => {
      assert.deepEqual(await (await post(url)).json(), {
        error: 'invalid_output',
      })
    },
  )
  await setup(
    async () => {
      throw new ServiceError('timeout')
    },
    async (url) => {
      assert.equal((await post(url)).status, 504)
    },
  )
})

test('caps concurrent requests without launching another model call', async () => {
  let started = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let bothStarted!: () => void
  const ready = new Promise<void>((resolve) => {
    bothStarted = resolve
  })
  await setup(
    async () => {
      if (++started === 2) bothStarted()
      await pending
      return '{}'
    },
    async (url) => {
      const first = post(url)
      const second = post(url)
      await ready
      try {
        assert.equal((await post(url)).status, 429)
        assert.equal(started, 2)
      } finally {
        release()
        await Promise.all([first, second])
      }
    },
  )
})

test('SDK request uses structured output, no tools, and deletes each session', async () => {
  const configs: SessionConfig[] = []
  const deleted: string[] = []
  let count = 0
  const generate = createGenerator(
    {
      async createSession(options) {
        configs.push(options)
        return {
          sessionId: String(++count),
          async sendAndWait(message, timeout) {
            assert.equal(message.prompt, request.input)
            assert.deepEqual(message.responseSchema, request.schema)
            assert.equal(timeout, 40000)
            return { data: { content: '{}' } }
          },
          async abort() {},
        }
      },
      async deleteSession(id) {
        deleted.push(id)
      },
    },
    'test-model',
  )
  await generate(request, new AbortController().signal)
  await generate(request, new AbortController().signal)
  assert.deepEqual(deleted, ['1', '2'])
  assert.equal(configs[0].model, 'test-model')
  assert.deepEqual(configs[0].availableTools, [])
  assert.equal(configs[0].enableSkills, false)
  assert.equal(configs[0].enableSessionStore, false)
  assert.equal(configs[0].systemMessage?.mode, 'replace')
  assert(restrictedSession.onPermissionRequest)
})

test('timeouts abort and clean up rather than silently retrying', async () => {
  const actions: string[] = []
  const generate = createGenerator(
    {
      async createSession() {
        return {
          sessionId: 'one',
          async sendAndWait() {
            throw new ServiceError('timeout')
          },
          async abort() {
            actions.push('abort')
          },
        }
      },
      async deleteSession() {
        actions.push('delete')
      },
    },
    'test-model',
  )
  await assert.rejects(
    generate(request, new AbortController().signal),
    /timeout/,
  )
  assert.deepEqual(actions, ['abort', 'delete'])
})
