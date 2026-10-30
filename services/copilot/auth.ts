import type { CopilotClient } from '@github/copilot-sdk'

export class IdentityError extends Error {}

export async function verifyIdentity(
  token: string,
  expectedLogin: string,
  client: Pick<CopilotClient, 'getAuthStatus'>,
  request: typeof fetch = fetch,
) {
  let response: Response
  try {
    response = await request('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new IdentityError('Could not reach GitHub to verify the token owner.')
  }
  if (response.status === 401)
    throw new IdentityError(
      'GitHub rejected the token. Check that it was copied completely and has not expired or been revoked.',
    )
  if (!response.ok)
    throw new IdentityError(
      `GitHub identity lookup returned HTTP ${response.status}. Check account policy or rate limits.`,
    )
  let identity: unknown
  try {
    identity = await response.json()
  } catch {
    throw new IdentityError('GitHub returned an unreadable identity response.')
  }
  if (
    !identity ||
    typeof identity !== 'object' ||
    !('login' in identity) ||
    typeof identity.login !== 'string' ||
    !/^[a-z0-9-]+$/i.test(identity.login)
  )
    throw new IdentityError('GitHub did not return a valid username.')
  if (identity.login.toLowerCase() !== expectedLogin.toLowerCase())
    throw new IdentityError(
      'The token owner does not match the GitHub username you entered.',
    )
  let auth: Awaited<ReturnType<CopilotClient['getAuthStatus']>>
  try {
    auth = await client.getAuthStatus()
  } catch {
    throw new IdentityError(
      'GitHub identity matched, but the Copilot runtime could not check authentication.',
    )
  }
  if (!auth.isAuthenticated)
    throw new IdentityError(
      'GitHub identity matched, but Copilot reports unauthenticated. Check Copilot Requests permission and account access.',
    )
  if (auth.login && auth.login.toLowerCase() !== identity.login.toLowerCase())
    throw new IdentityError(
      'Copilot reported a different identity from the verified token owner.',
    )
  return identity.login
}
