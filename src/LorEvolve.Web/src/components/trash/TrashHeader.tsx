import { t, tx } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import { ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from '../ActionIcon'
import type { TrashItem } from '../../trash/types'
import { PageHeader } from '../PageHeader'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useTrashState } from '../../trash/useTrashState'

/** The Trash's head: what it is for the owner or a member, the way to deleted ideas, and Select. */
export function TrashHeader({
  access,
  universe,
  pageItems,
  busy,
  isSelecting,
  bulkBusy,
  selectToggleRef,
  stopSelecting,
  startSelecting,
}: Pick<ReturnType<typeof useTrashState>, 'isSelecting' | 'bulkBusy' | 'selectToggleRef'> & {
  access: ReturnType<typeof useUniverseAccess>
  universe: WorkspaceContext['universe']
  pageItems: TrashItem[]
  busy: boolean
  stopSelecting: () => void
  startSelecting: () => void
}) {
  return (
    <PageHeader
      title={t('data.trash.title')}
      lede={
        <>
          {access.permanentlyDelete ? (
            <p>{t('data.trash.ledeOwner')}</p>
          ) : (
            <p>{t('data.trash.ledeMember')}</p>
          )}
          {access.keepIdeas ? (
            <p data-testid="trash-ideas-pointer">
              {tx('data.trash.ideasPointer', {
                link: (
                  <Link to={`/app/universes/${universe.id}/ideas?view=deleted`}>
                    {t('data.trash.ideasLink')}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </>
      }
      actions={
        // Selecting is for erasing in bulk, which is the owner's alone (ADR 0041).
        access.permanentlyDelete && (pageItems.length > 0 || isSelecting) ? (
          <button
            ref={selectToggleRef}
            className="button button--secondary trash__select"
            type="button"
            aria-pressed={isSelecting}
            disabled={busy || bulkBusy}
            onClick={() => (isSelecting ? stopSelecting() : startSelecting())}
            data-testid="trash-select"
          >
            <ActionIcon icon={ListChecks} />
            {t('data.trash.select')}
          </button>
        ) : null
      }
    />
  )
}
