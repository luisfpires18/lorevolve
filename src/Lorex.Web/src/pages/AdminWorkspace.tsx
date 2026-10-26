import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import {
  getDatabaseBackups,
  getOverview,
  getUser,
  listUsers,
  createSignUpLink,
  runDatabaseBackup,
  setBlocked,
  type AdminOverview,
  type DatabaseBackupStatus,
  type AdminUserDetail,
  type AdminUserPage,
} from '../admin/api'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from '../components/AccountMenu'
import { ActionIcon } from '../components/ActionIcon'
import { Avatar } from '../components/Avatar'
import { BRAND_LINK_LABEL, BrandMark } from '../components/BrandMark'
import { EmptyState } from '../components/EmptyState'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import { ApiError } from '../lib/api'
import { formatBytes } from '../lib/bytes'
import { confirmAction } from '../lib/confirm'
import { formatDateTime } from '../lib/dates'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * LoreX Admin (#40): the service's own workspace, apart from My workspace and from every universe. Main, Users and
 * Tracing, in My workspace's frame and type. One chunk, fetched only when an Admin opens it; `RequireAdmin` keeps the door
 * and the server refuses every admin request from anyone else.
 *
 * Nothing here reads a universe. Figures are only what LoreX records, and what it does not record says so.
 */

type Load<T> =
  { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string }

/** Reads `load` once per change of it (callers memoize it on what it asks for) and again on Try again. */
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((value) => setState({ kind: 'ready', value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load this.',
        })
      })
    return () => controller.abort()
  }, [load, attempt])

  return { state, setState, retry: () => setAttempt((current) => current + 1) }
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <p>{message}</p>
      <button className="button button--secondary" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

const NOT_TRACKED = 'Not tracked yet'

function screenName(pathname: string) {
  if (pathname.startsWith('/admin/users')) return 'Users'
  if (pathname.startsWith('/admin/tracing')) return 'Tracing'
  return 'Main'
}

export default function AdminWorkspace() {
  const { pathname } = useLocation()
  useDocumentTitle(screenName(pathname), 'Admin')

  return (
    <div className="home">
      <div className="atmosphere" aria-hidden="true" data-source="lorex" />
      <header className="workspacebar">
        <Link className="home__brand workspacebar__brand" to="/" aria-label={BRAND_LINK_LABEL}>
          <BrandMark />
          <Wordmark />
        </Link>

        <nav className="workspacebar__nav" aria-label="LoreX Admin">
          <span className="workspacebar__context" aria-hidden="true">
            LoreX Admin
          </span>
          <ul className="workspacebar__links">
            <li>
              <NavLink className="workspacebar__link" to="/admin" end data-testid="admin-nav-main">
                Main
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/users"
                data-testid="admin-nav-users"
              >
                Users
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/tracing"
                data-testid="admin-nav-tracing"
              >
                Tracing
              </NavLink>
            </li>
          </ul>
        </nav>

        <Link className="workspacebar__explore" to="/app" data-testid="admin-my-workspace">
          My workspace
        </Link>
        <AccountMenu variant="bar" />
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Routes>
          <Route index element={<MainScreen />} />
          <Route path="users" element={<UsersScreen />} />
          <Route path="users/:userId" element={<UserScreen />} />
          <Route path="tracing" element={<TracingScreen />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Heading({ title, lede }: { title: string; lede: ReactNode }) {
  return (
    <div className="home__heading">
      <div>
        <h1 className="home__title">{title}</h1>
        <p className="home__lede">{lede}</p>
      </div>
    </div>
  )
}

// ---------- Main ----------

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function Stat({
  label,
  value,
  source,
  testId,
}: {
  label: string
  value: ReactNode
  source: string
  testId: string
}) {
  const tracked = value !== NOT_TRACKED
  return (
    <li className="adminstat" data-testid={testId} data-tracked={tracked}>
      <span className="adminstat__label">{label}</span>
      <span
        className={tracked ? 'adminstat__value' : 'adminstat__value adminstat__value--none'}
        data-testid={`${testId}-value`}
      >
        {value}
      </span>
      <span className="adminstat__source">{source}</span>
    </li>
  )
}

function MainScreen() {
  const { state, retry } = useLoad(getOverview)

  return (
    <>
      <Heading
        title="Main"
        lede="What LoreX records about the service, counted when this page opened. Times are UTC."
      />

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Counting&hellip;
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <Overview overview={state.value} /> : null}
      <DatabaseBackups />
    </>
  )
}

/**
 * Database backups (#54): the age of the last backup that was uploaded and read back, the last attempt and its error, and
 * Run now. While one runs, the status is read again every few seconds until it ends.
 */
function DatabaseBackups() {
  const { state, setState, retry } = useLoad(getDatabaseBackups)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const running = state.kind === 'ready' && state.value.running

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(retry, 3000)
    return () => window.clearTimeout(timer)
  }, [running, state, retry])

  async function runNow() {
    setStarting(true)
    setMessage(null)
    try {
      setState({ kind: 'ready', value: await runDatabaseBackup() })
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The backup could not be started.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-backups" data-testid="admin-backups">
      <h2 className="settings__heading" id="admin-backups">
        Database backups
      </h2>
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading&hellip;
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <BackupFacts status={state.value} /> : null}
      {state.kind === 'ready' && state.value.enabled && !state.value.problem ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void runNow()}
          disabled={starting || running}
          data-testid="admin-backup-run"
        >
          {running ? 'Backing up' : 'Run backup now'}
        </button>
      ) : null}
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  )
}

