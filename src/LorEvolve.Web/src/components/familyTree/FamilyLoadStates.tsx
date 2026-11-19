import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { FamilyTree } from '../../familyTree/types'
import type { Load } from '../../lib/useAsyncRead'
import type { FamilyView } from '../../familyTree/useFamilyTreeState'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

export function FamilyLoadStates({
  universe,
  view,
  setState,
  setReads,
}: {
  universe: WorkspaceContext['universe']
  view: FamilyView
  setState: Dispatch<SetStateAction<Load<FamilyTree>>>
  setReads: Dispatch<SetStateAction<number>>
}) {
  const { t, tx } = useI18n()

  return (
    <>
      {view.kind === 'loading' ? <LoadingNote>{t('places.familyPage.loading')}</LoadingNote> : null}

      {view.kind === 'missing' ? (
        <EmptyState
          testId="family-missing"
          title={t('places.familyPage.missingTitle')}
          hint={tx('places.familyPage.missingHint', {
            link: (
              <Link to={`/app/universes/${universe.id}/lore`}>
                {t('places.familyPage.missingLink')}
              </Link>
            ),
          })}
        />
      ) : null}

      {view.kind === 'error' ? (
        <LoadError
          message={t('places.familyPage.error')}
          onRetry={() => {
            setState({ kind: 'loading' })
            setReads((current) => current + 1)
          }}
          retryLabel={t('places.familyPage.retry')}
          testId="family-error"
        />
      ) : null}
    </>
  )
}
