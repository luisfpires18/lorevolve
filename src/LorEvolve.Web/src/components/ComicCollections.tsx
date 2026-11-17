import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActionMenu } from './ActionMenu'
import { MoveItems } from './CinemaSagas'
import { Drawer } from './Drawer'
import { EmptyState } from './EmptyState'
import { Field } from './Field'
import { t, useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'
import { levelWord, nameOf } from '../projectEntities/levelWords'
import { projectPath } from '../projects/sections'
import {
  addComicEntry,
  createComicCollection,
  deleteComicCollection,
  listComicCollections,
  moveComicCollection,
  moveComicEntry,
  removeComicEntry,
  saveComicCollection,
  type ComicCollection,
  type ComicCollectionKind,
  type ComicCollections as Collections,
  type ComicNode,
} from '../projects/comicCollections'

const KINDS: ComicCollectionKind[] = ['story-arc', 'event']

const kindTitle = (kind: ComicCollectionKind) =>
  t(kind === 'story-arc' ? 'projects.comics.storyArcs' : 'projects.comics.events')

const nodeLabel = (node: ComicNode) =>
  `${node.projectName} - ${levelWord(node.level)} ${nameOf(node)}`

/** What the edit drawer is for: a new collection of one kind, or an existing one. */
type Editing = { kind: ComicCollectionKind; collection: ComicCollection | null }

/**
 * Comic Story Arcs and Events (#296): ordered references to issues, chapters and episodes across this universe's
 * comics. Every action here changes only the collection or an entry; an entry row opens the original node.
 */
export function ComicCollections({ universeId }: { universeId: string }) {
  useI18n()
  const [data, setData] = useState<Collections | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [adding, setAdding] = useState<ComicCollection | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listComicCollections(universeId, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(t('projects.comics.failed'))
      })
    return () => controller.abort()
  }, [universeId])

  function refresh() {
    return listComicCollections(universeId).then((read) => {
      setData(read)
      setBusy(false)
      setFailed(null)
    })
  }

  function run(work: () => Promise<unknown>) {
    setBusy(true)
    work()
      .then(refresh)
      .catch((error: unknown) => {
        setBusy(false)
        setFailed(error instanceof Error ? error.message : t('projects.comics.failed'))
      })
  }

  if (data === null) {
    return failed ? (
      <EmptyState title={failed} testId="comic-collections-failed" />
    ) : (
      <p className="projects__lede">{t('projects.comics.loading')}</p>
    )
  }

  return (
    <div data-testid="comic-collections">
      {failed ? (
        <p className="form__message" role="alert">
          {failed}
        </p>
      ) : null}

      {KINDS.map((kind) => {
        const ofKind = data.collections.filter((collection) => collection.kind === kind)
        return (
          <section key={kind} className="projects" data-testid={`comic-collections-${kind}`}>
            <header className="projects__head">
              <div className="projects__headtext">
                <h2 className="sectionrule">{kindTitle(kind)}</h2>
              </div>
              <button
                className="button button--secondary button--sm"
                type="button"
                data-testid={`comic-collection-add-${kind}`}
                onClick={() => setEditing({ kind, collection: null })}
              >
                {t(kind === 'story-arc' ? 'projects.comics.newArc' : 'projects.comics.newEvent')}
              </button>
            </header>

            {ofKind.length === 0 ? (
              <p className="projectcard__meta">
                {t(kind === 'story-arc' ? 'projects.comics.noArcs' : 'projects.comics.noEvents')}
              </p>
            ) : (
              <ol className="projectcardlist">
                {ofKind.map((collection, index) => (
                  <li
                    key={collection.id}
                    className="projectcard"
                    data-testid={`comic-collection-${collection.id}`}
                  >
                    <div className="projectcard__head">
                      <h3 className="projectcard__title">
                        <bdi>{collection.name}</bdi>
                      </h3>
                      <div className="projectcard__actions">
                        <ActionMenu
                          label={t('projects.common.more', { name: collection.name })}
                          triggerTestId={`comic-collection-actions-${collection.id}`}
                        >
                          <MoveItems
                            index={index}
                            count={ofKind.length}
                            busy={busy}
                            testId={`comic-collection-${collection.id}`}
                            onMove={(place) =>
                              run(() => moveComicCollection(universeId, collection.id, place))
                            }
                          />
                          <button
                            className="actionmenu__item"
                            type="button"
                            data-testid={`comic-collection-entry-new-${collection.id}`}
                            onClick={() => setAdding(collection)}
                          >
                            {t('projects.comics.addEntry')}
                          </button>
                          <button
                            className="actionmenu__item"
                            type="button"
                            data-testid={`comic-collection-edit-${collection.id}`}
                            onClick={() => setEditing({ kind, collection })}
                          >
                            {t('projects.comics.edit')}
                          </button>
                          <button
                            className="actionmenu__item actionmenu__item--danger"
                            type="button"
                            data-testid={`comic-collection-delete-${collection.id}`}
                            onClick={() =>
                              void confirmAction({
                                title: t('projects.comics.deleteTitle', { name: collection.name }),
                                message: t('projects.comics.deleteMessage'),
                                confirmLabel: t('projects.comics.delete'),
                                variant: 'destructive',
                                action: () =>
                                  deleteComicCollection(universeId, collection.id).then(refresh),
                              })
                            }
                          >
                            {t('projects.comics.delete')}
                          </button>
                        </ActionMenu>
                      </div>
                    </div>
                    {collection.summary ? <p className="prose">{collection.summary}</p> : null}
                    {collection.entries.length === 0 ? (
                      <p className="projectcard__meta">{t('projects.comics.noEntries')}</p>
                    ) : (
                      <ol className="fieldlist">
                        {collection.entries.map((entry, entryIndex) => {
                          const id = `${collection.id}-${entry.nodeId}`
                          return (
                            <li
                              key={entry.nodeId}
                              className="fieldlist__row"
                              data-testid={`comic-entry-${id}`}
                            >
                              {entry.available ? (
                                <span className="fieldlist__text">
                                  <Link
                                    className="fieldlist__name"
                                    to={`${projectPath(entry.projectId, 'structure', universeId)}?node=${entry.nodeId}`}
                                    data-testid={`comic-entry-link-${id}`}
                                  >
                                    <bdi>{nameOf(entry)}</bdi>
                                  </Link>
                                  <span className="fieldlist__meta">
                                    <bdi>{entry.projectName}</bdi> · {levelWord(entry.level)}
                                  </span>
                                </span>
                              ) : (
                                <span className="fieldlist__text">
                                  <span className="fieldlist__meta">
                                    {t('projects.comics.unavailable')}
                                  </span>
                                </span>
                              )}
                              <div className="fieldlist__actions">
                                <ActionMenu
                                  label={t('projects.common.more', { name: nameOf(entry) })}
                                  triggerTestId={`comic-entry-actions-${id}`}
                                >
                                  {entry.available ? (
                                    <MoveItems
                                      index={entryIndex}
                                      count={collection.entries.length}
                                      busy={busy}
                                      testId={`comic-entry-${id}`}
                                      onMove={(place) =>
                                        run(() =>
                                          moveComicEntry(
                                            universeId,
                                            collection.id,
                                            entry.nodeId,
                                            place,
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
                                      run(() =>
                                        removeComicEntry(universeId, collection.id, entry.nodeId),
                                      )
                                    }
                                  >
                                    {t('projects.comics.remove')}
                                  </button>
                                </ActionMenu>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </li>
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
              : createComicCollection(universeId, { ...input, kind })
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

function CollectionDrawer({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing
  onClose: () => void
  onSave: (input: { name: string; summary: string | null }) => Promise<unknown>
}) {
  const current = editing.collection
  const [name, setName] = useState(current?.name ?? '')
  const [summary, setSummary] = useState(current?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = name !== (current?.name ?? '') || summary !== (current?.summary ?? '')
  const arc = editing.kind === 'story-arc'

  function save() {
    setSaving(true)
    setError(null)
    onSave({ name: name.trim(), summary: summary.trim() || null }).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.comics.failed'))
    })
  }

  return (
    <Drawer
      testId="comic-collection-drawer"
      titleId="comic-collection-drawer-heading"
      eyebrow={t(arc ? 'projects.comics.arcEyebrow' : 'projects.comics.eventEyebrow')}
      title={
        current
          ? t('projects.comics.edit')
          : t(arc ? 'projects.comics.newArc' : 'projects.comics.newEvent')
      }
      isDirty={isDirty}
      leaveMessage={t('projects.comics.leave')}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={saving || name.trim() === ''}
            data-testid="comic-collection-drawer-save"
          >
            {saving ? t('projects.comics.saving') : t('projects.comics.save')}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
      )}
    >
      <Field label={t('projects.comics.name')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            maxLength={200}
            required
            placeholder={t('projects.comics.namePlaceholder')}
            data-testid="comic-collection-drawer-name"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('projects.comics.summary')}>
        {(control) => (
          <textarea
            {...control}
            className="field__input"
            value={summary}
            maxLength={4000}
            rows={3}
            placeholder={t('projects.comics.summaryPlaceholder')}
            data-testid="comic-collection-drawer-summary"
            onChange={(event) => setSummary(event.target.value)}
          />
        )}
      </Field>
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  )
}

function EntryDrawer({
  collection,
  candidates,
  onClose,
  onAdd,
}: {
  collection: ComicCollection
  candidates: ComicNode[]
  onClose: () => void
  onAdd: (nodeId: string) => Promise<unknown>
}) {
  const [chosen, setChosen] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (chosen === '') return
    setSaving(true)
    setError(null)
    onAdd(chosen).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.comics.failed'))
    })
  }

  return (
    <Drawer
      testId="comic-entry-drawer"
      titleId="comic-entry-drawer-heading"
      title={t('projects.comics.addTitle', { name: collection.name })}
      onClose={onClose}
      onSubmit={add}
      busy={saving}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={saving || chosen === ''}
            data-testid="comic-entry-drawer-save"
          >
            {t('projects.comics.add')}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
      )}
    >
      {candidates.length === 0 ? (
        <p className="projectcard__meta">{t('projects.comics.noCandidates')}</p>
      ) : (
        <Field label={t('projects.comics.part')}>
          {(control) => (
            <select
              {...control}
              className="field__input"
              value={chosen}
              data-testid="comic-entry-drawer-node"
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">{t('projects.comics.choosePart')}</option>
              {candidates.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {nodeLabel(node)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  )
}
