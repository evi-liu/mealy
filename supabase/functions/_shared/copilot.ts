export class CopilotError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message)
    this.name = 'CopilotError'
  }
}

export async function requestCopilot(
  config: { url: string; token: string },
  request: {
    householdId: string
    task: 'recipe_draft' | 'ranking'
    instructions: string
    input: string
    schema: Record<string, unknown>
  },
  send: typeof fetch = fetch,
): Promise<string> {
  let url: URL
  try {
    url = new URL(config.url)
  } catch {
    throw new CopilotError('Copilot service configuration is invalid.', 503)
  }
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    config.token.length < 32
  )
    throw new CopilotError('Copilot service configuration is invalid.', 503)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/generate`
  let response: Response
  try {
    response = await send(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify(request),
    })
  } catch {
    throw new CopilotError('Could not reach Copilot. Please try again later.')
  }
  if (!response.ok) {
    // Never pass through provider text, which may contain secrets or prompts.
    if (response.status === 401)
      throw new CopilotError(
        'Copilot service authentication failed. Ask the administrator to check its gateway secret.',
        503,
      )
    if (response.status === 403)
      throw new CopilotError('Copilot is not enabled for this household.', 403)
    if (response.status === 429)
      throw new CopilotError(
        'Copilot is busy. Wait a moment and try again.',
        429,
      )
    if (response.status === 504)
      throw new CopilotError('Copilot timed out. Please try again later.')
    throw new CopilotError(
      'Copilot could not complete this request. Ask the administrator to check account access, usage limits, and model configuration.',
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CopilotError('Copilot returned an invalid response.')
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !('text' in body) ||
    typeof body.text !== 'string' ||
    !body.text.length ||
    body.text.length > 256000
  )
    throw new CopilotError('Copilot returned an invalid response.')
  return body.text
}
