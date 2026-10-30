import { createConnection } from './connection.js'
import { createGateway } from './server.js'
import { createGenerator } from './runtime.js'
import { IdentityError, verifyIdentity } from './auth.js'

class ConfigurationError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value)
    throw new ConfigurationError(
      `Configure ${name} before starting the service.`,
    )
  return value
}

async function main() {
  const token = required('COPILOT_GITHUB_TOKEN')
  const login = required('COPILOT_EXPECTED_LOGIN')
  const model = required('COPILOT_MODEL')
  const gatewayToken = required('MEALY_GATEWAY_TOKEN')
  const householdId = required('MEALY_HOUSEHOLD_ID')
  const port = Number(process.env.PORT ?? '8787')
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigurationError('Invalid PORT.')
  const { client, dispose } = await createConnection(token)
  let server: ReturnType<typeof createGateway> | undefined
  let stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    server?.close()
    await dispose()
  }
  try {
    await client.start()
    await verifyIdentity(token, login, client)
    if (
      !(await client.listModels()).some((available) => available.id === model)
    )
      throw new ConfigurationError(
        'COPILOT_MODEL is not available to the configured account.',
      )
    server = createGateway(
      { token: gatewayToken, householdId },
      createGenerator(client, model),
    )
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(port, process.env.HOST ?? '127.0.0.1', resolve)
    })
    console.log(`Mealy Copilot service listening on port ${port}`)
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void stop().catch(() => {
          console.error('Copilot service shutdown failed')
          process.exitCode = 1
        })
      })
    }
  } catch (error) {
    await stop()
    throw error
  }
}

void main().catch((error) => {
  console.error(
    error instanceof ConfigurationError || error instanceof IdentityError
      ? error.message
      : 'Copilot service could not start. Check gateway configuration, account access, usage limits, and installed runtime.',
  )
  process.exitCode = 1
})
