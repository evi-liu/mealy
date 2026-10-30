import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { stateSchema, type ChangeEvent, type State } from './domain'

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

export function useHousehold() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const current = useRef<Snapshot | null>(null)
  const locked = useRef(false)
  const alive = useRef(true)
  const apply = useCallback((next: Snapshot) => {
    if (!alive.current) return
    current.current = next
    setSnapshot(next)
  }, [])

  const load = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const membership = await supabase.rpc('my_household')
    if (membership.error) throw membership.error
    if (!membership.data)
      throw new Error(
        'This Google account is not authorized. Ask the administrator to add your email to the household allowlist.',
      )
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
    if (!current.current || next.version > current.current.version) apply(next)
    if (alive.current) setConnected(true)
  }, [apply])

  useEffect(() => {
    alive.current = true
    const refresh = () => {
      if (locked.current) return
      void load().catch((error) => {
        if (alive.current) {
          setConnected(false)
          setError(
            error instanceof Error
              ? error.message
              : String(error.message ?? error),
          )
        }
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 4000)
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      alive.current = false
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  const change = useCallback(
    async (
      update: (state: State) => State,
      event: ChangeEvent,
    ): Promise<boolean> => {
      if (!current.current || locked.current) return false
      locked.current = true
      setBusy(true)
      setError('')
      const before = current.current
      try {
        const state = stateSchema.parse(update(before.state))
        if (!supabase) throw new Error('Supabase is not configured.')
        const { data, error } = await supabase.rpc('save_household', {
          p_version: before.version,
          p_data: state,
          p_kind: event.kind,
          p_recipe_id: event.recipeId ?? null,
        })
        if (error) {
          if (error.code === '40001') {
            await load()
            throw new Error(
              'The other phone changed this week. The latest version is loaded; please repeat your action.',
            )
          }
          throw error
        }
        apply({ ...before, state, version: Number(data) })
        setConnected(true)
        return true
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : String((error as { message?: string }).message ?? error),
        )
        return false
      } finally {
        locked.current = false
        if (alive.current) setBusy(false)
      }
    },
    [apply, load],
  )

  return {
    state: snapshot?.state,
    household: snapshot?.household,
    busy,
    error,
    connected,
    change,
    reportError: setError,
    retry: () => {
      setError('')
      void load().catch((error) => setError(String(error.message ?? error)))
    },
  }
}

export type HouseholdStore = ReturnType<typeof useHousehold>