function BackupFacts({ status }: { status: DatabaseBackupStatus }) {
  if (!status.enabled) {
    return (
      <p className="settings__note" data-testid="admin-backups-off">
        Off on this server. Turned on by the deployment&rsquo;s settings:
        docs/recovery/database-backups.md.
      </p>
    )
  }

  if (status.problem) {
    return (
      <p className="notice notice--error" role="alert" data-testid="admin-backups-problem">
        {status.problem}
      </p>
    )
  }

  const last = status.lastAttempt
  return (
    <ul className="adminstats" data-testid="admin-backup-facts">
      <Stat
        label="Last verified backup"
        value={status.lastVerified ? formatDateTime(status.lastVerified.createdAt) : 'None yet'}
        source={
          status.stale
            ? `Stale: older than expected (every ${status.intervalHours} hours).`
            : `Uploaded and read back. Every ${status.intervalHours} hours${status.automatic ? '' : ', manual only'}.`
        }
        testId="stat-backup-last"
      />
      <Stat
        label="Kept"
        value={`${status.verifiedCount} · ${formatBytes(status.storedBytes)}`}
        source={`${status.environment}, ${status.store}. Pruning ${status.pruneEnabled ? 'on' : 'off'}.`}
        testId="stat-backup-kept"
      />
      <Stat
        label="Last attempt"
        value={last ? `${last.outcome}` : 'None since this server started'}
        source={
          last?.error
            ? `${last.error} (${status.consecutiveFailures} in a row)`
            : last
              ? formatDateTime(last.startedAt)
              : 'The schedule checks every 15 minutes.'
        }
        testId="stat-backup-attempt"
      />
    </ul>
  )
}

