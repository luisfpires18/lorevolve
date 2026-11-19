import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { UniverseCapabilities } from '../../universes/access'
import { Button } from '../Button'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

/** The screens an entry shows instead of itself: missing, no types to make one of, a failed read, and opening. */
export function EntryUnavailable({
  reason,
  universe,
  access,
  setStatus,
  setReads,
}: {
  reason: 'missing' | 'noTypes' | 'error' | 'loading'
  universe: { id: string }
  access: UniverseCapabilities
  setStatus: Dispatch<SetStateAction<'loading' | 'ready' | 'missing' | 'error'>>
  setReads: Dispatch<SetStateAction<number>>
}) {
  const { t, tx } = useI18n()
  if (reason === 'missing') {
    return (
      <EmptyState
        testId="entity-missing"
        title={t('entity.page.missing.title')}
        hint={
          <>
            {access.manageTrash
              ? tx('entity.page.missing.withTrash', {
                  link: (
                    <Link to={`/app/universes/${universe.id}/trash`}>
                      {t('entity.page.missing.trashLink')}
                    </Link>
                  ),
                })
              : t('entity.page.missing.withoutTrash')}{' '}
            <Link to={`/app/universes/${universe.id}/lore`}>{t('entity.page.missing.back')}</Link>
          </>
        }
      />
    )
  }
  if (reason === 'noTypes') {
    return (
      <EmptyState
        testId="entity-no-types"
        title={t('entity.page.noTypes.title')}
        hint={t('entity.page.noTypes.hint')}
        action={
          <Button to={`/app/universes/${universe.id}/types`}>
            {t('entity.page.noTypes.action')}
          </Button>
        }
      />
    )
  }
  if (reason === 'error') {
    return (
      <LoadError
        message={t('entity.page.openFailed')}
        onRetry={() => {
          setStatus('loading')
          setReads((count) => count + 1)
        }}
        retryLabel={t('entity.page.retry')}
      />
    )
  }
  return <LoadingNote>{t('entity.page.opening')}</LoadingNote>
}
