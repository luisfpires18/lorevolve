import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Library } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EntityTile } from './EntityTile'
import { StatusBadge } from './StatusBadge'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { useDrawerGuard } from '../lib/drawerGuard'
import { isChangedElsewhere } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import { getEntity, listEntities } from '../lore/api'
import { renderFact } from '../lore/facts'
import { CANON_LABELS, type EntityDetail, type EntityImageRef } from '../lore/types'
import { listEntityRelationships } from '../relationships/api'
import type { RelationshipView } from '../relationships/types'
import { listLoreReferences, SCENE_CHANGED, updateScene } from '../stories/api'
import type { Scene, SceneLoreReference } from '../stories/types'
import type { Mention } from '../lore/mentions'
import { useUniverseAccess } from '../universes/access'

const MAX_RESULTS = 8
const MAX_RELATIONS = 8

interface LoreContextProps {
  universeId: string
  storyId: string
  /** The open scene, as the story page holds it. Its `entities` are the scene's linked lore (`SceneEntityLinks`). */
  scene: Scene
  chronology: Chronology
  /** The @ mentions in the prose as it stands in the editor, saved or not (issue 31), in order. */
  mentions: Mention[]
  /** A link or unlink was saved: the story page shows the scene the API answered with. */
  onSceneSaved: (scene: Scene) => void
  /** The scene changed somewhere else: the story is read again. */
  onSceneChanged: () => void
}

/** One row as the drawer draws it, from a scene's reference or a search result alike. */
interface LoreRow {
  id: string
  name: string
  typeName: string
  typeIcon: string | null
  typeAccent: string | null
  image: EntityImageRef | null
  isTrashed: boolean
}

/**
 * Lore Context (task 048): the lore a scene links, a search for more, and a short preview of any of it, in the drawer
 * every LorEvolve form uses, opened beside the manuscript without leaving it. The prose is untouched: the drawer reads and
 * writes only the scene's links, through the scene's own save, so the manuscript's draft, recovery copy and leave
 * question carry on underneath exactly as they were.
 *
 * Since issue 31 it also lists the prose's @ mentions, each once, with its entry's current name and a preview, and its own
 * optional "Add to this scene's Lore": a mention never links anything by itself, and one already linked offers nothing.
 */
