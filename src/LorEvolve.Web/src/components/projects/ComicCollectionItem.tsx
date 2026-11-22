import { ActionMenuItem } from '../ActionMenu'
import { QuietNote } from '../QuietNote'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { useFold } from '../fold'
import { t, useI18n } from '../../i18n'
import { confirmDelete } from '../../lib/confirm'
import { levelWord, nameOf } from '../../projectEntities/levelWords'
import { projectPath } from '../../projects/sections'
import {
  deleteComicCollection,
  moveComicCollection,
  moveComicEntry,
  removeComicEntry,
  type ComicCollection,
  type ComicCollectionKind,
  type Editing,
} from '../../projects/comicCollections'
import type { Dispatch, SetStateAction } from 'react'
import { WORDS } from '../../projects/comicCollectionWords'
import { FolderInput } from 'lucide-react'

/** One collection: its head and menu, and the entries in it with the way to move them. */
export function ComicCollectionItem({
  universeId,
  canEdit,
  busy,
  setEditing,
  setAdding,
  refresh,
  run,
  kind,
  ofKind,
  collection,
  index,
}: {
  universeId: string
  canEdit: boolean
  busy: boolean
  setEditing: Dispatch<SetStateAction<Editing | null>>
  setAdding: Dispatch<SetStateAction<ComicCollection | null>>
  refresh: () => void
  run: (work: () => Promise<unknown>) => void
  kind: ComicCollectionKind
  ofKind: ComicCollection[]
  collection: ComicCollection
  index: number
}) {
  useI18n()
  const { open, setOpen, ref, bodyId } = useFold<HTMLLIElement>(true)
  const ends = { first: t('projects.common.alreadyFirst'), last: t('projects.common.alreadyLast') }

  return (
    <TypeRow
      ref={ref}
      testId={`comic-collection-${collection.id}`}
      name={collection.name}
      // The heading reads as it always did, its number first: "1: Volume One".
      heading={{ level: 3, prefix: index + 1 }}
      count={t(WORDS[kind].eyebrow)}
      actions={
        <TypeRowActions
          name={collection.name}
          sibling={
            canEdit
              ? {
                  index,
                  count: ofKind.length,
                  busy,
                  to: (next) => run(() => moveComicCollection(universeId, collection.id, next)),
                }
              : undefined
          }
          moveTestIds={{
            up: `comic-collection-${collection.id}-up`,
            down: `comic-collection-${collection.id}-down`,
          }}
          addChild={
            canEdit
              ? {
                  onAdd: () => setAdding(collection),
                  testId: `comic-collection-entry-new-${collection.id}`,
                }
              : undefined
          }
          onEdit={canEdit ? () => setEditing({ kind, collection }) : undefined}
          editTestId={`comic-collection-edit-${collection.id}`}
          fold={{
            open: open,
            count: 0,
            onToggle: () => setOpen(!open),
            testId: `comic-collection-${collection.id}-toggle`,
            controls: bodyId,
            label: collection.name,
          }}
          words={{
            addChild: t('projects.comics.addEntry'),
            edit: t('projects.comics.edit'),
            addChildLabel: t('projects.comics.addEntryLabel', { name: collection.name }),
            editLabel: t('projects.comics.editLabel', { name: collection.name }),
            more: t('projects.common.more', { name: collection.name }),
            ...ends,
          }}
          onDelete={
            canEdit
              ? () =>
                  void confirmDelete(
                    {
                      title: t('projects.comics.deleteTitle', { name: collection.name }),
                      message: t('projects.comics.deleteMessage'),
                      confirmLabel: t('projects.comics.delete'),
                    },
                    () => deleteComicCollection(universeId, collection.id).then(refresh),
                  )
              : undefined
          }
          deleteLabel={t('projects.comics.delete')}
          deleteTestId={`comic-collection-delete-${collection.id}`}
          menuTestId={`comic-collection-actions-${collection.id}`}
        />
      }
    >
      <div id={bodyId} hidden={!open} data-fold={bodyId}>
        {collection.summary ? (
          <p className="types__description prose">{collection.summary}</p>
        ) : null}
        {collection.entries.length === 0 ? (
          <QuietNote spacing="flush">{t('projects.comics.noEntries')}</QuietNote>
        ) : (
          <ul className="types__list">
            {collection.entries.map((entry, entryIndex) => {
              const id = `${collection.id}-${entry.nodeId}`
              return (
                <TypeRow
                  key={entry.nodeId}
                  testId={`comic-entry-${id}`}
                  name={entry.available ? nameOf(entry) : t('projects.comics.unavailable')}
                  to={
                    entry.available
                      ? `${projectPath(entry.projectId, 'structure', universeId)}?node=${entry.nodeId}`
                      : undefined
                  }
                  linkTestId={`comic-entry-link-${id}`}
                  heading={{ level: 4 }}
                  lead={<span aria-hidden="true">{entryIndex + 1}</span>}
                  count={
                    entry.available ? (
                      <>
                        <bdi>{entry.projectName}</bdi> · {levelWord(entry.level)}
                      </>
                    ) : undefined
                  }
                  actions={
                    canEdit ? (
                      <TypeRowActions
                        name={nameOf(entry)}
                        sibling={
                          entry.available
                            ? {
                                index: entryIndex,
                                count: collection.entries.length,
                                busy,
                                to: (next) =>
                                  run(() =>
                                    moveComicEntry(universeId, collection.id, entry.nodeId, next),
                                  ),
                              }
                            : undefined
                        }
                        moveTestIds={{ up: `comic-entry-${id}-up`, down: `comic-entry-${id}-down` }}
                        words={{
                          more: t('projects.common.more', { name: nameOf(entry) }),
                          ...ends,
                        }}
                        menuItems={
                          <ActionMenuItem
                            icon={FolderInput}
                            disabled={busy}
                            testId={`comic-entry-remove-${id}`}
                            onClick={() =>
                              run(() => removeComicEntry(universeId, collection.id, entry.nodeId))
                            }
                          >
                            {t('projects.comics.remove')}
                          </ActionMenuItem>
                        }
                        menuTestId={`comic-entry-actions-${id}`}
                      />
                    ) : undefined
                  }
                />
              )
            })}
          </ul>
        )}
      </div>
    </TypeRow>
  )
}