function Overview({ overview }: { overview: AdminOverview }) {
  const trend = overview.universesCreatedByMonth
  const peak = Math.max(1, ...trend.map((month) => month.count))

  return (
    <>
      <section className="adminsection" aria-labelledby="admin-measured">
        <h2 className="settings__heading" id="admin-measured">
          Measured
        </h2>
        <p className="settings__note" data-testid="admin-generated">
          Counted {formatDateTime(overview.generatedAt)}.
        </p>
        <ul className="adminstats" data-testid="admin-stats">
          <Stat
            label="Accounts"
            value={overview.accounts}
            source="Every account that exists."
            testId="stat-accounts"
          />
          <Stat
            label="Admins"
            value={overview.admins}
            source="Accounts with the Admin role."
            testId="stat-admins"
          />
          <Stat
            label="Blocked accounts"
            value={overview.blockedAccounts}
            source="Blocked now."
            testId="stat-blocked"
          />
          <Stat
            label="Universes"
            value={overview.universes}
            source="Every universe that exists, archived included."
            testId="stat-universes"
          />
          <Stat
            label="Public universes"
            value={overview.publicUniverses}
            source="Published on the portal now."
            testId="stat-public"
          />
          <Stat
            label="Collaborations"
            value={overview.collaborations}
            source="Collaborator places across all universes."
            testId="stat-collaborations"
          />
          <Stat
            label="Stored pictures"
            value={formatBytes(overview.storedImageBytes)}
            source="Originals of Lore pictures, Trash included, as storage allowances count them."
            testId="stat-storage"
          />
          <Stat
            label="Connected AI apps"
            value={overview.connectedApps}
            source="Live MCP connections."
            testId="stat-apps"
          />
        </ul>
      </section>

      <section className="adminsection" aria-labelledby="admin-trend">
        <h2 className="settings__heading" id="admin-trend">
          Universes created per month
        </h2>
        <p className="settings__note">
          By creation date, UTC. Universes deleted since are not counted.
        </p>
        <ol className="admintrend" data-testid="admin-trend">
          {trend.map((month) => (
            <li className="admintrend__row" key={`${month.year}-${month.month}`}>
              <span className="admintrend__month">
                {monthFormatter.format(new Date(Date.UTC(month.year, month.month - 1, 1)))}
              </span>
              <span className="admintrend__bar" aria-hidden="true">
                <span style={{ width: `${(month.count / peak) * 100}%` }} />
              </span>
              <span className="admintrend__count">{month.count}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="adminsection" aria-labelledby="admin-untracked">
        <h2 className="settings__heading" id="admin-untracked">
          Not tracked yet
        </h2>
        <p className="settings__note">
          LoreX does not record these, so nothing is shown in their place.
        </p>
        <ul className="adminstats" data-testid="admin-untracked">
          <Stat
            label="New accounts over time"
            value={NOT_TRACKED}
            source="Accounts carry no creation date."
            testId="stat-new-accounts"
          />
          <Stat
            label="Active users"
            value={NOT_TRACKED}
            source="No sign-in or activity time is recorded."
            testId="stat-active"
          />
          <Stat
            label="Requests and errors"
            value={NOT_TRACKED}
            source="No request telemetry is kept."
            testId="stat-requests"
          />
          <Stat
            label="AI usage and cost"
            value={NOT_TRACKED}
            source="Assistant questions are counted in memory only, per server process."
            testId="stat-ai"
          />
        </ul>
      </section>
    </>
  )
}

// ---------- Users ----------

function UsersScreen() {
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (search === searched) return
    const timer = setTimeout(() => {
      setSearched(search)
      setPage(1)
    }, 150)
    return () => clearTimeout(timer)
  }, [search, searched])

  const load = useCallback(
    (signal: AbortSignal) => listUsers({ search: searched, page }, signal),
    [searched, page],
  )
  const { state, retry } = useLoad(load)
  const result: AdminUserPage | null = state.kind === 'ready' ? state.value : null

  return (
    <>
      <Heading title="Users" lede="Every LoreX account. Universe content is never shown here." />

      <SignUpLink />

      <div className="controls">
        <div className="controls__search">
          <label className="field__label" htmlFor="admin-user-search">
            Find an account
          </label>
          <span className="controls__searchfield">
            <Search className="controls__searchicon" aria-hidden="true" focusable="false" />
            <input
              id="admin-user-search"
              className="field__input"
              type="search"
              placeholder="Username or public name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="admin-user-search"
            />
          </span>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering accounts&hellip;
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}

      {result && result.items.length > 0 ? (
        <>
          <p className="settings__note" role="status" data-testid="admin-user-count">
            {result.totalCount === 1 ? '1 account' : `${result.totalCount} accounts`}
          </p>
          <ul className="adminusers" data-testid="admin-user-grid">
            {result.items.map((user) => (
              <li key={user.id}>
                <article
                  className="adminuser"
                  data-testid="admin-user-card"
                  data-username={user.username}
                >
                  <Avatar image={null} name={user.username} className="adminuser__avatar" />
                  <div className="adminuser__text">
                    <h2 className="adminuser__name" dir="auto">
                      {user.username}
                    </h2>
                    {user.publicDisplayName ? (
                      <p className="adminuser__public" dir="auto">
                        {user.publicDisplayName}
                      </p>
                    ) : null}
                    <p className="adminuser__tags">
                      <span className="admintag">{user.role}</span>
                      {user.isBlocked ? (
                        <span className="admintag admintag--blocked">Blocked</span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    className="button button--secondary adminuser__open"
                    to={`/admin/users/${encodeURIComponent(user.id)}`}
                    aria-label={`View details for ${user.username}`}
                    data-testid="admin-user-open"
                  >
                    View details
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="admin-user-empty"
          title={searched.trim() ? 'No account matches that.' : 'No accounts yet.'}
          hint={searched.trim() ? 'Try another name, or clear the search.' : undefined}
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </>
  )
}

// ---------- One account ----------

function Fact({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="facts__row">
      <dt className="facts__key">{label}</dt>
      <dd
        className={value === NOT_TRACKED ? 'facts__value adminfact--none' : 'facts__value'}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  )
}

function UserScreen() {
  const { userId = '' } = useParams()
  const load = useCallback(
    (signal: AbortSignal) =>
      getUser(userId, signal).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          throw new Error('There is no account with this id.')
        }
        throw error
      }),
    [userId],
  )
  const { state, setState, retry } = useLoad(load)

  return (
    <>
      <p className="adminback">
        <Link to="/admin/users" data-testid="admin-back-users">
          <ActionIcon icon={ArrowLeft} />
          All users
        </Link>
      </p>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Opening the account&hellip;
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? (
        <UserDetail
          user={state.value}
          onChange={(value) => setState({ kind: 'ready', value })}
          onStale={retry}
        />
      ) : null}
    </>
  )
}

function UserDetail({
  user,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const { user: me } = useAuth()

  return (
    <>
      <div className="adminprofile">
        <Avatar image={null} name={user.username} className="adminuser__avatar" />
        <div>
          <h1 className="home__title" dir="auto" data-testid="admin-user-title">
            {user.username}
          </h1>
          {user.publicDisplayName ? (
            <p className="home__lede" dir="auto">
              Public name: {user.publicDisplayName}
            </p>
          ) : null}
        </div>
      </div>

      <section className="adminsection" aria-labelledby="admin-account">
        <h2 className="settings__heading" id="admin-account">
          Account
        </h2>
        <dl className="facts admindetail" data-testid="admin-user-facts">
          <Fact label="User ID" value={<code>{user.id}</code>} testId="admin-user-id" />
          <Fact label="Platform role" value={user.role} testId="admin-user-role" />
          <Fact
            label="Status"
            value={
              user.isBlocked
                ? `Blocked since ${user.blockedAt ? formatDateTime(user.blockedAt) : 'an unknown time'}`
                : 'Active'
            }
            testId="admin-user-status"
          />
          <Fact label="Universes owned" value={user.ownedUniverses} testId="admin-user-owned" />
          <Fact
            label="Universes shared with them"
            value={user.sharedUniverses}
            testId="admin-user-shared"
          />
          <Fact
            label="Storage"
            value={`${formatBytes(user.storageUsedBytes)} used of ${formatBytes(user.storageQuotaBytes)}`}
            testId="admin-user-storage"
          />
          <Fact label="Connected AI apps" value={user.connectedApps} testId="admin-user-apps" />
          <Fact label="Account created" value={NOT_TRACKED} testId="admin-user-created" />
          <Fact label="Last sign-in" value={NOT_TRACKED} testId="admin-user-last-login" />
          <Fact label="Subscription" value={NOT_TRACKED} testId="admin-user-subscription" />
        </dl>
      </section>

      <BlockSection user={user} isSelf={me?.id === user.id} onChange={onChange} onStale={onStale} />

      <section className="adminsection" aria-labelledby="admin-history">
        <h2 className="settings__heading" id="admin-history">
          Admin actions
        </h2>
        {user.history.length === 0 ? (
          <p className="settings__note" data-testid="admin-history-empty">
            No admin action has been taken on this account.
          </p>
        ) : (
          <ol className="adminhistory" data-testid="admin-history">
            {user.history.map((entry) => (
              <li className="adminhistory__item" key={entry.id} data-testid="admin-history-item">
                <p className="adminhistory__line">
                  <strong>{entry.action === 'Block' ? 'Blocked' : 'Unblocked'}</strong> by{' '}
                  {entry.actorUsername ?? 'a removed account'} &middot;{' '}
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                </p>
                <p className="adminhistory__reason" dir="auto">
                  {entry.reason}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

/**
 * A sign-up link for someone with no universe to be invited into. While registration is invitation-only it lets that one
 * address create an account for seven days; with registration open, anyone can already register.
 */
function SignUpLink() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLink(null)
    try {
      const made = await createSignUpLink(email.trim())
      setLink({
        url: `${window.location.origin}/register?invite=${encodeURIComponent(made.token)}`,
        expiresAt: made.expiresAt,
      })
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.email ?? failure.message)
          : 'The link could not be made.',
      )
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-signup-link">
      <h2 className="settings__heading" id="admin-signup-link">
        Sign-up link
      </h2>
      <p className="settings__note">
        For someone to join LoreX while registration is invitation-only. The link lets that email
        address, and only that one, create an account.
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field__label" htmlFor="admin-signup-email">
          Their email address
        </label>
        <input
          id="admin-signup-email"
          className="field__input"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="admin-signup-email"
        />
        {error ? (
          <p className="form__message" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button" type="submit" data-testid="admin-signup-create">
          Make link
        </button>
      </form>
      {link ? (
        <p className="settings__note" role="status">
          Send them this link, valid until {formatDateTime(link.expiresAt)}:{' '}
          <code data-testid="admin-signup-url">{link.url}</code>
        </p>
      ) : null}
    </section>
  )
}

function BlockSection({
  user,
  isSelf,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  isSelf: boolean
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const block = !user.isBlocked

  if (user.role === 'Admin') {
    return (
      <section className="adminsection" aria-labelledby="admin-access">
        <h2 className="settings__heading" id="admin-access">
          Access
        </h2>
        <p className="settings__note" data-testid="admin-block-unavailable">
          {isSelf ? 'This is your account. ' : ''}Admin accounts cannot be blocked, so no Admin can
          lock out themselves or the last Admin.
        </p>
      </section>
    )
  }

  async function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Say why. The reason is kept in the audit record.')
      return
    }
    setError(null)

    const done = await confirmAction({
      title: block ? `Block ${user.username}?` : `Unblock ${user.username}?`,
      message: block
        ? 'They are signed out everywhere at once, cannot sign in, and every AI app they connected is disconnected. Their universes and everything in them stay as they are.'
        : 'They can sign in again. Sessions and AI apps ended by the block do not come back: they sign in and connect again themselves.',
      details: [`Reason: ${trimmed}`],
      confirmLabel: block ? 'Block account' : 'Unblock account',
      busyLabel: block ? 'Blocking…' : 'Unblocking…',
      variant: block ? 'destructive' : 'neutral',
      action: async () => {
        try {
          onChange(await setBlocked(user.id, block, trimmed))
        } catch (failure: unknown) {
          if (failure instanceof ApiError && failure.status === 409) onStale()
          throw failure
        }
      },
    })
    if (done) setReason('')
  }

  return (
    <section
      className={block ? 'adminsection settings__section--danger' : 'adminsection'}
      aria-labelledby="admin-access"
    >
      <h2 className="settings__heading" id="admin-access">
        {block ? 'Block this account' : 'Unblock this account'}
      </h2>
      <p className="settings__note">
        {block
          ? 'Blocking signs them out everywhere, refuses their sign-in and disconnects their AI apps. Nothing they wrote is touched.'
          : 'Unblocking lets them sign in again.'}
      </p>
      <form
        className="adminblock"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="admin-reason">
            Reason (kept in the audit record)
          </label>
          <textarea
            id="admin-reason"
            className="field__input field__input--area"
            rows={3}
            maxLength={500}
            value={reason}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'admin-reason-error' : undefined}
            onChange={(event) => setReason(event.target.value)}
            data-testid="admin-reason"
          />
          {error ? (
            <p className="field__error" id="admin-reason-error" data-testid="admin-reason-error">
              {error}
            </p>
          ) : null}
        </div>
        <button
          className={block ? 'button button--danger' : 'button'}
          type="submit"
          data-testid={block ? 'admin-block' : 'admin-unblock'}
        >
          {block ? 'Block account' : 'Unblock account'}
        </button>
      </form>
    </section>
  )
}

// ---------- Tracing ----------

function TracingScreen() {
  return (
    <>
      <Heading title="Tracing" lede="Request and error tracing for the service." />
      <EmptyState
        testId="admin-tracing-empty"
        title="Tracing is not available yet."
        hint="Block and unblock actions are recorded, with who, why and when, on each account's details."
      />
    </>
  )
}
