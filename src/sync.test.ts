import { describe, expect, it } from 'vitest'
import { initialState, type State } from './domain'
import {
  applyChange,
  DroppedChange,
  isNetworkError,
  replay,
  type PendingChange,
} from './sync'

const addPantry =
  (name: string) =>
  (state: State): State => ({
    ...state,
    pantry: [
      ...state.pantry,
      { id: name, name, kind: 'staple', amount: 1, unit: 'each' },
    ],
  })

describe('offline changes', () => {
  it('replays queued changes on top of a newer server state', () => {
    const server = addPantry('rice')(initialState())
    const pending: PendingChange[] = [
      { event: { kind: 'pantry' }, update: addPantry('eggs') },
      { event: { kind: 'pantry' }, update: addPantry('tofu') },
    ]
    // Another phone added rice; both offline additions still land on top.
    expect(replay(server, 7, pending).pantry.map((p) => p.name)).toEqual([
      'rice',
      'eggs',
      'tofu',
    ])
  })

  it('skips a change that no longer applies instead of losing the rest', () => {
    const pending: PendingChange[] = [
      {
        event: { kind: 'pantry' },
        update: () => {
          throw new Error('That ingredient is already in your pantry.')
        },
      },
      { event: { kind: 'pantry' }, update: addPantry('eggs') },
    ]
    expect(
      replay(initialState(), 1, pending).pantry.map((p) => p.name),
    ).toEqual(['eggs'])
  })

  it('restores changes saved before the app closed only if nobody saved since', () => {
    const offline = addPantry('eggs')(initialState())
    const restored: PendingChange = {
      event: { kind: 'pantry' },
      replace: offline,
      baseVersion: 3,
    }
    expect(applyChange(restored, initialState(), 3)).toBe(offline)
    expect(() => applyChange(restored, initialState(), 4)).toThrow(
      DroppedChange,
    )
  })

  it('tells network failures apart from real errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'Household access denied' })).toBe(false)
  })
})
