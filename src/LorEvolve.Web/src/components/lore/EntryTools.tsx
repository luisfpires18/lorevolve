import { Link } from 'react-router-dom'
import { Copy, FilePenLine, Network, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { PrivateNotes } from '../PrivateNotes'
import { ContentPublication } from '../ContentPublication'
import type { EntityDetail } from '../../lore/types'
import { useI18n } from '../../i18n'
import type { UniverseCapabilities } from '../../universes/access'

/** The tools on the entry itself: publication, Edit or Suggest, Family tree, the private note and the menu. */
export function EntryTools({
  universe,
  access,
  entityId,
  detail,
  isSaving,
  offersFamilyTree,
  moveToTrash,
  startEditing,
  startSuggesting,
}: {
  universe: { id: string }
  access: UniverseCapabilities
  entityId: string | undefined
  detail: EntityDetail | null
  isSaving: boolean
  offersFamilyTree: boolean
  moveToTrash: () => Promise<void>
  startEditing: () => void
  startSuggesting: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="entry__tools">
      {/* Whether the entry is public, said in a word, and the way to change it - before Edit, because it is
                  state the author should see on arrival, not a tool buried in the menu. */}
      {access.publish ? (
        <ContentPublication
          key={entityId}
          universeId={universe.id}
          kind="entry"
          id={entityId!}
          name={detail?.name ?? ''}
          placement="bar"
        />
      ) : null}
      {access.editContent ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={startEditing}
          disabled={isSaving}
          data-testid="edit-entity"
        >
          <ActionIcon icon={Pencil} />
          {t('entity.page.tools.edit')}
        </button>
      ) : access.suggestChanges ? (
        // A Reviewer's way into the same form, where an Editor's Edit stands. Its icon alone on a phone.
        <button
          className="button button--secondary"
          type="button"
          onClick={startSuggesting}
          title={t('entity.page.tools.suggestTitle')}
          data-testid="suggest-entity"
        >
          <ActionIcon icon={FilePenLine} />
          <span className="entry__toollabel">{t('entity.page.tools.suggestLabel')}</span>
        </button>
      ) : null}
      {/* Offered on an entry whose type the author enabled for Family Tree, and on any entry
                  already holding a family link - never decided by what the type is called (ADR 0040).
                  Its icon alone on a phone, still named, so the tools keep to one line. */}
      {offersFamilyTree ? (
        <Link
          className="button button--text"
          to={`/app/universes/${universe.id}/family-tree/${entityId}`}
          title={t('entity.page.tools.familyTreeTitle')}
          data-testid="entity-family-tree"
        >
          <ActionIcon icon={Network} />
          <span className="entry__toollabel">{t('entity.page.tools.familyTreeLabel')}</span>
        </Link>
      ) : null}
      {/* The owner's private note on the entry (issue 23): a tool on the entry itself, offered to the owner alone,
                  its icon alone on a phone like Family tree - the views line has no room for a second trigger at 390px. */}
      {access.privateNotes ? (
        <PrivateNotes
          universeId={universe.id}
          entityId={entityId!}
          entryName={detail?.name ?? ''}
        />
      ) : null}
      {access.editContent || access.manageTrash ? (
        <ActionMenu
          label={t('entity.page.tools.moreActions', {
            name: detail?.name ?? t('entity.page.tools.moreActionsFallback'),
          })}
          triggerTestId="entity-actions"
        >
          {/* A new entry filled from this one, to change before it is created (Issue #27). */}
          {access.editContent ? (
            <Link
              className="actionmenu__item"
              to={`/app/universes/${universe.id}/lore/new?from=${entityId}`}
              data-testid="duplicate-entity"
            >
              <ActionIcon icon={Copy} />
              {t('entity.page.tools.duplicate')}
            </Link>
          ) : null}
          {access.manageTrash ? (
            <>
              <hr className="actionmenu__divider" />
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                onClick={() => void moveToTrash()}
                disabled={isSaving}
                data-testid="trash-entity"
              >
                <ActionIcon icon={Trash} />
                {t('entity.page.tools.moveToTrash')}
              </button>
            </>
          ) : null}
        </ActionMenu>
      ) : null}
    </div>
  )
}
