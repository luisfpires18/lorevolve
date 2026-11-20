import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getUser } from '../../admin/api'
import { Crumb } from '../Crumb'
import { ApiError } from '../../lib/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { EmptyState } from '../EmptyState'
import { UserDetail } from './UserDetail'
import { ReadGate } from '../ReadGate'

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
      <Crumb
        back
        className="adminback"
        items={[{ to: '/admin/users', label: t('admin.user.all'), testId: 'admin-back-users' }]}
      />

      <ReadGate load={state} loading={{ text: t('admin.user.opening') }} error={{ onRetry: retry }}>
        {(user) =>
          user === null ? (
            <EmptyState title={t('admin.user.notFound')} testId="admin-user-missing" />
          ) : (
            <UserDetail
              user={user}
              onChange={(value) => setState({ kind: 'ready', value })}
              onStale={retry}
            />
          )
        }
      </ReadGate>
    </>
  )
}
