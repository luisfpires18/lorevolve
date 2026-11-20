import { Link } from 'react-router-dom'
import { ActionMenu } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { OutlineItem } from '../OutlineItem'
import { t, useI18n } from '../../i18n'
import { confirmAction } from '../../lib/confirm'
import { levelWord, nameOf } from '../../projectEntities/levelWords'
import { projectPath } from '../../projects/sections'
import {
  deleteComicCollection,
  moveComicCollection,
  moveComicEntry,
  removeComicEntry,
  type ComicCollection,
  type ComicCollectionKind,
} from '../../projects/comicCollections'
import type { Dispatch, SetStateAction } from 'react'
import { WORDS } from '../../projects/comicCollectionWords'
import type { Editing } from './CollectionDrawer'
import { FolderInput, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'

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

  return (
    <OutlineItem
      variant="group"
      number={index + 1}
      name={collection.name}
      meta={t(WORDS[kind].eyebrow)}
      summary={collection.summary}
      testId={`comic-collection-${collection.id}`}
      foldLabel={collection.name}
      tools={
        canEdit ? (
          <ActionMenu
            label={t('projects.common.more', { name: collection.name })}
            triggerTestId={`comic-collection-actions-${collection.id}`}
          >
            <MoveItems
              first={index === 0}
              last={index === ofKind.length - 1}
              busy={busy}
              testIds={{
                up: `comic-collection-${collection.id}-up`,
                down: `comic-collection-${collection.id}-down`,
              }}
              onMove={(step) =>
                run(() => moveComicCollection(universeId, collection.id, index + step))
              }
            />
            <button
              className="actionmenu__item"
              type="button"
              data-testid={`comic-collection-entry-new-${collection.id}`}
              onClick={() => setAdding(collection)}
            >
              <ActionIcon icon={Plus} />
              {t('projects.comics.addEntry')}
            </button>
            <button
              className="actionmenu__item"
              type="button"
              data-testid={`comic-collection-edit-${collection.id}`}
              onClick={() => setEditing({ kind, collection })}
            >
              <ActionIcon icon={Pencil} />
              {t('projects.comics.edit')}
            </button>
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              data-testid={`comic-collection-delete-${collection.id}`}
              onClick={() =>
                void confirmAction({
                  title: t('projects.comics.deleteTitle', {
                    name: collection.name,
                  }),
                  message: t('projects.comics.deleteMessage'),
                  confirmLabel: t('projects.comics.delete'),
                  variant: 'destructive',
                  action: () => deleteComicCollection(universeId, collection.id).then(refresh),
                })
              }
            >
              <ActionIcon icon={Trash} />
              {t('projects.comics.delete')}
            </button>
          </ActionMenu>
        ) : null
      }
    >
      {collection.entries.length === 0 ? (
        <p className="chapter__empty">{t('projects.comics.noEntries')}</p>
      ) : (
        <ol className="scenes">
          {collection.entries.map((entry, entryIndex) => {
            const id = `${collection.id}-${entry.nodeId}`
            return (
              <OutlineItem
                key={entry.nodeId}
                variant="card"
                number={entryIndex + 1}
                titleLevel={4}
                name={
                  entry.available ? (
                    <Link
                      to={`${projectPath(entry.projectId, 'structure', universeId)}?node=${entry.nodeId}`}
                      data-testid={`comic-entry-link-${id}`}
                    >
                      {nameOf(entry)}
                    </Link>
                  ) : (
                    t('projects.comics.unavailable')
                  )
                }
                meta={
                  entry.available ? (
                    <>
                      <bdi>{entry.projectName}</bdi> · {levelWord(entry.level)}
                    </>
                  ) : null
                }
                testId={`comic-entry-${id}`}
                foldLabel={nameOf(entry)}
                tools={
                  canEdit ? (
                    <ActionMenu
                      label={t('projects.common.more', { name: nameOf(entry) })}
                      triggerTestId={`comic-entry-actions-${id}`}
                    >
                      {entry.available ? (
                        <MoveItems
                          first={entryIndex === 0}
                          last={entryIndex === collection.entries.length - 1}
                          busy={busy}
                          testIds={{ up: `comic-entry-${id}-up`, down: `comic-entry-${id}-down` }}
                          onMove={(step) =>
                            run(() =>
                              moveComicEntry(
                                universeId,
                                collection.id,
                                entry.nodeId,
                                entryIndex + step,
                              ),
                            )
                          }
                        />
                      ) : null}
                      <button
                        className="actionmenu__item"
                        type="button"
                        disabled={busy}
                        data-testid={`comic-entry-remove-${id}`}
                        onClick={() =>
                          run(() => removeComicEntry(universeId, collection.id, entry.nodeId))
                        }
                      >
                        <ActionIcon icon={FolderInput} />
                        {t('projects.comics.remove')}
                      </button>
                    </ActionMenu>
                  ) : null
                }
              />
            )
          })}
        </ol>
      )}
    </OutlineItem>
  )
}
