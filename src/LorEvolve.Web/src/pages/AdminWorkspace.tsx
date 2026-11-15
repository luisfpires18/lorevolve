import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import {
  getDatabaseBackups,
  getOverview,
  getUser,
  listUsers,
  createSignUpLink,
  emailPasswordReset,
  emailSignUpLink,
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
import { BrandMark } from '../components/BrandMark'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import { ApiError } from '../lib/api'
import { formatBytes } from '../lib/bytes'
import { confirmAction } from '../lib/confirm'
import { formatDateTime } from '../lib/dates'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { FeedbackKind, listFeedback } from '../feedback/api'
import { dateFormat } from '../i18n/format'
import { useI18n } from '../i18n'

/**
 * LorEvolve Admin (#40): the service's own workspace, apart from My workspace and from every universe. Main, Users and
 * Tracing, in My workspace's frame and type. One chunk, fetched only when an Admin opens it; `RequireAdmin` keeps the door
 * and the server refuses every admin request from anyone else.
 *
 * Nothing here reads a universe. Figures are only what LorEvolve records, and what it does not record says so.
 */

type Load<T> =
  { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string }

/** Reads `load` once per change of it (callers memoize it on what it asks for) and again on Try again. */
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const { t } = useI18n()
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
          message: error instanceof Error ? error.message : t('admin.loadFailed'),
        })
      })
    return () => controller.abort()
  }, [load, attempt, t])

  return { state, setState, retry: () => setAttempt((current) => current + 1) }
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="notice notice--error" role="alert">
      <p>{message}</p>
      <button className="button button--secondary" type="button" onClick={onRetry}>
        {t('admin.tryAgain')}
      </button>
    </div>
  )
}

// A cell with nothing to show. These stay symbols so the check never depends on the words, which change with the language.
const NOT_TRACKED = Symbol('not tracked')
const NOT_RECORDED = Symbol('not recorded')

// Wire values from the server, mapped to the words they show as.
const ROLE_KEYS = {
  Member: 'admin.role.member',
  Admin: 'admin.role.admin',
} as const

const OUTCOME_KEYS = {
  Running: 'admin.backups.outcome.running',
  Succeeded: 'admin.backups.outcome.succeeded',
  Failed: 'admin.backups.outcome.failed',
} as const

const HISTORY_KEYS = {
  Block: 'admin.history.blocked',
  Unblock: 'admin.history.unblocked',
  PasswordResetSent: 'admin.history.passwordResetSent',
} as const

function screenTitleKey(pathname: string) {
  if (pathname.startsWith('/admin/users')) return 'admin.documentTitle.users' as const
  if (pathname.startsWith('/admin/tracing')) return 'admin.documentTitle.tracing' as const
  if (pathname.startsWith('/admin/feedback')) return 'admin.documentTitle.feedback' as const
  return 'admin.documentTitle.main' as const
}

