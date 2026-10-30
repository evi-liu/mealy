import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CopilotClient } from '@github/copilot-sdk'

/** Separate runtime state and explicit authentication; never borrow a CLI login. */
export async function createConnection(token: string) {
  const directory = await mkdtemp(join(tmpdir(), 'mealy-copilot-'))
  const client = new CopilotClient({
    mode: 'empty',
    gitHubToken: token,
    useLoggedInUser: false,
    workingDirectory: directory,
    baseDirectory: directory,
    logLevel: 'none',
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      COPILOT_GITHUB_TELEMETRY_DISABLED: 'true',
    },
  })
  return {
    client,
    async dispose() {
      const errors = await client.stop()
      // Only remove the unique directory owned by this runtime.
      await rm(directory, { recursive: true, force: true })
      if (errors.length) throw new Error('Copilot runtime shutdown failed.')
    },
  }
}
