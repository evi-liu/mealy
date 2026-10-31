import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { stateSchema, type ChangeEvent, type State } from './domain'
import {
  applyChange,
  DroppedChange,
  isNetworkError,
  readHouseholdCache,
  replay,
  writeHouseholdCache,
  type PendingChange,
} from './sync'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null
type Snapshot = { state: State; version: number; household: string | null }

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? error)

/**
 * The shared household, offline-first. The last state this device saw is
 * cached and shown at once; changes apply immediately and queue until they
 * reach the server, where each is replayed on top of the latest version so
 * another phone's changes are never overwritten.
 */
export function useHousehold() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [pendingSync, setPendingSync] = useState(0)
  // Signed in, but not a member of any household yet (or just left one).
  const [noHousehold, setNoHousehold] = useState(false)
  // The last version the server confirmed, and changes not yet on it.
  const base = useRef<Snapshot | null>(null)
  const pending = useRef<PendingChange[]>([])
  const local = useRef<State | null>(null)
  const userId = useRef<string | null>(null)
  const flushing = useRef(false)
  const alive = useRef(true)

  const publish = useCallback(() => {
    if (!alive.current || !base.current) return
    const state = local.current ?? base.current.state
    setSnapshot({ ...base.current, state })
    setPendingSync(pending.current.length)
    if (userId.current && base.current.household)
      writeHouseholdCache({
        userId: userId.current,
        household: base.current.household,
        version: base.current.version,
        base: base.current.state,
        local: state,
        pending: pending.current.map((change) => change.event),
      })
  }, [])

  /** Rebuilds the local view from the server state and pending changes. */
  const rebase = useCallback(() => {
    if (!base.current) return
    local.current = pending.current.length
      ? replay(base.current.state, base.current.version, pending.current)
      : base.current.state
    publish()
  }, [publish])

  const fetchServer = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const membership = await supabase.rpc('my_household')
    if (membership.error) throw membership.error
    if (!membership.data) {
      base.current = null
      local.current = null
      pending.current = []
      if (alive.current) {
        setSnapshot(null)
        setNoHousehold(true)
        setOnline(true)
      }
      return
    }
    if (alive.current) setNoHousehold(false)
    const { data, error } = await supabase
      .from('household_state')
      .select('data,version')
      .eq('household_id', membership.data)
      .single()
    if (error) throw error
    const next = {
      state: stateSchema.parse(data.data),
      version: Number(data.version),
      household: String(membership.data),
    }
    const switched = base.current?.household !== next.household
    if (switched) pending.current = []
    if (switched || !base.current || next.version >= base.current.version) {
      base.current = next
      rebase()
    }
    if (alive.current) setOnline(true)
  }, [rebase])

  /** Sends pending changes in order, replaying each on the latest state. */
  const flush = useCallback(async () => {
    if (flushing.current || !supabase) return
    flushing.current = true
    try {
      while (pending.current.length && base.current) {
        const change = pending.current[0]
        let target: State
        try {
          target = applyChange(change, base.current.state, base.current.version)
        } catch (problem) {
          pending.current.shift()
          setError(
            problem instanceof DroppedChange
              ? problem.message
              : `A change couldn't be applied to the latest version and was skipped: ${message(problem)}`,
          )
          continue
        }
        const { data, error, status } = await supabase.rpc('save_household', {
          p_version: base.current.version,
          p_data: target,
          p_kind: change.event.kind,
          p_recipe_id: change.event.recipeId ?? null,
        })
        if (error) {
          if (error.code === '40001') {
            // Another phone saved first: catch up, then replay this change.
            await fetchServer()
            continue
          }
          if (isNetworkError(error)) {
            if (alive.current) setOnline(false)
            return
          }
          // A server hiccup: keep the change and try again shortly.
          if (status >= 500) return
          pending.current.shift()
          setError(message(error))
          continue
        }
        base.current = { ...base.current, state: target, version: Number(data) }
        pending.current.shift()
        if (alive.current) setOnline(true)
      }
    } catch (problem) {
      if (isNetworkError(problem)) {
        if (alive.current) setOnline(false)
      } else setError(message(problem))
    } finally {
      flushing.current = false
      rebase()
    }
  }, [fetchServer, rebase])

  /** Catches up with the server, sending any waiting changes first. */
  const sync = useCallback(async () => {
    try {
      if (pending.current.length) await flush()
      else await fetchServer()
    } catch (problem) {
      if (isNetworkError(problem)) {
        if (alive.current) setOnline(false)
      } else if (alive.current) setError(message(problem))
    }
  }, [fetchServer, flush])

  useEffect(() => {
    alive.current = true
    let timer = 0
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      void sync()
    }
    const wentOffline = () => setOnline(false)
    void (async () => {
      // Show the cached household immediately, even without a connection.
      const session = await supabase?.auth.getSession()
      userId.current = session?.data.session?.user.id ?? null
      const cache = userId.current ? readHouseholdCache(userId.current) : null
      if (cache && alive.current && !base.current) {
        base.current = {
          state: cache.base,
          version: cache.version,
          household: cache.household,
        }
        // Changes made offline before the app closed come back as one.
        pending.current = cache.pending.length
          ? [
              {
                event: cache.pending.at(-1)!,
                replace: cache.local,
                baseVersion: cache.version,
              },
            ]
          : []
        local.current = cache.local
        publish()
      }
      refresh()
    })()
    timer = window.setInterval(refresh, 4000)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', wentOffline)
    window.addEventListener('focus', refresh)
    return () => {
      alive.current = false
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', wentOffline)
      window.removeEventListener('focus', refresh)
    }
  }, [publish, sync])

  const change = useCallback(
    async (
      update: (state: State) => State,
      event: ChangeEvent,
    ): Promise<boolean> => {
      const current = local.current ?? base.current?.state
      if (!current) return false
      setError('')
      let next: State
      try {
        next = stateSchema.parse(update(current))
      } catch (problem) {
        setError(message(problem))
        return false
      }
      pending.current.push({ event, update })
      local.current = next
      publish()
      void flush()
      return true
    },
    [flush, publish],
  )

  return {
    state: snapshot?.state,
    household: snapshot?.household,
    /** Kept for callers that disable controls while saving; never blocks. */
    busy: false,
    error,
    /** False while requests are failing for lack of a connection. */
    online,
    /** Changes made here that haven't reached the server yet. */
    pendingSync,
    noHousehold,
    reload: () => sync(),
    change,
    reportError: setError,
    retry: () => {
      setError('')
      void sync()
    },
  }
}

export type HouseholdStore = ReturnType<typeof useHousehold>
