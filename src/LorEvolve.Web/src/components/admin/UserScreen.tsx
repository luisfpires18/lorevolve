import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getUser } from '../../admin/api'
import { ActionIcon } from '../ActionIcon'
import { ApiError } from '../../lib/api'
import { useI18n } from '../../i18n'
import { useLoad } from '../../admin/useLoad'
import { Failure } from './Failure'
import { UserDetail } from './UserDetail'

export function UserScreen() {
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
