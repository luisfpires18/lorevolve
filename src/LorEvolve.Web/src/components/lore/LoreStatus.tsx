import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import type { LoadState } from '../../lore/loreAddress'
import type { ReactNode } from 'react'
import { LoadError } from '../LoadError'
import { ReadGate } from '../ReadGate'
import { CardSkeleton } from '../CardSkeleton'
import { Callout } from '../Callout'
import { useEntrySource } from '../../lore/entrySource'
type Entries = ReturnType<typeof useLoreEntries>
type Selection = ReturnType<typeof useLoreSelection>

/** How many card shapes stand in for the first page while it is read. */
const SKELETON_CARDS = 6

/** What is said around the catalog: the Trash and mass create notices, a types failure, no types, loading and a failed read. */
export function LoreStatus({
  types,
  typesFailed,
  retry,
  trashedNotice,
  massCreated,
  refreshTypes,
  view,
  children,
}: {
  massCreated: number | null
  refreshTypes: ReturnType<typeof useWorkspaceTypes>['refreshTypes']
  view: LoadState
  children: ReactNode
} & Pick<Entries, 'types' | 'typesFailed' | 'retry'> &
  Pick<Selection, 'trashedNotice'>) {
  const { t, tn, tx } = useI18n()
  const entrySource = useEntrySource()
  return (
    <>
      {trashedNotice ? (
        <p className="lore__created" role="status" data-testid="lore-trashed">
          <ActionIcon icon={Check} />
          {trashedNotice} <Link to={entrySource.href.afterRemove}>{t('lore.page.openTrash')}</Link>
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
        <LoadError
          message={t('lore.page.typesFailed')}
          onRetry={() => {
            refreshTypes().catch(() => undefined)
          }}
          retryLabel={t('lore.page.retryTypes')}
          testId="lore-types-error"
        />
      ) : null}

      {/* No types at all leaves nothing to choose: one line to where types are made, not a panel. */}
      {types !== null && types.length === 0 ? (
        <Callout look="notice" as="p" testId="lore-no-types">
          {tx('lore.page.noTypes', {
            link: <Link to={entrySource.href.types}>{t('lore.page.noTypesLink')}</Link>,
          })}
        </Callout>
      ) : null}

      {/* The entries themselves are drawn by the page's results, so ready says nothing here. */}
      {view.kind === 'idle' ? null : (
        <ReadGate
          load={view}
          loading={{
            skeleton: (
              <div className="lore__loading">
                <CardSkeleton
                  shape="tile"
                  className="lore__grid"
                  count={SKELETON_CARDS}
                  announce={t('lore.page.reading')}
                />
              </div>
            ),
          }}
          error={{
            message: t('lore.page.loadFailed'),
            onRetry: retry,
            retryLabel: t('lore.page.retryLore'),
            testId: 'lore-load-error',
          }}
        >
          {() => null}
        </ReadGate>
      )}
    </>
  )
}
