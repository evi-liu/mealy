import { stateSchema, type ChangeEvent, type State } from './domain'

/**
 * A change waiting to reach the server. Most are the original update
 * function, so they can be replayed on top of whatever the server has by
 * then. Changes restored after the app was closed only have the resulting
 * state; those apply only if nobody else saved in between.
 */
export type PendingChange =
  | { event: ChangeEvent; update: (state: State) => State }
  | { event: ChangeEvent; replace: State; baseVersion: number }

export class DroppedChange extends Error {}

/** The state a pending change produces on top of `base` at `version`. */
export function applyChange(
  change: PendingChange,
  base: State,
  version: number,
): State {
  if ('replace' in change) {
    if (change.baseVersion !== version)
      throw new DroppedChange(
        "Changes made offline before Mealy was closed couldn't be merged with newer changes from another phone, so they were set aside.",
      )
    return change.replace
  }
  return stateSchema.parse(change.update(base))
}

/** What the household sees: the server state with pending changes on top. */
export function replay(
  base: State,
  version: number,
  pending: PendingChange[],
): State {
  let state = base
  for (const change of pending) {
    try {
      state = applyChange(change, state, version)
    } catch {
      // A change that no longer applies is reported when it syncs.
    }
  }
  return state
}

/** A failed request that should wait for the connection, not be reported. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return true
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String((error as { message?: unknown })?.message ?? error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(
    text,
  )
}

export const HOUSEHOLD_CACHE_KEY = 'mealy-household-cache-v1'

/** The last household state this device saw, plus unsynced changes. */
export type HouseholdCache = {
  userId: string
  household: string
  version: number
  base: State
  local: State
  pending: ChangeEvent[]
}

export function readHouseholdCache(userId: string): HouseholdCache | null {
  try {
    const raw = localStorage.getItem(HOUSEHOLD_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as HouseholdCache
    if (cache.userId !== userId) return null
    return {
      ...cache,
      base: stateSchema.parse(cache.base),
      local: stateSchema.parse(cache.local),
    }
  } catch {
    return null
  }
}

export function writeHouseholdCache(cache: HouseholdCache) {
  try {
    localStorage.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full or unavailable: the app still works while it's open.
  }
}

export const PROFILE_CACHE_PREFIX = 'mealy-profile-cache-v1:'

/**
 * Loads Profile data, remembering the last good answer on this device so the
 * card can still show it without a connection. Other errors still throw.
 */
export async function remembered<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const value = await load()
    try {
      localStorage.setItem(PROFILE_CACHE_PREFIX + key, JSON.stringify(value))
    } catch {
      // Storage unavailable: it just won't show offline.
    }
    return value
  } catch (error) {
    if (!isNetworkError(error)) throw error
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_PREFIX + key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // Fall through to the network error.
    }
    throw error
  }
}

/** Forgets cached household data, e.g. on sign-out. */
export function clearLocalData() {
  try {
    for (const key of [HOUSEHOLD_CACHE_KEY, 'mealy-catalog-cache-v1'])
      localStorage.removeItem(key)
    for (const key of Object.keys(localStorage))
      if (key.startsWith(PROFILE_CACHE_PREFIX)) localStorage.removeItem(key)
  } catch {
    // Nothing cached.
  }
}
