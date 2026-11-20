import { CardGrid } from '../CardGrid'
import { useCallback, useState } from 'react'
import { listUsers, type AdminUserPage } from '../../admin/api'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { SearchField } from '../SearchField'
import { Pager } from '../Pager'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useI18n } from '../../i18n'
import { ROLE_KEYS } from '../../admin/adminConstants'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { LoadError } from '../LoadError'
import { PageHeader } from '../PageHeader'
import { SignUpLink } from './SignUpLink'
import { Button } from '../Button'
import { LoadingNote } from '../LoadingNote'
import { QuietNote } from '../QuietNote'
import { formatCount } from '../../i18n/format'

// ---------- Users ----------

export function UsersScreen() {
  const { t, tn } = useI18n()
  const [search, setSearch] = useState('')
  const searched = useDebouncedValue(search)
  const [pageFor, setPageFor] = useState(searched)
  const [page, setPage] = useState(1)
  // A new search starts at page 1 in the same render, so one request goes out.
  if (pageFor !== searched) {
    setPageFor(searched)
    setPage(1)
  }

  const load = useCallback(
    (signal: AbortSignal) => listUsers({ search: searched, page }, signal),
    [searched, page],
  )
  const { load: state, retry } = useAsyncRead(load)
  const result: AdminUserPage | null = state.kind === 'ready' ? state.value : null

  return (
    <>
      <PageHeader title={t('admin.users.title')} lede={t('admin.users.lede')} />

      <SignUpLink />

      <div className="controls">
        <SearchField
          className="controls__search"
          id="admin-user-search"
          label={t('admin.users.search.label')}
          placeholder={t('admin.users.search.placeholder')}
          value={search}
          onChange={setSearch}
          testId="admin-user-search"
        />
      </div>

      {state.kind === 'loading' ? <LoadingNote>{t('admin.users.gathering')}</LoadingNote> : null}
      {state.kind === 'error' ? <LoadError message={state.message} onRetry={retry} /> : null}

      {result && result.items.length > 0 ? (
        <>
          <p className="settings__note" role="status" data-testid="admin-user-count">
            {tn('admin.users.count', result.totalCount, { n: formatCount(result.totalCount) })}
          </p>
          <CardGrid min={15} testId="admin-user-grid">
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
                      <QuietNote className="adminuser__public" size="ui" wrap dir="auto">
                        {user.publicDisplayName}
                      </QuietNote>
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
          </CardGrid>
        </>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="admin-user-empty"
          title={searched.trim() ? t('admin.users.empty.noMatch') : t('admin.users.empty.none')}
          hint={searched.trim() ? t('admin.users.empty.hint') : undefined}
        />
      ) : null}

      {result ? <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} /> : null}
    </>
  )
}
