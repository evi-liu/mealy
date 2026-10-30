import { describe, expect, it, vi } from 'vitest'
import { requestCopilot } from '../supabase/functions/_shared/copilot'

const config = {
  url: 'https://copilot.example.test',
  token: 'test-only-not-a-real-secret-1234567890',
}
const request = {
  householdId: '10000000-0000-4000-8000-000000000001',
  task: 'ranking' as const,
  instructions: 'Rank only supplied IDs.',
  input: '{}',
  schema: { type: 'object' },
}

describe('Copilot Edge Function transport', () => {
  it('sends server-side credentials, household and schema without following redirects', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ text: '{"ranked":[]}' })),
      )
    expect(await requestCopilot(config, request, send)).toBe('{"ranked":[]}')
    const [url, init] = send.mock.calls[0]
    expect(String(url)).toBe('https://copilot.example.test/generate')
    expect(init?.redirect).toBe('error')
    expect(init?.headers).toHaveProperty(
      'Authorization',
      `Bearer ${config.token}`,
    )
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })
  it.each([401, 403, 429, 502, 504])(
    'reports gateway failure %i without leaking provider text or retrying',
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('secret detail', { status }))
      await expect(requestCopilot(config, request, send)).rejects.not.toThrow(
        'secret detail',
      )
      expect(send).toHaveBeenCalledTimes(1)
    },
  )
  it('rejects insecure configuration and invalid success responses', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    await expect(
      requestCopilot(
        { ...config, url: 'http://public.example.test' },
        request,
        send,
      ),
    ).rejects.toThrow('configuration')
    expect(send).not.toHaveBeenCalled()
    await expect(requestCopilot(config, request, send)).rejects.toThrow(
      'invalid response',
    )
  })
})
