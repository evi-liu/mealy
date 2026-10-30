import { useCallback, useEffect, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Check, LogOut, Plus, Search, UserRound, X } from 'lucide-react'
import { supabase } from './store'
import { sourceName } from './domain'
import { useConfirm } from './confirm'
import {
  householdApi,
  type HouseholdOverview,
  type JoinRequest,
  type SentRequest,
  type UserMatch,
} from './household'

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

type Me = { email: string; name: string; avatarUrl: string | null }

function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!active || !user) return
      const meta = user.user_metadata as Record<string, unknown>
      setMe({
        email: user.email ?? '',
        name: String(meta.full_name ?? meta.name ?? ''),
        avatarUrl:
          typeof meta.avatar_url === 'string' &&
          meta.avatar_url.startsWith('https://')
            ? meta.avatar_url
            : null,
      })
    })
    return () => {
      active = false
    }
  }, [])
  return me
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'
  return url && !failed ? (
    <img
      className="avatar"
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="avatar" aria-hidden="true">
      {initials}
    </span>
  )
}

function MeCard({ me }: { me: Me | null }) {
  return (
    <section className="profileCard meCard">
      <Avatar name={me?.name || me?.email || ''} url={me?.avatarUrl ?? null} />
      <div>
        <strong>{me?.name || 'Signed in'}</strong>
        <small>{me?.email}</small>
      </div>
    </section>
  )
}

/** Join requests waiting for this person's answer. They never expire. */
/** What switching away from the current household will do to it. */
async function switchingAway(): Promise<string | null> {
  const current = await householdApi.overview()
  if (!current) return null
  return current.members.length === 1
    ? `You're the only member of ${current.name}, so it will be deactivated, not deleted. If you own it, you can switch back to it from Profile.`
    : `You'll leave ${current.name}; its other members keep it.`
}

