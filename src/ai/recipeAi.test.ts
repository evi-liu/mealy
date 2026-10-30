import { describe, expect, it } from 'vitest'
import { draftErrorMessage } from './recipeAi'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

describe('AI drafting error messages', () => {
  it('explains an unreachable function instead of crashing on its context', async () => {
    // Fetch and relay errors carry non-Response context, e.g. the network error.
    for (const context of [new TypeError('Failed to fetch'), {}, undefined])
      expect(await draftErrorMessage({ context })).toMatch(
        /Couldn't reach AI drafting/,
      )
    expect(await draftErrorMessage(null)).toMatch(/Couldn't reach/)
  })

  it("passes through the function's own explanation", async () => {
    expect(
      await draftErrorMessage({
        context: json(429, { error: 'AI drafting limit reached.' }),
      }),
    ).toBe('AI drafting limit reached.')
  })

  it('says drafting is not set up when the function does not exist', async () => {
    expect(
      await draftErrorMessage({ context: json(404, { message: 'nope' }) }),
    ).toMatch(/isn't set up yet/)
  })

  it('falls back when the response is not JSON', async () => {
    expect(
      await draftErrorMessage({
        context: new Response('<html>', { status: 502 }),
      }),
    ).toMatch(/unavailable right now/)
  })
})
