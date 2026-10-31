import { supabase } from './store'
import { draftErrorMessage } from './ai/recipeAi'

export type Member = {
  email: string
  displayName: string
  avatarUrl: string | null
  isMe: boolean
}
export type HouseholdOverview = {
  id: string
  name: string
  members: Member[]
}
export type SentRequest = {
  id: string
  displayName: string
  email: string
}
export type JoinRequest = {
  id: string
  householdName: string
  requestedBy: string
  createdAt: string
}
export type UserMatch = {
  userId: string
  displayName: string
  email: string
  avatarUrl: string | null
  inHousehold: boolean
  requested: boolean
}

function client() {
  if (!supabase) throw new Error('Households need the live kitchen.')
  return supabase
}

/** Calls a household function; database messages are already user-facing. */
async function call<T>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await client().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

type OverviewRow = {
  household_id: string
  name: string
  email: string
  display_name: string
  avatar_url: string | null
  is_me: boolean
}

export const householdApi = {
  syncProfile: () => call<null>('sync_profile'),
  create: (name: string) => call<string>('create_household', { p_name: name }),
  rename: (name: string) => call<null>('rename_household', { p_name: name }),
  leave: () => call<null>('leave_household'),
  async overview(): Promise<HouseholdOverview | null> {
    const rows = await call<OverviewRow[]>('household_overview')
    if (!rows?.length) return null
    return {
      id: rows[0].household_id,
      name: rows[0].name,
      members: rows.map((row) => ({
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        isMe: row.is_me,
      })),
    }
  },
  async sent(): Promise<SentRequest[]> {
    const rows = await call<
      { id: string; display_name: string; email: string }[]
    >('household_sent_requests')
    return (rows ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
    }))
  },
  async mine(): Promise<JoinRequest[]> {
    const rows = await call<
      {
        id: string
        household_name: string
        requested_by: string
        created_at: string
      }[]
    >('my_requests')
    return (rows ?? []).map((row) => ({
      id: row.id,
      householdName: row.household_name,
      requestedBy: row.requested_by,
      createdAt: row.created_at,
    }))
  },
  async search(query: string): Promise<UserMatch[]> {
    if (query.trim().length < 3) return []
    const rows = await call<
      {
        user_id: string
        display_name: string
        email: string
        avatar_url: string | null
        in_household: boolean
        requested: boolean
      }[]
    >('search_users', { p_query: query })
    return (rows ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      inHousehold: row.in_household,
      requested: row.requested,
    }))
  },
  async sources(): Promise<string[]> {
    const { data, error } = await client()
      .from('household_sources')
      .select('domain')
      .order('added_at')
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => row.domain as string)
  },
  /** Asks the server whether a site's robots.txt lets the importer in. */
  async checkSource(
    url: string,
  ): Promise<{ domain: string; allowed: boolean; reason: string | null }> {
    const { data, error } = await client().functions.invoke('source-check', {
      body: { url },
    })
    if (error) throw new Error(await draftErrorMessage(error))
    return data
  },
  addSource: (url: string) => call<string>('add_source', { p_url: url }),
  /** When the household may fetch new recipes again; null means now. */
  nextFetch: () => call<string | null>('next_catalog_fetch'),
  /** Imports up to 50 new catalog recipes from the household's sources. */
  async fetchRecipes(): Promise<
    | { ok: true; imported: number; partial: boolean }
    | { ok: false; nextAt?: string; error: string }
  > {
    const { data, error } = await client().functions.invoke('catalog-import', {
      body: {},
    })
    if (!error)
      return { ok: true, imported: data.imported, partial: data.partial }
    const context = (error as { context?: unknown }).context
    if (context instanceof Response && context.status === 429) {
      const body = await context.json().catch(() => ({}))
      return { ok: false, nextAt: body.nextAt, error: body.error }
    }
    return { ok: false, error: await draftErrorMessage(error) }
  },
  removeSource: (domain: string) =>
    call<null>('remove_source', { p_domain: domain }),
  /** Deactivated households this person owns and can switch back to. */
  async inactive(): Promise<{ id: string; name: string }[]> {
    const rows = await call<{ id: string; name: string }[]>(
      'my_inactive_households',
    )
    return rows ?? []
  },
  reactivate: (id: string) => call<null>('reactivate_household', { p_id: id }),
  request: (userId: string) =>
    call<string>('request_member', { p_user: userId }),
  withdraw: (id: string) => call<null>('withdraw_request', { p_id: id }),
  respond: (id: string, accept: boolean) =>
    call<null>('respond_to_request', { p_id: id, p_accept: accept }),
}