export function LoreContext(props: LoreContextProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className="button button--text loretrigger"
        type="button"
        aria-haspopup="dialog"
        title="Lore"
        onClick={() => setIsOpen(true)}
        data-testid="lore-context-trigger"
      >
        <ActionIcon icon={Library} />
        <span className="loretrigger__label">Lore</span>
      </button>

      {isOpen ? <LoreContextDrawer {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

/**
 * A link or unlink is the scene's whole save, sent over the scene exactly as stored with only its lore changed, and naming
 * the version the page holds (ADR 0043). If anyone saved the scene since, the API refuses it and nothing is overwritten;
 * the story is read again and the author can try once more over what is there now. Nothing is shown as linked until the
 * API says so.
 */
function LoreContextDrawer({
  universeId,
  storyId,
  scene,
  chronology,
  mentions,
  onSceneSaved,
  onSceneChanged,
  onClose,
}: LoreContextProps & { onClose: () => void }) {
  const access = useUniverseAccess()
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const linkedHeading = useRef<HTMLHeadingElement>(null)
  // One save at a time, held in a ref so a double press cannot send a second save over the same version.
  const inFlight = useRef(false)
  const headingId = useId()
  const searchId = useId()
  const resultsId = useId()

  const [query, setQuery] = useState('')
  // Each answer is held with the words it answered, so a cleared or newer search never shows an older one's rows.
  const [answer, setAnswer] = useState<{
    term: string
    rows: LoreRow[] | null
    failed: boolean
  } | null>(null)
  const [searching, setSearching] = useState(false)
  const [preview, setPreview] = useState<{ id: string; from: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // The entries the mentions name, read once when the drawer opens, by id: their names now, or gone.
  const mentioned = [...new Map(mentions.map((mention) => [mention.entityId, mention])).values()]
  const [mentionIds] = useState(() => mentioned.map((mention) => mention.entityId))
  const [references, setReferences] = useState<Map<string, SceneLoreReference> | 'failed' | null>(
    null,
  )

  // Nothing in the drawer is ever unsaved, so it closes without asking; Escape and the backdrop still go through the guard.
  const { close, dialogProps } = useDrawerGuard(false, '', onClose)
  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    search.current?.focus()
  }, [])

  useEffect(() => {
    if (mentionIds.length === 0) return
    const controller = new AbortController()
    listLoreReferences(universeId, mentionIds.slice(0, 100), controller.signal)
      .then((found) =>
        setReferences(new Map(found.map((reference) => [reference.entityId, reference]))),
      )
      .catch(() => {
        if (!controller.signal.aborted) setReferences('failed')
      })
    return () => controller.abort()
  }, [universeId, mentionIds])

  const term = query.trim()
  useEffect(() => {
    if (term === '') return

    const controller = new AbortController()
    // The scene form's picker search: the same route and the same index (ADR 0016), settled before it asks.
    const timer = setTimeout(() => {
      setSearching(true)
      listEntities(
        universeId,
        {
          search: term,
          entityTypeId: null,
          canonStatus: null,
          tag: null,
          page: 1,
          pageSize: MAX_RESULTS,
        },
        controller.signal,
      )
        .then((page) =>
          setAnswer({
            term,
            failed: false,
            rows: page.items.map((item) => ({
              id: item.id,
              name: item.name,
              typeName: item.entityTypeName,
              typeIcon: item.entityTypeIcon,
              typeAccent: item.entityTypeAccentColor,
              image: item.image,
              isTrashed: false,
            })),
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ term, rows: null, failed: true })
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, term])

  const current = term !== '' && answer?.term === term ? answer : null
  const results = current?.rows ?? null
  const searchFailed = current?.failed ?? false
  const isSearching = term !== '' && searching

  const linked: LoreRow[] = scene.entities.map((reference) => ({
    id: reference.entityId,
    name: reference.name,
    typeName: reference.entityTypeName,
    typeIcon: reference.entityTypeIcon,
    typeAccent: reference.entityTypeAccentColor,
    image: reference.isTrashed ? null : reference.image,
    isTrashed: reference.isTrashed,
  }))
  const linkedIds = new Set(linked.map((row) => row.id))

  /** Keeps the focus in the drawer when the row that held it is gone, as an unlinked row is. */
  function holdFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (
        !dialog.current ||
        (active && active !== dialog.current && dialog.current.contains(active))
      )
        return
      linkedHeading.current?.focus()
    })
  }

  async function setLink(row: { id: string; name: string }, link: boolean) {
    if (inFlight.current || !access.editContent) return

    const current = scene.entities.map((reference) => reference.entityId)
    const entityIds = link
      ? current.includes(row.id)
        ? current
        : [...current, row.id]
      : current.filter((id) => id !== row.id)

    inFlight.current = true
    setBusy(row.id)
    setMessage(null)
    try {
      const saved = await updateScene(universeId, storyId, scene.id, {
        // Everything else exactly as stored, so the save changes the links and nothing more.
        title: scene.title,
        summary: scene.summary,
        notes: scene.notes,
        povEntityId: scene.pov?.entityId ?? null,
        chronology: scene.chronology,
        chapterId: scene.chapterId,
        entityIds,
        expectedVersion: scene.version,
      })
      onSceneSaved(saved)
      setAnnouncement(link ? `Linked ${row.name} to this scene.` : `Unlinked ${row.name}.`)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SCENE_CHANGED)) {
        setMessage(
          'This scene was changed somewhere else, so nothing was saved. The list now shows the latest. Try again.',
        )
        onSceneChanged()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage('This scene isn’t in the story anymore. It may have been moved to the Trash.')
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage(error.fieldErrors.entityIds ?? error.message)
      } else {
        setMessage('That didn’t save. Try again.')
      }
    } finally {
      inFlight.current = false
      setBusy(null)
      holdFocus()
    }
  }

  function openPreview(id: string, from: string) {
    setPreview({ id, from })
  }

  function closePreview() {
    const from = preview?.from
    setPreview(null)
    requestAnimationFrame(() => {
      const back = from
        ? dialog.current?.querySelector<HTMLElement>(`[data-preview-from="${from}"]`)
        : null
      ;(back ?? search.current)?.focus()
    })
  }

  /** Up and Down move between the results, and from the search box into them. */
  function moveThrough(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>('[data-result-name]') ?? [],
    )
    if (buttons.length === 0) return
    event.preventDefault()
    const at = buttons.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown' ? Math.min(at + 1, buttons.length - 1) : at <= 0 ? -1 : at - 1
    if (next < 0) search.current?.focus()
    else buttons[next].focus()
  }

  function rowOf(row: LoreRow, from: 'linked' | 'result') {
    const isLinked = linkedIds.has(row.id)
    const key = `${from}-${row.id}`
    return (
      <li
        className="relation lorecontext__row"
        key={row.id}
        data-testid={`lore-context-${from}`}
        data-name={row.name}
      >
        <EntityTile
          className="relation__tile"
          universeId={universeId}
          entityId={row.id}
          image={row.image}
          typeIcon={row.typeIcon}
          typeAccent={row.typeAccent}
        />
        <div className="relation__body">
          {row.isTrashed ? (
            <span className="relation__name lorecontext__name--trashed">
              <bdi>{row.name}</bdi> <span className="lorechip__note">(in Trash)</span>
            </span>
          ) : (
            <button
              className="relation__name lorecontext__name"
              type="button"
              onClick={() => openPreview(row.id, key)}
              onKeyDown={from === 'result' ? moveThrough : undefined}
              data-preview-from={key}
              data-result-name={from === 'result' ? '' : undefined}
              aria-label={`Preview ${row.name}`}
              data-testid="lore-context-preview"
            >
              <bdi>{row.name}</bdi>
            </button>
          )}
          <p className="relation__meta">
            <bdi>{row.typeName}</bdi>
            {from === 'result' && isLinked && !access.editContent ? (
              <span>In this scene</span>
            ) : null}
          </p>
        </div>
        {access.editContent ? (
          <button
            className="button button--text lorecontext__action"
            type="button"
            aria-disabled={busy !== null}
            aria-label={
              isLinked ? `Unlink ${row.name} from this scene` : `Link ${row.name} to this scene`
            }
            onClick={() => void setLink(row, !isLinked)}
            data-testid={isLinked ? 'lore-context-unlink' : 'lore-context-link'}
          >
            {busy === row.id
              ? isLinked
                ? 'Unlinking…'
                : 'Linking…'
              : isLinked
                ? 'Unlink'
                : 'Link'}
          </button>
        ) : null}
      </li>
    )
  }

  return (
    <dialog
      className="drawer lorecontext"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="lore-context"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">Lore</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{scene.title}</bdi>
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="lore-context-error">
              {message}
            </p>
          ) : null}

          {preview ? (
            <LorePreview
              universeId={universeId}
              entityId={preview.id}
              chronology={chronology}
              isLinked={linkedIds.has(preview.id)}
              canLink={access.editContent}
              busy={busy !== null}
              onLink={(row, link) => void setLink(row, link)}
              onBack={closePreview}
            />
          ) : (
            <>
              <section className="lorecontext__group" aria-labelledby={`${headingId}-linked`}>
                <h3
                  className="sectionrule sectionrule--accent"
                  id={`${headingId}-linked`}
                  ref={linkedHeading}
                  tabIndex={-1}
                >
                  In this scene
                </h3>
                {linked.length === 0 ? (
                  <p className="entry__blank" data-testid="lore-context-none">
                    {access.editContent
                      ? 'No lore linked yet. Search below to add some.'
                      : 'No lore linked to this scene.'}
                  </p>
                ) : (
                  <ul className="relations__rows" data-testid="lore-context-linked-list">
                    {linked.map((row) => rowOf(row, 'linked'))}
                  </ul>
                )}
              </section>

              {mentioned.length > 0 ? (
                <section
                  className="lorecontext__group"
                  aria-labelledby={`${headingId}-mentioned`}
                  data-testid="lore-context-mentions"
                >
                  <h3 className="sectionrule sectionrule--accent" id={`${headingId}-mentioned`}>
                    Mentioned in the text
                  </h3>
                  {references === 'failed' ? (
                    <p className="form__message" data-testid="lore-context-mentions-error">
                      The mentioned lore could not be read.
                    </p>
                  ) : (
                    <ul className="relations__rows">
                      {mentioned.map((mention) => {
                        const reference =
                          references instanceof Map ? references.get(mention.entityId) : undefined
                        const known = references instanceof Map
                        const live = reference !== undefined && !reference.isTrashed
                        const isLinked = linkedIds.has(mention.entityId)
                        const name = reference?.name ?? mention.name
                        const key = `mention-${mention.entityId}`
                        return (
                          <li
                            className="relation lorecontext__row"
                            key={mention.entityId}
                            data-testid="lore-context-mention"
                            data-name={name}
                          >
                            <EntityTile
                              className="relation__tile"
                              universeId={universeId}
                              entityId={mention.entityId}
                              image={live ? reference.image : null}
                              typeIcon={reference?.entityTypeIcon ?? null}
                              typeAccent={reference?.entityTypeAccentColor ?? null}
                            />
                            <div className="relation__body">
                              {live ? (
                                <button
                                  className="relation__name lorecontext__name"
                                  type="button"
                                  onClick={() => openPreview(mention.entityId, key)}
                                  data-preview-from={key}
                                  aria-label={`Preview ${name}`}
                                  data-testid="lore-context-mention-preview"
                                >
                                  <bdi>{name}</bdi>
                                </button>
                              ) : (
                                <span className="relation__name lorecontext__name--trashed">
                                  <bdi>{name}</bdi>
                                </span>
                              )}
                              <p
                                className="relation__meta"
                                data-testid="lore-context-mention-state"
                              >
                                {!known ? (
                                  'Reading…'
                                ) : reference === undefined ? (
                                  'Not in this universe’s Lore'
                                ) : reference.isTrashed ? (
                                  'In the Trash'
                                ) : (
                                  <>
                                    <bdi>{reference.entityTypeName}</bdi>
                                    {reference.name !== mention.name ? (
                                      <span>
                                        Written as <bdi>{mention.name}</bdi>
                                      </span>
                                    ) : null}
                                    {isLinked ? <span>In this scene’s Lore</span> : null}
                                  </>
                                )}
                              </p>
                            </div>
                            {access.editContent && live && !isLinked ? (
                              <button
                                className="button button--text lorecontext__action"
                                type="button"
                                aria-disabled={busy !== null}
                                aria-label={`Add ${name} to this scene’s Lore`}
                                onClick={() => void setLink({ id: mention.entityId, name }, true)}
                                data-testid="lore-context-mention-link"
                              >
                                Add to this scene’s Lore
                              </button>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              ) : null}

              <section className="lorecontext__group" aria-labelledby={`${headingId}-find`}>
                <h3 className="sectionrule sectionrule--accent" id={`${headingId}-find`}>
                  Find lore
                </h3>
                <label className="visually-hidden" htmlFor={searchId}>
                  Search this universe’s lore
                </label>
                <input
                  id={searchId}
                  ref={search}
                  className="field__input"
                  type="search"
                  dir="auto"
                  placeholder="Search by name, alias or summary"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={moveThrough}
                  aria-controls={resultsId}
                  data-testid="lore-context-search"
                />
                <div id={resultsId}>
                  <p className="visually-hidden" role="status">
                    {isSearching
                      ? 'Searching…'
                      : results
                        ? results.length === 0
                          ? 'No matches.'
                          : `${results.length} ${results.length === 1 ? 'match' : 'matches'}.`
                        : ''}
                  </p>
                  {searchFailed ? (
                    <p className="form__message" data-testid="lore-context-search-error">
                      Search isn’t working right now. Try again in a moment.
                    </p>
                  ) : term !== '' && !results ? (
                    <p className="entry__blank">Searching…</p>
                  ) : results && results.length === 0 ? (
                    <p className="entry__blank" data-testid="lore-context-no-results">
                      Nothing matches “<bdi>{term}</bdi>”.
                    </p>
                  ) : results ? (
                    <ul className="relations__rows" data-testid="lore-context-results">
                      {results.map((row) => rowOf(row, 'result'))}
                    </ul>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="lore-context-close"
          >
            Close
          </button>
        </footer>
      </div>

      <p className="visually-hidden" role="status" data-testid="lore-context-announcer">
        {announcement}
      </p>
    </dialog>
  )
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; entity: EntityDetail; relations: RelationshipView[] | null }

/** An entry in short: what it is, what it says about itself, what it records and who it is tied to. Read only. */
function LorePreview({
  universeId,
  entityId,
  chronology,
  isLinked,
  canLink,
  busy,
  onLink,
  onBack,
}: {
  universeId: string
  entityId: string
  chronology: Chronology
  isLinked: boolean
  canLink: boolean
  busy: boolean
  onLink: (row: { id: string; name: string }, link: boolean) => void
  onBack: () => void
}) {
  const [state, setState] = useState<PreviewState>({ kind: 'loading' })
  const nameId = useId()
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    back.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getEntity(universeId, entityId, controller.signal)
      .then(async (entity) => {
        // The relations are extra: the preview stands without them.
        const relations = await listEntityRelationships(
          universeId,
          entityId,
          controller.signal,
        ).catch(() => null)
        if (!controller.signal.aborted) setState({ kind: 'ready', entity, relations })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })
    return () => controller.abort()
  }, [universeId, entityId])

  const facts =
    state.kind === 'ready'
      ? state.entity.fields
          .map((value) => ({ name: value.name, text: String(renderFact(value, chronology)) }))
          .filter((fact) => fact.text !== '—')
      : []

  return (
    <article className="lorepreview" aria-labelledby={nameId} data-testid="lore-preview">
      <button
        ref={back}
        className="button button--text lorepreview__back"
        type="button"
        onClick={onBack}
        data-testid="lore-preview-back"
      >
        <ActionIcon icon={ArrowLeft} />
        Back to lore
      </button>

      {state.kind === 'loading' ? (
        <p className="entry__blank" role="status" id={nameId}>
          Opening the entry…
        </p>
      ) : null}
      {state.kind === 'missing' ? (
        <p className="entry__blank" id={nameId} data-testid="lore-preview-missing">
          This entry isn’t available. It may be in the Trash.
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="form__message" role="alert" id={nameId} data-testid="lore-preview-error">
          This entry couldn’t be opened. Go back and try again.
        </p>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <header className="lorepreview__head">
            <EntityTile
              className="lorepreview__tile"
              universeId={universeId}
              entityId={state.entity.id}
              image={state.entity.image}
              typeIcon={state.entity.entityTypeIcon}
              typeAccent={state.entity.entityTypeAccentColor}
            />
            <div className="relation__body">
              <h3 className="lorepreview__name" id={nameId} data-testid="lore-preview-name">
                <bdi>{state.entity.name}</bdi>
              </h3>
              <p className="relation__meta">
                <bdi>{state.entity.entityTypeName}</bdi>
                <StatusBadge
                  step={state.entity.canonStatus}
                  label={CANON_LABELS[state.entity.canonStatus]}
                />
              </p>
            </div>
          </header>

          {state.entity.summary ? (
            <p className="prose lorepreview__summary" data-testid="lore-preview-summary">
              {state.entity.summary}
            </p>
          ) : null}

          {state.entity.aliases.length > 0 || facts.length > 0 ? (
            <dl className="facts" data-testid="lore-preview-facts">
              {state.entity.aliases.length > 0 ? (
                <div className="facts__row">
                  <dt className="facts__key">Also known as</dt>
                  <dd className="facts__value prose">{state.entity.aliases.join(', ')}</dd>
                </div>
              ) : null}
              {facts.map((fact) => (
                <div className="facts__row" key={fact.name}>
                  <dt className="facts__key">{fact.name}</dt>
                  <dd className="facts__value prose">{fact.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {state.relations && state.relations.length > 0 ? (
            <div className="lorepreview__relations">
              <p className="facts__key">Connections</p>
              <ul className="lorepreview__list" data-testid="lore-preview-relations">
                {state.relations.slice(0, MAX_RELATIONS).map((relation) => (
                  <li key={relation.id}>
                    {relation.label} <bdi>{relation.relatedEntityName}</bdi>
                  </li>
                ))}
              </ul>
              {state.relations.length > MAX_RELATIONS ? (
                <p className="relation__meta">
                  And {state.relations.length - MAX_RELATIONS} more on the entry’s page.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="lorepreview__actions">
            {canLink ? (
              <button
                className={isLinked ? 'button button--secondary' : 'button'}
                type="button"
                aria-disabled={busy}
                onClick={() => onLink({ id: state.entity.id, name: state.entity.name }, !isLinked)}
                data-testid={isLinked ? 'lore-preview-unlink' : 'lore-preview-link'}
              >
                {isLinked ? 'Unlink from scene' : 'Link to scene'}
              </button>
            ) : null}
            <Link
              className="button button--text"
              to={`/app/universes/${universeId}/lore/${state.entity.id}`}
              data-testid="lore-preview-open"
            >
              Open entry
            </Link>
          </div>
        </>
      ) : null}
    </article>
  )
}
