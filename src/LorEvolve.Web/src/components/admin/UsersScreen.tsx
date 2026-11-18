import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { listUsers, type AdminUserPage } from '../../admin/api'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { ROLE_KEYS } from '../../admin/adminConstants'
import { useLoad } from '../../admin/useLoad'
import { Failure } from './Failure'
import { Heading } from './Heading'
import { SignUpLink } from './SignUpLink'
import { Button } from '../Button'

// ---------- Users ----------

export function UsersScreen() {
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
        <Field
          className="controls__search"
          id="admin-user-search"
          label={t('admin.users.search.label')}
        >
          {(control) => (
            <span className="controls__searchfield">
              <Search
                className="controls__searchicon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
              <input
                {...control}
                className="field__input"
                type="search"
                placeholder={t('admin.users.search.placeholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="admin-user-search"
              />
            </span>
          )}
        </Field>
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
                  <Button
                    tone="secondary"
                    className="adminuser__open"
                    to={`/admin/users/${encodeURIComponent(user.id)}`}
                    aria-label={t('admin.users.viewDetailsFor', { username: user.username })}
                    data-testid="admin-user-open"
                  >
                    {t('admin.users.viewDetails')}
                  </Button>
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
          <Button
            tone="secondary"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('admin.users.pager.previous')}
          </Button>
          <span className="pager__position">
            {t('admin.users.pager.position', { page: result.page, total: result.totalPages })}
          </span>
          <Button
            tone="secondary"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('admin.users.pager.next')}
          </Button>
        </nav>
      ) : null}
    </>
  )
}
