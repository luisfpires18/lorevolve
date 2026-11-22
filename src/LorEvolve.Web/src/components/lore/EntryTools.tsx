import { Copy, FilePenLine, Network, Pencil } from 'lucide-react'
import { ActionMenuItem } from '../ActionMenu'
import { RowMenu } from '../RowMenu'
import { PrivateNotes } from '../PrivateNotes'
import { ContentPublication } from '../ContentPublication'
import type { EntityDetail } from '../../lore/types'
import { useI18n } from '../../i18n'
import type { UniverseCapabilities } from '../../universes/access'
import { Button } from '../Button'
import { useEntrySource } from '../../lore/entrySource'

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
  const entrySource = useEntrySource()
  return (
    <>
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
        <Button
          tone="secondary"
          icon={Pencil}
          onClick={startEditing}
          disabled={isSaving}
          data-testid="edit-entity"
        >
          {t('entity.page.tools.edit')}
        </Button>
      ) : access.suggestChanges ? (
        // A Reviewer's way into the same form, where an Editor's Edit stands. Its icon alone on a phone.
        <Button
          tone="secondary"
          icon={FilePenLine}
          onClick={startSuggesting}
          title={t('entity.page.tools.suggestTitle')}
          data-testid="suggest-entity"
        >
          <span className="entry__toollabel">{t('entity.page.tools.suggestLabel')}</span>
        </Button>
      ) : null}
      {/* Offered on an entry whose type the author enabled for Family Tree, and on any entry
                  already holding a family link - never decided by what the type is called (ADR 0040).
                  Its icon alone on a phone, still named, so the tools keep to one line. */}
      {offersFamilyTree ? (
        <Button
          tone="text"
          icon={Network}
          to={`/app/universes/${universe.id}/family-tree/${entityId}`}
          title={t('entity.page.tools.familyTreeTitle')}
          data-testid="entity-family-tree"
        >
          <span className="entry__toollabel">{t('entity.page.tools.familyTreeLabel')}</span>
        </Button>
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
        <RowMenu
          label={t('entity.page.tools.moreActions', {
            name: detail?.name ?? t('entity.page.tools.moreActionsFallback'),
          })}
          triggerTestId="entity-actions"
          divided
          onRemove={access.manageTrash ? () => void moveToTrash() : undefined}
          busy={isSaving}
          removeLabel={t('entity.page.tools.moveToTrash')}
          removeTestId="trash-entity"
        >
          {/* A new entry filled from this one, to change before it is created (Issue #27). */}
          {access.editContent ? (
            <ActionMenuItem
              icon={Copy}
              to={`${entrySource.href.create()}?from=${entityId}`}
              testId="duplicate-entity"
            >
              {t('entity.page.tools.duplicate')}
            </ActionMenuItem>
          ) : null}
        </RowMenu>
      ) : null}
    </>
  )
}
