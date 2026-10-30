import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { z } from 'zod'

export const requestSchema = z
  .object({
    householdId: z.uuid(),
    task: z.enum(['recipe_draft', 'ranking']),
    instructions: z.string().min(1).max(20000),
    input: z.string().min(1).max(180000),
    schema: z.record(z.string(), z.unknown()),
  })
  .strict()
export type GenerateRequest = z.infer<typeof requestSchema>
export type Generate = (
  request: GenerateRequest,
  signal: AbortSignal,
) => Promise<string>

export class ServiceError extends Error {
  constructor(
    public readonly code: 'busy' | 'timeout' | 'unavailable' | 'invalid_output',
  ) {
    super(code)
  }
}

export function createGateway(
  config: { token: string; householdId: string },
  generate: Generate,
) {
  if (
    config.token.length < 32 ||
    !z.uuid().safeParse(config.householdId).success
  )
    throw new Error(
      'A strong gateway token and one allowed household ID are required.',
    )
  const expected = Buffer.from(`Bearer ${config.token}`)
  let active = 0
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      if (res.destroyed || res.writableEnded) return
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }
    if (req.url === '/health' && req.method === 'GET')
      return reply(200, { ok: true })
    if (req.url !== '/generate' || req.method !== 'POST')
      return reply(404, { error: 'not_found' })
    const supplied = Buffer.from(req.headers.authorization ?? '')
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reply(401, { error: 'unauthorized' })
    if (!req.headers['content-type']?.startsWith('application/json'))
      return reply(415, { error: 'invalid_request' })
    // Reserve capacity before reading the body, not after buffering it.
    if (active >= 2) return reply(429, { error: 'busy' })
    active++
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      reply(504, { error: 'timeout' })
    }, 45000)
    res.on('close', () => controller.abort())
    try {
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > 256000) return reply(413, { error: 'invalid_request' })
        chunks.push(chunk)
      }
      let request: GenerateRequest
      try {
        request = requestSchema.parse(
          JSON.parse(Buffer.concat(chunks).toString('utf8')),
        )
      } catch {
        return reply(400, { error: 'invalid_request' })
      }
      if (request.householdId !== config.householdId)
        return reply(403, { error: 'household_denied' })
      const text = await generate(request, controller.signal)
      if (controller.signal.aborted) throw new ServiceError('timeout')
      if (Buffer.byteLength(text) > 256000)
        throw new ServiceError('invalid_output')
      try {
        JSON.parse(text)
      } catch {
        throw new ServiceError('invalid_output')
      }
      reply(200, { text })
    } catch (error) {
      const code = controller.signal.aborted
        ? 'timeout'
        : error instanceof ServiceError
          ? error.code
          : 'unavailable'
      // Do not log prompts, credentials, or raw provider errors.
      console.error('Copilot generation failed', code)
      reply(code === 'timeout' ? 504 : 502, { error: code })
    } finally {
      clearTimeout(timer)
      active--
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  return server
}
