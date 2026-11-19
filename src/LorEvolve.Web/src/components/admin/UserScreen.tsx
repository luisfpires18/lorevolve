import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getUser } from '../../admin/api'
import { ActionIcon } from '../ActionIcon'
import { ApiError } from '../../lib/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { EmptyState } from '../EmptyState'
import { LoadError } from '../LoadError'
import { UserDetail } from './UserDetail'
import { LoadingNote } from '../LoadingNote'

export function UserScreen() {
  const { t } = useI18n()
  const { userId = '' } = useParams()
  const load = useCallback(
    (signal: AbortSignal) =>
      getUser(userId, signal).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }),
    [userId],
  )
  const { load: state, setLoad: setState, retry } = useAsyncRead(load)

  return (
    <>
      <p className="adminback">
        <Link to="/admin/users" data-testid="admin-back-users">
          <ActionIcon icon={ArrowLeft} />
          {t('admin.user.all')}
        </Link>
      </p>

      {state.kind === 'loading' ? <LoadingNote>{t('admin.user.opening')}</LoadingNote> : null}
      {state.kind === 'error' ? <LoadError message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' && state.value === null ? (
        <EmptyState title={t('admin.user.notFound')} testId="admin-user-missing" />
      ) : null}
      {state.kind === 'ready' && state.value !== null ? (
        <UserDetail
          user={state.value}
          onChange={(value) => setState({ kind: 'ready', value })}
          onStale={retry}
        />
      ) : null}
    </>
  )
}