export default function AdminWorkspace() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  useDocumentTitle(t(screenTitleKey(pathname)), t('admin.documentTitle.admin'))

  return (
    <div className="home">
      <header className="workspacebar">
        <Link
          className="home__brand workspacebar__brand"
          to="/"
          aria-label={t('shell.brand.homeLabel')}
        >
          <BrandMark />
          <Wordmark />
        </Link>

        <nav className="workspacebar__nav" aria-label={t('admin.nav.label')}>
          <span className="workspacebar__context" aria-hidden="true">
            {t('admin.nav.context')}
          </span>
          <ul className="workspacebar__links">
            <li>
              <NavLink className="workspacebar__link" to="/admin" end data-testid="admin-nav-main">
                {t('admin.nav.main')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/users"
                data-testid="admin-nav-users"
              >
                {t('admin.nav.users')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/feedback"
                data-testid="admin-nav-feedback"
              >
                {t('admin.nav.feedback')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/tracing"
                data-testid="admin-nav-tracing"
              >
                {t('admin.nav.tracing')}
              </NavLink>
            </li>
          </ul>
        </nav>

        <Link className="workspacebar__explore" to="/app" data-testid="admin-my-workspace">
          {t('admin.nav.myWorkspace')}
        </Link>
        <AccountMenu variant="bar" />
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Routes>
          <Route index element={<MainScreen />} />
          <Route path="users" element={<UsersScreen />} />
          <Route path="users/:userId" element={<UserScreen />} />
          <Route path="tracing" element={<TracingScreen />} />
          <Route path="feedback" element={<FeedbackScreen />} />
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

const MONTH: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}

function Stat({
  label,
  value,
  source,
  testId,
}: {
  label: string
  value: ReactNode | typeof NOT_TRACKED
  source: string
  testId: string
}) {
  const { t } = useI18n()
  const tracked = value !== NOT_TRACKED
  return (
    <li className="adminstat" data-testid={testId} data-tracked={tracked}>
      <span className="adminstat__label">{label}</span>
      <span
        className={tracked ? 'adminstat__value' : 'adminstat__value adminstat__value--none'}
        data-testid={`${testId}-value`}
      >
        {value === NOT_TRACKED ? t('admin.untracked.value') : value}
      </span>
      <span className="adminstat__source">{source}</span>
    </li>
  )
}

function MainScreen() {
  const { t } = useI18n()
  const { state, retry } = useLoad(getOverview)

  return (
    <>
      <Heading title={t('admin.main.title')} lede={t('admin.main.lede')} />

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.main.counting')}
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
  const { t } = useI18n()
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
      setMessage(error instanceof Error ? error.message : t('admin.backups.startFailed'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-backups" data-testid="admin-backups">
      <h2 className="settings__heading" id="admin-backups">
        {t('admin.backups.heading')}
      </h2>
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.backups.reading')}
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
          {running ? t('admin.backups.backingUp') : t('admin.backups.runNow')}
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
  const { t } = useI18n()

  if (!status.enabled) {
    return (
      <p className="settings__note" data-testid="admin-backups-off">
        {t('admin.backups.off')}
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
        label={t('admin.backups.lastVerified.label')}
        value={
          status.lastVerified
            ? formatDateTime(status.lastVerified.createdAt)
            : t('admin.backups.lastVerified.none')
        }
        source={
          status.stale
            ? t('admin.backups.lastVerified.stale', { hours: status.intervalHours })
            : t(
                status.automatic
                  ? 'admin.backups.lastVerified.fresh'
                  : 'admin.backups.lastVerified.freshManual',
                { hours: status.intervalHours },
              )
        }
        testId="stat-backup-last"
      />
      <Stat
        label={t('admin.backups.kept.label')}
        value={t('admin.backups.kept.value', {
          verified: status.verifiedCount,
          size: formatBytes(status.storedBytes),
        })}
        source={t(
          status.pruneEnabled ? 'admin.backups.kept.pruningOn' : 'admin.backups.kept.pruningOff',
          { environment: String(status.environment), store: String(status.store) },
        )}
        testId="stat-backup-kept"
      />
      <Stat
        label={t('admin.backups.attempt.label')}
        value={last ? t(OUTCOME_KEYS[last.outcome]) : t('admin.backups.attempt.none')}
        source={
          last?.error
            ? t('admin.backups.attempt.failures', {
                error: last.error,
                count: status.consecutiveFailures,
              })
            : last
              ? formatDateTime(last.startedAt)
              : t('admin.backups.attempt.schedule')
        }
        testId="stat-backup-attempt"
      />
    </ul>
  )
}

function Overview({ overview }: { overview: AdminOverview }) {
  const { t } = useI18n()
  const trend = overview.universesCreatedByMonth
  const peak = Math.max(1, ...trend.map((month) => month.count))

  return (
    <>
      <section className="adminsection" aria-labelledby="admin-measured">
        <h2 className="settings__heading" id="admin-measured">
          {t('admin.main.measured')}
        </h2>
        <p className="settings__note" data-testid="admin-generated">
          {t('admin.main.counted', { time: formatDateTime(overview.generatedAt) })}
        </p>
        <ul className="adminstats" data-testid="admin-stats">
          <Stat
            label={t('admin.main.stats.accounts.label')}
            value={overview.accounts}
            source={t('admin.main.stats.accounts.source')}
            testId="stat-accounts"
          />
          <Stat
            label={t('admin.main.stats.admins.label')}
            value={overview.admins}
            source={t('admin.main.stats.admins.source')}
            testId="stat-admins"
          />
          <Stat
            label={t('admin.main.stats.blocked.label')}
            value={overview.blockedAccounts}
            source={t('admin.main.stats.blocked.source')}
            testId="stat-blocked"
          />
          <Stat
            label={t('admin.main.stats.universes.label')}
            value={overview.universes}
            source={t('admin.main.stats.universes.source')}
            testId="stat-universes"
          />
          <Stat
            label={t('admin.main.stats.public.label')}
            value={overview.publicUniverses}
            source={t('admin.main.stats.public.source')}
            testId="stat-public"
          />
          <Stat
            label={t('admin.main.stats.collaborations.label')}
            value={overview.collaborations}
            source={t('admin.main.stats.collaborations.source')}
            testId="stat-collaborations"
          />
          <Stat
            label={t('admin.main.stats.storage.label')}
            value={formatBytes(overview.storedImageBytes)}
            source={t('admin.main.stats.storage.source')}
            testId="stat-storage"
          />
          <Stat
            label={t('admin.main.stats.apps.label')}
            value={overview.connectedApps}
            source={t('admin.main.stats.apps.source')}
            testId="stat-apps"
          />
        </ul>
      </section>

      <section className="adminsection" aria-labelledby="admin-trend">
        <h2 className="settings__heading" id="admin-trend">
          {t('admin.main.trend.heading')}
        </h2>
        <p className="settings__note">{t('admin.main.trend.note')}</p>
        <ol className="admintrend" data-testid="admin-trend">
          {trend.map((month) => (
            <li className="admintrend__row" key={`${month.year}-${month.month}`}>
              <span className="admintrend__month">
                {dateFormat(MONTH).format(new Date(Date.UTC(month.year, month.month - 1, 1)))}
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
          {t('admin.untracked.heading')}
        </h2>
        <p className="settings__note">{t('admin.untracked.note')}</p>
        <ul className="adminstats" data-testid="admin-untracked">
          <Stat
            label={t('admin.untracked.newAccounts.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.newAccounts.source')}
            testId="stat-new-accounts"
          />
          <Stat
            label={t('admin.untracked.active.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.active.source')}
            testId="stat-active"
          />
          <Stat
            label={t('admin.untracked.requests.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.requests.source')}
            testId="stat-requests"
          />
          <Stat
            label={t('admin.untracked.ai.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.ai.source')}
            testId="stat-ai"
          />
        </ul>
      </section>
    </>
  )
}

// ---------- Users ----------

function UsersScreen() {
  const { t, tn } = useI18n()
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
      <Heading title={t('admin.users.title')} lede={t('admin.users.lede')} />

      <SignUpLink />

      <div className="controls">
        <div className="controls__search">
          <label className="field__label" htmlFor="admin-user-search">
            {t('admin.users.search.label')}
          </label>
          <span className="controls__searchfield">
            <Search
              className="controls__searchicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <input
              id="admin-user-search"
              className="field__input"
              type="search"
              placeholder={t('admin.users.search.placeholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="admin-user-search"
            />
          </span>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.users.gathering')}
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}

      {result && result.items.length > 0 ? (
        <>
          <p className="settings__note" role="status" data-testid="admin-user-count">
            {tn('admin.users.count', result.totalCount, { n: result.totalCount })}
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
                      <span className="admintag">{t(ROLE_KEYS[user.role])}</span>
                      {user.isBlocked ? (
                        <span className="admintag admintag--blocked">
                          {t('admin.users.blocked')}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    className="button button--secondary adminuser__open"
                    to={`/admin/users/${encodeURIComponent(user.id)}`}
                    aria-label={t('admin.users.viewDetailsFor', { username: user.username })}
                    data-testid="admin-user-open"
                  >
                    {t('admin.users.viewDetails')}
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
          title={searched.trim() ? t('admin.users.empty.noMatch') : t('admin.users.empty.none')}
          hint={searched.trim() ? t('admin.users.empty.hint') : undefined}
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('admin.users.pager.label')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('admin.users.pager.previous')}
          </button>
          <span className="pager__position">
            {t('admin.users.pager.position', { page: result.page, total: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('admin.users.pager.next')}
          </button>
        </nav>
      ) : null}
    </>
  )
}

// ---------- One account ----------

function Fact({
  label,
  value,
  testId,
}: {
  label: string
  value: ReactNode | typeof NOT_TRACKED | typeof NOT_RECORDED
  testId: string
}) {
  const { t } = useI18n()
  return (
    <div className="facts__row">
      <dt className="facts__key">{label}</dt>
      <dd
        className={
          value === NOT_TRACKED || value === NOT_RECORDED
            ? 'facts__value adminfact--none'
            : 'facts__value'
        }
        data-testid={testId}
      >
        {value === NOT_TRACKED
          ? t('admin.untracked.value')
          : value === NOT_RECORDED
            ? t('admin.user.beforeRecords')
            : value}
      </dd>
    </div>
  )
}

function UserScreen() {
  const { t } = useI18n()
  const { userId = '' } = useParams()
  const load = useCallback(
    (signal: AbortSignal) =>
      getUser(userId, signal).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          throw new Error(t('admin.user.notFound'))
        }
        throw error
      }),
    [userId, t],
  )
  const { state, setState, retry } = useLoad(load)

  return (
    <>
      <p className="adminback">
        <Link to="/admin/users" data-testid="admin-back-users">
          <ActionIcon icon={ArrowLeft} />
          {t('admin.user.all')}
        </Link>
      </p>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.user.opening')}
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
  const { t, tx } = useI18n()
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
              {t('admin.user.publicName', { name: user.publicDisplayName })}
            </p>
          ) : null}
        </div>
      </div>

      <section className="adminsection" aria-labelledby="admin-account">
        <h2 className="settings__heading" id="admin-account">
          {t('admin.user.account.heading')}
        </h2>
        <dl className="facts admindetail" data-testid="admin-user-facts">
          <Fact
            label={t('admin.user.account.id')}
            value={<code>{user.id}</code>}
            testId="admin-user-id"
          />
          <Fact
            label={t('admin.user.account.email')}
            value={user.email}
            testId="admin-user-email"
          />
          <Fact
            label={t('admin.user.account.role')}
            value={t(ROLE_KEYS[user.role])}
            testId="admin-user-role"
          />
          <Fact
            label={t('admin.user.account.status')}
            value={
              user.isBlocked
                ? user.blockedAt
                  ? t('admin.user.account.blockedSince', { time: formatDateTime(user.blockedAt) })
                  : t('admin.user.account.blockedSinceUnknown')
                : t('admin.user.account.active')
            }
            testId="admin-user-status"
          />
          <Fact
            label={t('admin.user.account.owned')}
            value={user.ownedUniverses}
            testId="admin-user-owned"
          />
          <Fact
            label={t('admin.user.account.shared')}
            value={user.sharedUniverses}
            testId="admin-user-shared"
          />
          <Fact
            label={t('admin.user.account.storage')}
            value={t('admin.user.account.storageValue', {
              used: formatBytes(user.storageUsedBytes),
              quota: formatBytes(user.storageQuotaBytes),
            })}
            testId="admin-user-storage"
          />
          <Fact
            label={t('admin.user.account.created')}
            value={user.createdAt ? formatDateTime(user.createdAt) : NOT_RECORDED}
            testId="admin-user-created"
          />
          <Fact
            label={t('admin.user.account.subscription')}
            value={NOT_TRACKED}
            testId="admin-user-subscription"
          />
        </dl>
      </section>

      <section className="adminsection" aria-labelledby="admin-sign-in">
        <h2 className="settings__heading" id="admin-sign-in">
          {t('admin.user.signIn.heading')}
        </h2>
        <dl className="facts admindetail" data-testid="admin-user-sign-in">
          <Fact
            label={t('admin.user.signIn.last')}
            value={user.lastSignInAt ? formatDateTime(user.lastSignInAt) : NOT_RECORDED}
            testId="admin-user-last-login"
          />
          <Fact
            label={t('admin.user.signIn.failed')}
            value={user.failedSignInAttempts}
            testId="admin-user-failed"
          />
          <Fact
            label={t('admin.user.signIn.lockout')}
            value={
              user.lockedOutUntil
                ? t('admin.user.signIn.lockedUntil', { time: formatDateTime(user.lockedOutUntil) })
                : t('admin.user.signIn.lockoutNone')
            }
            testId="admin-user-lockout"
          />
          <Fact
            label={t('admin.user.signIn.apps')}
            value={user.connectedApps}
            testId="admin-user-apps"
          />
          <Fact
            label={t('admin.user.signIn.appsUsed')}
            value={
              user.appLastUsedAt
                ? formatDateTime(user.appLastUsedAt)
                : t('admin.user.signIn.appsNever')
            }
            testId="admin-user-apps-used"
          />
        </dl>
      </section>

      <BlockSection user={user} isSelf={me?.id === user.id} onChange={onChange} onStale={onStale} />

      <PasswordSection user={user} onChange={onChange} onStale={onStale} />

      <section className="adminsection" aria-labelledby="admin-history">
        <h2 className="settings__heading" id="admin-history">
          {t('admin.history.heading')}
        </h2>
        {user.history.length === 0 ? (
          <p className="settings__note" data-testid="admin-history-empty">
            {t('admin.history.empty')}
          </p>
        ) : (
          <ol className="adminhistory" data-testid="admin-history">
            {user.history.map((entry) => (
              <li className="adminhistory__item" key={entry.id} data-testid="admin-history-item">
                <p className="adminhistory__line">
                  {tx('admin.history.line', {
                    action: <strong>{t(HISTORY_KEYS[entry.action])}</strong>,
                    actor: entry.actorUsername ?? t('admin.history.removedActor'),
                    time: <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>,
                  })}
                </p>
                {entry.reason ? (
                  <p className="adminhistory__reason" dir="auto">
                    {entry.reason}
                  </p>
                ) : null}
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
  const { t, tx } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [sent, setSent] = useState<{ to: string; expiresAt: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function sendEmail() {
    setError(null)
    setLink(null)
    setSent(null)
    setSending(true)
    try {
      const made = await emailSignUpLink(email.trim())
      setSent({ to: email.trim(), expiresAt: made.expiresAt })
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.email ?? failure.message)
          : t('admin.signUp.emailFailed'),
      )
    } finally {
      setSending(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLink(null)
    setSent(null)
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
          : t('admin.signUp.linkFailed'),
      )
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-signup-link">
      <h2 className="settings__heading" id="admin-signup-link">
        {t('admin.signUp.heading')}
      </h2>
      <p className="settings__note">{t('admin.signUp.note')}</p>
      <form className="form" onSubmit={submit} noValidate>
        <Field
          label={t('admin.signUp.emailLabel')}
          name="admin-signup-email"
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
        <div className="form__actions">
          <button
            className="button"
            type="button"
            onClick={() => void sendEmail()}
            disabled={sending}
            aria-busy={sending}
            data-testid="admin-signup-email-send"
          >
            {sending ? t('admin.signUp.sending') : t('admin.signUp.emailLink')}
          </button>
          <button
            className="button button--secondary"
            type="submit"
            disabled={sending}
            data-testid="admin-signup-create"
          >
            {t('admin.signUp.makeLink')}
          </button>
        </div>
      </form>
      {sent ? (
        <p className="settings__note" role="status" data-testid="admin-signup-sent">
          {tx('admin.signUp.sent', {
            to: <bdi>{sent.to}</bdi>,
            time: formatDateTime(sent.expiresAt),
          })}
        </p>
      ) : null}
      {link ? (
        <p className="settings__note" role="status">
          {tx('admin.signUp.link', {
            time: formatDateTime(link.expiresAt),
            url: <code data-testid="admin-signup-url">{link.url}</code>,
          })}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Forgot password on the account's behalf (#69): LorEvolve emails the account its own reset link. The Admin sees
 * neither the address nor the link, and the send goes into the account's history.
 */
function PasswordSection({
  user,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const { t } = useI18n()
  const [sent, setSent] = useState(false)

  async function send() {
    setSent(false)
    const done = await confirmAction({
      title: t('admin.password.confirmTitle', { username: user.username }),
      message: t('admin.password.confirmMessage'),
      confirmLabel: t('admin.password.confirmLabel'),
      busyLabel: t('admin.password.busy'),
      variant: 'neutral',
      action: async () => {
        try {
          onChange(await emailPasswordReset(user.id))
        } catch (failure: unknown) {
          if (failure instanceof ApiError && failure.status === 409) onStale()
          throw failure
        }
      },
    })
    if (done) setSent(true)
  }

  return (
    <section className="adminsection" aria-labelledby="admin-password">
      <h2 className="settings__heading" id="admin-password">
        {t('admin.password.heading')}
      </h2>
      <p className="settings__note">
        {user.isBlocked ? t('admin.password.noteBlocked') : t('admin.password.note')}
      </p>
      <div className="form__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={user.isBlocked}
          onClick={() => void send()}
          data-testid="admin-password-reset"
        >
          {t('admin.password.send')}
        </button>
      </div>
      {sent ? (
        <p className="settings__note" role="status" data-testid="admin-password-reset-sent">
          {t('admin.password.sent')}
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
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const block = !user.isBlocked

  if (user.role === 'Admin') {
    return (
      <section className="adminsection" aria-labelledby="admin-access">
        <h2 className="settings__heading" id="admin-access">
          {t('admin.block.access')}
        </h2>
        <p className="settings__note" data-testid="admin-block-unavailable">
          {t(isSelf ? 'admin.block.unavailableSelf' : 'admin.block.unavailable')}
        </p>
      </section>
    )
  }

  async function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError(t('admin.block.reasonRequired'))
      return
    }
    setError(null)

    const done = await confirmAction({
      title: t(block ? 'admin.block.block.confirmTitle' : 'admin.block.unblock.confirmTitle', {
        username: user.username,
      }),
      message: t(block ? 'admin.block.block.confirmMessage' : 'admin.block.unblock.confirmMessage'),
      details: [t('admin.block.reasonDetail', { reason: trimmed })],
      confirmLabel: t(
        block ? 'admin.block.block.confirmLabel' : 'admin.block.unblock.confirmLabel',
      ),
      busyLabel: t(block ? 'admin.block.block.busy' : 'admin.block.unblock.busy'),
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
        {t(block ? 'admin.block.block.heading' : 'admin.block.unblock.heading')}
      </h2>
      <p className="settings__note">
        {t(block ? 'admin.block.block.note' : 'admin.block.unblock.note')}
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
            {t('admin.block.reasonLabel')}
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
          className={block ? 'button button--secondary button--danger-quiet' : 'button'}
          type="submit"
          data-testid={block ? 'admin-block' : 'admin-unblock'}
        >
          {t(block ? 'admin.block.block.submit' : 'admin.block.unblock.submit')}
        </button>
      </form>
    </section>
  )
}

// ---------- Tracing ----------

function TracingScreen() {
  const { t } = useI18n()
  return (
    <>
      <Heading title={t('admin.tracing.title')} lede={t('admin.tracing.lede')} />
      <EmptyState
        testId="admin-tracing-empty"
        title={t('admin.tracing.emptyTitle')}
        hint={t('admin.tracing.emptyHint')}
      />
    </>
  )
}

/** Bug reports and feature requests from the button on every signed-in page, newest first. Read only. */
function FeedbackScreen() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listFeedback(page, signal), [page])
  const { state, retry } = useLoad(load)

  return (
    <>
      <Heading title={t('admin.feedback.title')} lede={t('admin.feedback.lede')} />
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.feedback.reading')}
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' && state.value.items.length === 0 ? (
        <EmptyState testId="admin-feedback-empty" title={t('admin.feedback.empty')} />
      ) : null}
      {state.kind === 'ready' && state.value.items.length > 0 ? (
        <>
          <ul className="feedbackreports" data-testid="admin-feedback">
            {state.value.items.map((report) => (
              <li className="feedbackreport" key={report.id} data-testid="admin-feedback-report">
                <p className="feedbackreport__meta">
                  <strong>
                    {report.kind === FeedbackKind.Bug
                      ? t('admin.feedback.bug')
                      : t('admin.feedback.featureRequest')}
                  </strong>
                  {' · '}
                  <bdi>{report.userName ?? t('admin.feedback.removedAccount')}</bdi>
                  {' · '}
                  {formatDateTime(report.createdAt)}
                  {report.page ? (
                    <>
                      {' · '}
                      <code>{report.page}</code>
                    </>
                  ) : null}
                </p>
                <p className="feedbackreport__text" dir="auto">
                  {report.text}
                </p>
              </li>
            ))}
          </ul>
          {state.value.totalCount > state.value.pageSize ? (
            <nav className="pager" aria-label={t('admin.feedback.pager.label')}>
              <button
                className="button button--secondary"
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('admin.feedback.pager.newer')}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={page * state.value.pageSize >= state.value.totalCount}
                onClick={() => setPage(page + 1)}
              >
                {t('admin.feedback.pager.older')}
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  )
}
