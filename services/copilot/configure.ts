import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { createConnection } from './connection.js'

class SetupError extends Error {}

async function configure() {
  const token = process.env.COPILOT_GITHUB_TOKEN ?? ''
  const expectedLogin = process.env.COPILOT_EXPECTED_LOGIN?.trim() ?? ''
  if (
    !/^github_pat_[A-Za-z0-9_]+$/.test(token) ||
    !/^[a-z0-9-]+$/i.test(expectedLogin)
  )
    throw new SetupError(
      'Use the interactive setup with a GitHub username and fine-grained token.',
    )
  const { client, dispose } = await createConnection(token)
  let models: string[]
  try {
    console.log(
      'Checking account identity and model availability; no generation request...',
    )
    await client.start()
    const auth = await client.getAuthStatus()
    if (
      !auth.isAuthenticated ||
      auth.login?.toLowerCase() !== expectedLogin.toLowerCase()
    )
      throw new SetupError(
        'Authentication failed or the token belongs to a different GitHub username. Nothing was saved.',
      )
    models = (await client.listModels()).map((model) => model.id).sort()
    if (!models.length)
      throw new SetupError(
        'No Copilot models are available to this account. Nothing was saved.',
      )
    console.log(`Verified GitHub identity: ${auth.login}`)
  } finally {
    await dispose()
  }
  console.log(`Available model IDs:\n${models.join('\n')}`)
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  let model: string
  try {
    model = (
      await terminal.question(
        'Model ID to configure (exact ID from the list): ',
      )
    ).trim()
  } finally {
    terminal.close()
  }
  if (!models.includes(model) || /[\r\n]/.test(model))
    throw new SetupError(
      'That model ID was not in the account list. Nothing was saved.',
    )
  const contents = [
    `COPILOT_GITHUB_TOKEN=${token}`,
    `COPILOT_EXPECTED_LOGIN=${expectedLogin}`,
    `COPILOT_MODEL=${JSON.stringify(model)}`,
    `MEALY_GATEWAY_TOKEN=${randomBytes(32).toString('base64url')}`,
    'MEALY_HOUSEHOLD_ID=',
    'HOST=127.0.0.1',
    'PORT=8787',
    '',
  ].join('\n')
  await writeFile(new URL('../.env', import.meta.url), contents, {
    flag: 'wx',
    mode: 0o600,
  })
  console.log('Saved private configuration to .env (owner read/write only).')
  console.log(
    'Household ID and shared-use policy approval are still required before running the service.',
  )
  console.log(
    'No recipe was generated. Supabase and production were not changed.',
  )
}

void configure().catch((error) => {
  console.error(
    error instanceof SetupError
      ? error.message
      : 'Setup failed. Check Copilot Requests permission, account policy, runtime availability, and whether .env already exists. Raw errors are hidden to protect credentials.',
  )
  process.exitCode = 1
})
