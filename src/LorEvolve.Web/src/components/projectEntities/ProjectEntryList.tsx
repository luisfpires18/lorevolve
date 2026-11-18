import { Link } from 'react-router-dom'
import { deleteProjectEntity } from '../../projectEntities/api'
import {
  FieldKind,
  type ProjectEntitySummary,
  type ProjectField,
} from '../../projectEntities/types'
import { ActionMenu } from '../ActionMenu'
import { EntityCardBody } from '../EntityCard'
import { t, useI18n } from '../../i18n'
import type { useProjectEntriesRead } from '../../projectEntities/useProjectEntriesRead'
import type { useProjectEntriesState } from '../../projectEntities/useProjectEntriesState'
import { EntryPictures } from './EntryPictures'

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
    <ul className="cardgrid lore__grid" data-testid="project-entry-list">
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
          <div className="entitycard entitycard--static">
            {(() => {
              // The entry's own picture when it has one (#286), else the type's icon, exactly as Lore's card.
              const body = (
                <EntityCardBody
                  universeId={universeId}
                  entity={entry}
                  note={
                    entry.canonEntityName
                      ? t('projects.entries.canon', { name: entry.canonEntityName })
                      : undefined
                  }
                />
              )
              return entryHref ? (
                <Link
                  className="entitycard__link"
                  to={entryHref(entry)}
                  data-testid={`project-entry-open-${entry.id}`}
                >
                  {body}
                </Link>
              ) : (
                body
              )
            })()}
            <div className="entitycard__actions">
              <ActionMenu
                label={t('projects.common.more', { name: entry.name })}
                triggerTestId={`project-entry-actions-${entry.id}`}
              >
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  disabled={busy}
                  data-testid={`project-entry-delete-${entry.id}`}
                  onClick={() => {
                    setBusy(true)
                    deleteProjectEntity(projectId, entry.id)
                      .then(() => refresh())
                      .catch(failing)
                  }}
                >
                  {t('projects.entries.delete')}
                </button>
              </ActionMenu>
            </div>
          </div>
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
    </ul>
  )
}
