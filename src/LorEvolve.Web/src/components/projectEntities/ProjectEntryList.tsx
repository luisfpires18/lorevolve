import { deleteProjectEntity } from '../../projectEntities/api'
import { confirmAction } from '../../lib/confirm'
import {
  FieldKind,
  type ProjectEntitySummary,
  type ProjectField,
} from '../../projectEntities/types'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { EntityCard } from '../EntityCard'
import { CardGrid } from '../CardGrid'
import { t, useI18n } from '../../i18n'
import type { useProjectEntriesRead } from '../../projectEntities/useProjectEntriesRead'
import type { useProjectEntriesState } from '../../projectEntities/useProjectEntriesState'
import { EntryPictures } from './EntryPictures'
import { Trash } from 'lucide-react'

/** The entries as cards, each opening to its own form and pictures. */
export function ProjectEntryList({
  projectId,
  universeId,
  openEntryId,
  entryHref,
  entries,
  busy,
  setBusy,
  refresh,
  failing,
  fields,
  imageFieldIds,
}: Pick<ReturnType<typeof useProjectEntriesState>, 'entries' | 'busy' | 'setBusy'> &
  Pick<ReturnType<typeof useProjectEntriesRead>, 'refresh' | 'failing'> & {
    projectId: string
    universeId: string
    openEntryId?: string
    entryHref?: (entry: ProjectEntitySummary) => string
    fields: ProjectField[]
    imageFieldIds: Set<string>
  }) {
  useI18n()

  return (
    <CardGrid className="lore__grid" testId="project-entry-list">
      {(entries ?? []).map((entry) => (
        <li
          key={entry.id}
          data-testid={`project-entry-${entry.id}`}
          // The entry the address named: marked for a screen reader as the row in view, and scrolled to, because
          // it may sit below the fold of a list that had to read several pages to include it (#195).
          aria-current={entry.id === openEntryId ? 'true' : undefined}
          ref={
            entry.id === openEntryId
              ? (node) => node?.scrollIntoView({ block: 'center' })
              : undefined
          }
        >
          {/* Lore's card; with an `entryHref` the body is the link and the More menu stays outside it. */}
          <EntityCard
            universeId={universeId}
            entity={entry}
            note={
              entry.canonEntityName
                ? t('projects.entries.canon', { name: entry.canonEntityName })
                : undefined
            }
            href={entryHref ? entryHref(entry) : null}
            linkTestId={`project-entry-open-${entry.id}`}
            actions={
              <ActionMenu
                label={t('projects.common.more', { name: entry.name })}
                triggerTestId={`project-entry-actions-${entry.id}`}
              >
                <ActionMenuItem
                  icon={Trash}
                  tone="danger"
                  disabled={busy}
                  testId={`project-entry-delete-${entry.id}`}
                  onClick={async () => {
                    const confirmed = await confirmAction({
                      title: t('projects.entries.trash.title', { name: entry.name }),
                      message: t('projects.entries.trash.message'),
                      confirmLabel: t('projects.entries.delete'),
                      variant: 'warning',
                    })
                    if (!confirmed) return
                    setBusy(true)
                    deleteProjectEntity(projectId, entry.id)
                      .then(() => refresh())
                      .catch(failing)
                  }}
                >
                  {t('projects.entries.delete')}
                </ActionMenuItem>
              </ActionMenu>
            }
          />
          {imageFieldIds.size > 0 ? (
            <EntryPictures
              projectId={projectId}
              universeId={universeId}
              entryId={entry.id}
              fields={fields.filter((one) => one.kind === FieldKind.Image)}
              busy={busy}
            />
          ) : null}
        </li>
      ))}
    </CardGrid>
  )
}
