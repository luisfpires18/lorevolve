import { useCallback, useState } from 'react'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import {
  addComicEntry,
  createComicCollection,
  listComicCollections,
  saveComicCollection,
  type ComicCollection,
  type ComicCollectionKind,
} from '../projects/comicCollections'
import { WORDS } from '../projects/comicCollectionWords'
import { ComicCollectionItem } from './projects/ComicCollectionItem'
import { CollectionDrawer, type Editing } from './projects/CollectionDrawer'
import { EntryDrawer } from './projects/EntryDrawer'
import { NewButton } from './NewButton'
import { useLoadedList } from '../lib/useLoadedList'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'
import { PageHeader } from './PageHeader'

const ARCS_AND_EVENTS: ComicCollectionKind[] = ['story-arc', 'event']

/**
 * Comic Story Arcs and Events (#296): ordered references to issues and chapters across this universe's
 * comics. Every action here changes only the collection or an entry; an entry row opens the original node.
 * With `projectId` it shows that Comic project's Volumes (#297) instead. Without edit access it only reads.
 */
export function ComicCollections({
  universeId,
  projectId,
}: {
  universeId: string
  projectId?: string
}) {
  useI18n()
  const canEdit = useUniverseAccess().editContent
  const [editing, setEditing] = useState<Editing | null>(null)
  const [adding, setAdding] = useState<ComicCollection | null>(null)
  const read = useCallback(
    (signal?: AbortSignal) => listComicCollections(universeId, signal, projectId),
    [universeId, projectId],
  )
  const { data, failed, busy, refresh, run } = useLoadedList(read, t('projects.comics.failed'))

  const kinds: ComicCollectionKind[] = projectId ? ['volume'] : ARCS_AND_EVENTS

  if (data === null) {
    return failed ? (
      <LoadError
        message={failed}
        onRetry={() => void refresh()}
        testId="comic-collections-failed"
      />
    ) : (
      <LoadingNote>{t('projects.comics.loading')}</LoadingNote>
    )
  }

  return (
    <div data-testid="comic-collections">
      {failed ? (
        <p className="form__message" role="alert">
          {failed}
        </p>
      ) : null}

      {kinds.map((kind) => {
        const ofKind = data.collections.filter((collection) => collection.kind === kind)
        return (
          <section key={kind} className="projects" data-testid={`comic-collections-${kind}`}>
            <PageHeader
              level={2}
              size="panel"
              title={t(WORDS[kind].title)}
              actions={
                canEdit ? (
                  <NewButton
                    tone="secondary"
                    size="sm"
                    data-testid={`comic-collection-add-${kind}`}
                    onClick={() => setEditing({ kind, collection: null })}
                  >
                    {t(WORDS[kind].add)}
                  </NewButton>
                ) : null
              }
            />

            {ofKind.length === 0 ? (
              <p className="projectcard__meta">{t(WORDS[kind].none)}</p>
            ) : (
              <ol className="scenes">
                {ofKind.map((collection, index) => (
                  <ComicCollectionItem
                    key={collection.id}
                    universeId={universeId}
                    canEdit={canEdit}
                    busy={busy}
                    setEditing={setEditing}
                    setAdding={setAdding}
                    refresh={refresh}
                    run={run}
                    kind={kind}
                    ofKind={ofKind}
                    collection={collection}
                    index={index}
                  />
                ))}
              </ol>
            )}
          </section>
        )
      })}

      {editing ? (
        <CollectionDrawer
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const { kind, collection } = editing
            const work = collection
              ? saveComicCollection(universeId, collection.id, {
                  ...input,
                  expectedVersion: collection.version,
                })
              : createComicCollection(universeId, { ...input, kind, projectId })
            return work.then(refresh).then(() => setEditing(null))
          }}
        />
      ) : null}

      {adding ? (
        <EntryDrawer
          collection={adding}
          candidates={data.candidates.filter(
            (node) => !adding.entries.some((entry) => entry.nodeId === node.nodeId),
          )}
          onClose={() => setAdding(null)}
          onAdd={(nodeId) =>
            addComicEntry(universeId, adding.id, nodeId)
              .then(refresh)
              .then(() => setAdding(null))
          }
        />
      ) : null}
    </div>
  )
}
