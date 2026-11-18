import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { LoadState } from '../../familyTree/useFamilyTreeState'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'

export function FamilyLoadStates({
  universe,
  view,
  setState,
  setReads,
}: {
  universe: WorkspaceContext['universe']
  view: LoadState | { kind: 'idle' }
  setState: Dispatch<SetStateAction<LoadState>>
  setReads: Dispatch<SetStateAction<number>>
}) {
  const { t, tx } = useI18n()

  return (
    <>
      {view.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('places.familyPage.loading')}
        </p>
      ) : null}

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
        <div className="notice notice--error" role="alert" data-testid="family-error">
          <p>{t('places.familyPage.error')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            {t('places.familyPage.retry')}
          </button>
        </div>
      ) : null}
    </>
  )
}
