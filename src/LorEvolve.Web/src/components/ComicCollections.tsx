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
  type Editing,
} from '../projects/comicCollections'
import { WORDS } from '../projects/comicCollectionWords'
import { ComicCollectionItem } from './projects/ComicCollectionItem'
import { NameSummaryDrawer } from './NameSummaryDrawer'
import { PickOneDrawer } from './PickOneDrawer'
import { levelWord, nameOf } from '../projectEntities/levelWords'
import { NewButton } from './NewButton'
import { useLoadedList } from '../lib/useLoadedList'
import { ReadGate } from './ReadGate'
import { PageHeader } from './PageHeader'
import { Section } from './Section'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

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
    return (
      <ReadGate
        load={failed ? { kind: 'error', message: failed } : { kind: 'loading' }}
        loading={{ text: t('projects.comics.loading') }}
        error={{ onRetry: () => void refresh(), testId: 'comic-collections-failed' }}
      >
        {() => null}
      </ReadGate>
    )
  }

  return (
    <div data-testid="comic-collections">
      {failed ? <FormMessage>{failed}</FormMessage> : null}

      {kinds.map((kind) => {
        const ofKind = data.collections.filter((collection) => collection.kind === kind)
        return (
          <Section key={kind} testId={`comic-collections-${kind}`}>
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
              <QuietNote spacing="flush">{t(WORDS[kind].none)}</QuietNote>
            ) : (
              <ul className="types__list">
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
              </ul>
            )}
          </Section>
        )
      })}

      {editing ? (
        <NameSummaryDrawer
          testId="comic-collection-drawer"
          eyebrow={t(WORDS[editing.kind].eyebrow)}
          title={editing.collection ? t('projects.comics.edit') : t(WORDS[editing.kind].add)}
          initial={editing.collection}
          words="projects.comics"
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
        <PickOneDrawer
          testId="comic-entry-drawer"
          titleId="comic-entry-drawer-heading"
          title={t('projects.comics.addTitle', { name: adding.name })}
          label={t('projects.comics.part')}
          choose={t('projects.comics.choosePart')}
          options={data.candidates
            .filter((node) => !adding.entries.some((entry) => entry.nodeId === node.nodeId))
            .map((node) => ({
              value: node.nodeId,
              label: `${node.projectName} - ${levelWord(node.level)} ${nameOf(node)}`,
            }))}
          emptyText={t('projects.comics.noCandidates')}
          submitLabel={t('projects.comics.add')}
          failed={t('projects.comics.failed')}
          selectTestId="comic-entry-drawer-node"
          submitTestId="comic-entry-drawer-save"
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