function RequestsInbox({ onJoined }: { onJoined: () => void }) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const load = useCallback(() => {
    householdApi
      .mine()
      .then(setRequests)
      .catch((e) => setError(message(e)))
  }, [])
  useEffect(load, [load])
  async function respond(request: JoinRequest, accept: boolean) {
    setBusy(true)
    setError('')
    try {
      if (accept) {
        const away = await switchingAway()
        if (
          away &&
          !(await confirm({
            title: `Join ${request.householdName}?`,
            body: away,
            confirm: 'Join',
          }))
        )
          return
      }
      await householdApi.respond(request.id, accept)
      load()
      if (accept) onJoined()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  if (!requests?.length && !error) return null
  return (
    <section className="profileCard" aria-labelledby="requests-heading">
      <h2 id="requests-heading">Requests to join</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {requests?.map((request) => (
        <div className="requestRow" key={request.id}>
          <p>
            <strong>{request.requestedBy}</strong> asked you to join{' '}
            <strong>{request.householdName}</strong>.
          </p>
          <div className="buttonRow">
            <Button
              className="secondaryButton"
              disabled={busy}
              onClick={() => void respond(request, false)}
            >
              Decline
            </Button>
            <Button
              className="primaryButton"
              disabled={busy}
              onClick={() => void respond(request, true)}
            >
              <Check size={17} /> Join
            </Button>
          </div>
        </div>
      ))}
    </section>
  )
}

function AddMember({ onRequested }: { onRequested: () => void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<UserMatch[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (query.trim().length < 3) {
      setMatches([])
      return
    }
    const timer = setTimeout(() => {
      householdApi
        .search(query)
        .then((found) => {
          setMatches(found)
          setError('')
        })
        .catch((e) => setError(message(e)))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])
  async function request(match: UserMatch) {
    setError('')
    try {
      await householdApi.request(match.userId)
      setMatches((list) =>
        list.map((m) =>
          m.userId === match.userId ? { ...m, requested: true } : m,
        ),
      )
      onRequested()
    } catch (e) {
      setError(message(e))
    }
  }
  return (
    <div className="addMember">
      <label className="searchField">
        <Search size={17} aria-hidden="true" />
        <input
          aria-label="Find someone who uses Mealy"
          placeholder="Search by name or Gmail address"
          value={query}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="helper">
        Only people who have signed in to Mealy can be found. They get a request
        to join in their Profile.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query.trim().length >= 3 && !matches.length && !error && (
        <p className="helper">No one found yet.</p>
      )}
      {matches.map((match) => (
        <div className="memberRow" key={match.userId}>
          <Avatar
            name={match.displayName || match.email}
            url={match.avatarUrl}
          />
          <span className="memberName">
            <strong>{match.displayName || match.email}</strong>
            <small>
              {match.email}
              {match.inHousehold ? ' · in another household' : ''}
            </small>
          </span>
          <Button
            className="textButton"
            disabled={match.requested}
            onClick={() => void request(match)}
          >
            {match.requested ? 'Requested' : 'Ask to join'}
          </Button>
        </div>
      ))}
    </div>
  )
}

function HouseholdCard({ onLeft }: { onLeft: () => void }) {
  const [household, setHousehold] = useState<HouseholdOverview | null>(null)
  const [sent, setSent] = useState<SentRequest[]>([])
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const load = useCallback(() => {
    Promise.all([householdApi.overview(), householdApi.sent()])
      .then(([overview, requests]) => {
        setHousehold(overview)
        setSent(requests)
      })
      .catch((e) => setError(message(e)))
  }, [])
  useEffect(load, [load])
  async function act(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
      load()
      return true
    } catch (e) {
      setError(message(e))
      return false
    }
  }
  if (!household)
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : null
  return (
    <section className="profileCard" aria-labelledby="household-heading">
      <span className="eyebrow">YOUR HOUSEHOLD</span>
      {renaming ? (
        <form
          className="renameForm"
          onSubmit={async (e) => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name'))
            if (await act(() => householdApi.rename(name))) setRenaming(false)
          }}
        >
          <input
            name="name"
            aria-label="Household name"
            defaultValue={household.name}
            maxLength={80}
            required
          />
          <Button className="textButton" type="submit">
            Save
          </Button>
          <Button className="textButton" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="householdName">
          <h2 id="household-heading">{household.name}</h2>
          <Button className="textButton" onClick={() => setRenaming(true)}>
            Rename
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="helper">
        Everyone here shares one week, recipe box, pantry and grocery list.
      </p>
      {household.members.map((member) => (
        <div className="memberRow" key={member.email}>
          <Avatar
            name={member.displayName || member.email}
            url={member.avatarUrl}
          />
          <span className="memberName">
            <strong>
              {member.displayName || member.email}
              {member.isMe ? ' (you)' : ''}
            </strong>
            <small>{member.email}</small>
          </span>
        </div>
      ))}
      {sent.length > 0 && (
        <>
          <h3>Waiting for an answer</h3>
          {sent.map((request) => (
            <div className="memberRow pending" key={request.id}>
              <span className="avatar" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <span className="memberName">
                <strong>{request.displayName || request.email}</strong>
                <small>{request.email} · requested</small>
              </span>
              <Button
                className="iconButton"
                aria-label={`Withdraw request to ${request.email}`}
                onClick={() =>
                  void act(() => householdApi.withdraw(request.id))
                }
              >
                <X size={17} />
              </Button>
            </div>
          ))}
        </>
      )}
      <h3>Add someone</h3>
      <AddMember onRequested={load} />
      <Button
        className="textButton leaveButton"
        onClick={async () => {
          if (
            (await confirm({
              title: `Leave ${household.name}?`,
              body:
                household.members.length === 1
                  ? "You're its only member, so it will be deactivated, not deleted. If you own it, you can switch back to it from Profile."
                  : "You'll lose access to its week, recipes and pantry until someone adds you back.",
              confirm: 'Leave household',
            })) &&
            (await act(() => householdApi.leave()))
          )
            onLeft()
        }}
      >
        Leave household
      </Button>
    </section>
  )
}

function SignOut({ exit }: { exit: () => void }) {
  return (
    <Button className="secondaryButton signOut" onClick={exit}>
      <LogOut size={17} /> Sign out
    </Button>
  )
}

/** Deactivated households this person owns, ready to switch back to. */
function InactiveHouseholds({ onSwitched }: { onSwitched: () => void }) {
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>(
    [],
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  useEffect(() => {
    householdApi
      .inactive()
      .then(setHouseholds)
      .catch((e) => setError(message(e)))
  }, [])
  if (!households.length && !error) return null
  return (
    <section className="profileCard" aria-labelledby="inactive-heading">
      <h2 id="inactive-heading">Your other households</h2>
      <p className="helper">
        Deactivated households you own, kept with their recipes, pantry and
        week. Switching back moves you out of your current one.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {households.map((household) => (
        <div className="memberRow" key={household.id}>
          <span className="memberName">
            <strong>{household.name}</strong>
            <small>Deactivated</small>
          </span>
          <Button
            className="textButton"
            disabled={busy}
            onClick={async () => {
              setError('')
              setBusy(true)
              try {
                const away = await switchingAway()
                if (
                  !(await confirm({
                    title: `Switch back to ${household.name}?`,
                    body: away ?? 'It will be active again with all its data.',
                    confirm: 'Switch back',
                  }))
                )
                  return
                await householdApi.reactivate(household.id)
                onSwitched()
              } catch (e) {
                setError(message(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Switch back
          </Button>
        </div>
      ))}
    </section>
  )
}

/** The recipe sites this household's catalog draws from. */
function SourcesCard() {
  const [sources, setSources] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [refused, setRefused] = useState('')
  const [checking, setChecking] = useState(false)
  const load = useCallback(() => {
    householdApi
      .sources()
      .then(setSources)
      .catch((e) => setError(message(e)))
  }, [])
  useEffect(load, [load])
  async function act(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
      load()
      return true
    } catch (e) {
      setError(message(e))
      return false
    }
  }
  return (
    <>
      <section className="profileCard" aria-labelledby="sources-heading">
        <span className="eyebrow">RECIPE CATALOG</span>
        <h2 id="sources-heading">Recipe sources</h2>
        <p className="helper">
          Sites your swipe stack draws from. Mealy imports their newest recipes,
          ingredients and directions included, and checks every Saturday for new
          ones. A site you add fills in after the next Saturday import, up to 50
          recipes. Sites whose robots.txt forbids importers can't be added.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {sources?.map((domain) => (
          <div className="memberRow" key={domain}>
            <span className="memberName">
              <strong>{sourceName(`https://${domain}/`)}</strong>
              <small>{domain}</small>
            </span>
            <Button
              className="iconButton"
              aria-label={`Remove ${domain}`}
              onClick={() => void act(() => householdApi.removeSource(domain))}
            >
              <X size={17} />
            </Button>
          </div>
        ))}
        {sources?.length === 0 && (
          <p className="helper">No sources yet. Add a recipe site below.</p>
        )}
        <form
          className="renameForm addSource"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const url = String(new FormData(form).get('url'))
            setRefused('')
            setChecking(true)
            try {
              const check = await householdApi.checkSource(url)
              if (!check.allowed) {
                setRefused(
                  `Couldn't add ${check.domain}: ${check.reason ?? 'its robots.txt does not allow automated importers'}.`,
                )
                return
              }
            } catch (e) {
              setError(message(e))
              return
            } finally {
              setChecking(false)
            }
            if (await act(() => householdApi.addSource(url))) form.reset()
          }}
        >
          <input
            name="url"
            type="url"
            aria-label="Recipe site address"
            placeholder="https://example.com"
            required
            maxLength={300}
            autoComplete="off"
          />
          <Button
            className="primaryButton"
            type="submit"
            disabled={checking}
            focusableWhenDisabled
          >
            <Plus size={17} /> {checking ? 'Checking...' : 'Add'}
          </Button>
        </form>
      </section>
      {refused && (
        <p role="alert" className="error sourceRefused">
          {refused}
        </p>
      )}
    </>
  )
}

export function ProfileScreen({
  onHouseholdChanged,
  exit,
}: {
  onHouseholdChanged: () => void
  exit: () => void
}) {
  const me = useMe()
  return (
    <main className="screen profileScreen">
      <header className="screenHeader">
        <div>
          <span className="eyebrow">YOU AND YOUR KITCHEN</span>
          <h1>Profile</h1>
        </div>
      </header>
      <MeCard me={me} />
      <RequestsInbox onJoined={onHouseholdChanged} />
      <HouseholdCard onLeft={onHouseholdChanged} />
      <SourcesCard />
      <InactiveHouseholds onSwitched={onHouseholdChanged} />
      <SignOut exit={exit} />
    </main>
  )
}

/** For someone signed in who isn't in a household yet. */
export function Onboarding({
  onJoined,
  exit,
}: {
  onJoined: () => void
  exit: () => void
}) {
  const me = useMe()
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  return (
    <main className="screen profileScreen">
      <header className="screenHeader">
        <div>
          <span className="eyebrow">WELCOME TO MEALY</span>
          <h1>Set up your kitchen</h1>
        </div>
      </header>
      <MeCard me={me} />
      <RequestsInbox onJoined={onJoined} />
      <InactiveHouseholds onSwitched={onJoined} />
      <section className="profileCard" aria-labelledby="create-heading">
        <h2 id="create-heading">Start a household</h2>
        <p className="helper">
          A household shares one week, recipe box, pantry and grocery list. You
          can add the people you cook with once it's set up. If someone has
          asked you to join theirs, their request appears above; you can also
          come back to it any time from your Profile.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form
          className="renameForm"
          onSubmit={async (e) => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name'))
            setCreating(true)
            setError('')
            try {
              await householdApi.create(name)
              onJoined()
            } catch (err) {
              setError(message(err))
            } finally {
              setCreating(false)
            }
          }}
        >
          <input
            name="name"
            aria-label="Household name"
            defaultValue="Our kitchen"
            maxLength={80}
            required
          />
          <Button className="primaryButton" type="submit" disabled={creating}>
            <Plus size={17} /> Create
          </Button>
        </form>
      </section>
      <SignOut exit={exit} />
    </main>
  )
}
