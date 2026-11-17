import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import type { LoadState } from '../../lore/loreAddress'
import type { ReactNode } from 'react'
type Entries = ReturnType<typeof useLoreEntries>
type Selection = ReturnType<typeof useLoreSelection>

/** How many card shapes stand in for the first page while it is read. */
const SKELETON_CARDS = 6

/** What is said around the catalog: the Trash and mass create notices, a types failure, no types, loading and a failed read. */
export function LoreStatus({
  types,
  typesFailed,
  setState,
  setReads,
  trashedNotice,
  universe,
  massCreated,
  refreshTypes,
  view,
  children,
}: {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  massCreated: number | null
  refreshTypes: ReturnType<typeof useWorkspaceTypes>['refreshTypes']
  view: LoadState
  children: ReactNode
} & Pick<Entries, 'types' | 'typesFailed' | 'setState' | 'setReads'> &
  Pick<Selection, 'trashedNotice'>) {
  const { t, tn, tx } = useI18n()
  return (
    <>
      {trashedNotice ? (
        <p className="lore__created" role="status" data-testid="lore-trashed">
          <ActionIcon icon={Check} />
          {trashedNotice}{' '}
          <Link to={`/app/universes/${universe.id}/trash`}>{t('lore.page.openTrash')}</Link>
        </p>
      ) : null}

      {massCreated !== null ? (
        <p className="lore__created" role="status" data-testid="lore-mass-created">
          <ActionIcon icon={Check} />
          {tn('lore.page.created', massCreated, { n: massCreated })}
        </p>
      ) : null}

      {children}

      {typesFailed ? (
        <div className="notice notice--error" role="alert" data-testid="lore-types-error">
          <p>{t('lore.page.typesFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              refreshTypes().catch(() => undefined)
            }}
          >
            {t('lore.page.retryTypes')}
          </button>
        </div>
      ) : null}

      {/* No types at all leaves nothing to choose: one line to where types are made, not a panel. */}
      {types !== null && types.length === 0 ? (
        <p className="notice" data-testid="lore-no-types">
          {tx('lore.page.noTypes', {
            link: (
              <Link to={`/app/universes/${universe.id}/types`}>{t('lore.page.noTypesLink')}</Link>
            ),
          })}
        </p>
      ) : null}

      {view.kind === 'loading' ? (
        <div className="lore__loading">
          <p className="visually-hidden" role="status">
            {t('lore.page.reading')}
          </p>
          <ul className="cardgrid lore__skeleton" aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li className="skeletoncard" key={index}>
                <span className="skeleton skeletoncard__tile" />
                <span className="skeletoncard__lines">
                  <span className="skeleton skeletoncard__line" />
                  <span className="skeleton skeletoncard__line skeletoncard__line--short" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="lore-load-error">
          <p>{t('lore.page.loadFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((count) => count + 1)
            }}
          >
            {t('lore.page.retryLore')}
          </button>
        </div>
      ) : null}
    </>
  )
}
