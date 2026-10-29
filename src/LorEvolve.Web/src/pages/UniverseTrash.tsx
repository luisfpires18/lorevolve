import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import {
  ArchiveRestore,
  BookOpen,
  CircleDot,
  Feather,
  FileText,
  Hourglass,
  ListChecks,
  Network,
  Scale,
  Spline,
  type LucideIcon,
} from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActionIcon } from '../components/ActionIcon'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { Quoted } from '../components/NameList'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { discardDraft } from '../lib/localDrafts'
import { unpublishContent } from '../publishing/api'
import { CANON_LABELS } from '../lore/types'
import {
  bulkDeleteFromTrash,
  deleteFromTrash,
  listTrash,
  restoredPath,
  restoreFromTrash,
  TRASH_SELECTION_CHANGED,
} from '../trash/api'
import {
  TRASH_KIND_LABELS,
  TrashBlock,
  TrashKind,
  TrashPublication,
  type TrashItem,
  type TrashKindValue,
  type TrashPage,
} from '../trash/types'
import { EmptyState } from '../components/EmptyState'
import { EntityTile } from '../components/EntityTile'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: TrashPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to what it brought back. */
interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

/** A row's identity: an id is only unique within its kind. */
function keyOf(item: TrashItem) {
  return `${item.kind}:${item.id}`
}

/** Where a row was, in the words the author knows it by. */
function whereItWas(item: TrashItem) {
  switch (item.kind) {
    case TrashKind.Entry:
      return (
        <>
          {item.entityTypeName ? <bdi>{item.entityTypeName}</bdi> : null}
          {item.entityTypeName && item.canonStatus !== null ? ' · ' : null}
          {item.canonStatus === null ? null : CANON_LABELS[item.canonStatus]}
        </>
      )
    case TrashKind.Story:
      return 'A whole story, with everything in it'
    case TrashKind.PlotBeat:
      return (
        <>
          In the arc <Quoted text={item.plotArcTitle ?? ''} /> of{' '}
          <Quoted text={item.storyTitle ?? ''} />
        </>
      )
    case TrashKind.WorldRule:
      return 'In World Rules'
    case TrashKind.Relationship:
      return 'A relationship between two entries'
    case TrashKind.TimelineEvent:
      return item.canonStatus === null ? (
        'On the timeline'
      ) : (
        <>On the timeline · {CANON_LABELS[item.canonStatus]}</>
      )
    default:
      return (
        <>
          In <Quoted text={item.storyTitle ?? ''} />
        </>
      )
  }
}

/** Why a row cannot come back yet, if it cannot. */
function blockedText(item: TrashItem) {
  if (item.blockedBy === TrashBlock.StoryInTrash) {
    return (
      <>
        Its story, <Quoted text={item.storyTitle ?? ''} />, is in the Trash too. Restore the story
        first.
      </>
    )
  }
  if (item.blockedBy === TrashBlock.EntryInTrash) {
    return <>One of the entries it connects is in the Trash too. Restore that entry first.</>
  }
  if (item.blockedBy === TrashBlock.ArcInTrash) {
    return (
      <>
        Its arc, <Quoted text={item.plotArcTitle ?? ''} />, is in the Trash too. Restore the arc
        first.
      </>
    )
  }
  return null
}

function backText(item: TrashItem) {
  const name = <Quoted text={item.name} />
  switch (item.kind) {
    case TrashKind.Entry:
      return <>{name} is back in your lore.</>
    case TrashKind.Story:
      return <>{name} is back in your stories.</>
    case TrashKind.Chapter:
      return (
        <>
          The chapter {name} is back in <Quoted text={item.storyTitle ?? ''} />, after its other
          chapters. No scene was moved into it.
        </>
      )
    case TrashKind.Scene:
      return (
        <>
          The scene {name} is back in <Quoted text={item.storyTitle ?? ''} />.
        </>
      )
    case TrashKind.PlotArc:
      return (
        <>
          The arc {name} is back in <Quoted text={item.storyTitle ?? ''} />.
        </>
      )
    case TrashKind.PlotBeat:
      return (
        <>
          The beat {name} is back in <Quoted text={item.plotArcTitle ?? ''} />.
        </>
      )
    case TrashKind.WorldRule:
      return <>The world rule {name} is back in World Rules.</>
    case TrashKind.Relationship:
      return <>The relationship {name} is back on both of its entries.</>
    case TrashKind.TimelineEvent:
      return <>The moment {name} is back on the timeline.</>
  }
}

/**
 * What deleting a row permanently takes with it, in the author's words. Only what the row owns: a chapter's scenes went
 * to Unchaptered when it was put in the Trash, so they are not among it.
 */
function eraseText(kind: TrashKindValue) {
  switch (kind) {
    case TrashKind.Entry:
      return 'Its article, fields, picture and saved versions go with it, and links and references to it in your lore, timeline, stories and ideas are removed.'
    case TrashKind.Story:
      return 'Everything in it goes with it: its chapters, its scenes with their writing and saved versions, and its plot arcs and beats, including any of them that are in the Trash on their own.'
    case TrashKind.Chapter:
      return 'Only the chapter goes: its title, summary and notes. The scenes it held moved to Unchaptered when it was put in the Trash, and they stay there.'
    case TrashKind.Scene:
      return 'Its writing and every saved version of it go with it, and its links to lore, beats and ideas are removed.'
    case TrashKind.PlotArc:
      return 'Every beat in it goes with it, including any of its beats that are in the Trash on their own.'
    case TrashKind.PlotBeat:
      return 'Its links to scenes, lore and ideas are removed.'
    case TrashKind.WorldRule:
      return 'Its check goes with it, if it has one.'
    case TrashKind.Relationship:
      return 'Only the relationship goes. The two entries it connects stay as they are.'
    case TrashKind.TimelineEvent:
      return 'Its participants, story links and details go with it. The entries and stories it named stay as they are.'
  }
}

/**
 * What this universe has thrown away, and the one thing to do about each of it.
 *
 * A list, not a dashboard. Nothing is counted, charted or summarised here: the question the screen answers is "what did I
 * lose, and can I have it back". Each row says what it is in words - an entry, a story, a chapter, a scene, an arc, a beat
 * - and where it was, and every other fact about it is readable in its own place the moment it returns.
 *
 * A row whose story or arc is in the Trash too says so and waits: it is never put somewhere else instead.
 *
 * Every row can also be deleted permanently (ADR 0015, 0029 and 0033, amended): a quiet second action that asks first, in
 * the row, naming what goes with it. Never the loud one - Restore is. A row that must wait to be restored can still be
 * deleted.
 */
export default function UniverseTrash() {
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()

  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [restoring, setRestoring] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)
  // A restore that would publish again asks first (Task 012); the question sits in the row it is about.
  const [confirming, setConfirming] = useState<TrashItem | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const restoreButtons = useRef(new Map<string, HTMLButtonElement>())

  // Deleting permanently asks first too, in the row; while it asks or works, nothing else in the list can start.
  const [erasing, setErasing] = useState<TrashItem | null>(null)
  const [eraseBusy, setEraseBusy] = useState(false)
  const [eraseError, setEraseError] = useState<ReactNode>(null)
  const eraseRef = useRef<HTMLDivElement>(null)
  const eraseButtons = useRef(new Map<string, HTMLButtonElement>())

  // Selecting, to delete several rows permanently together. A mode the author turns on, so ordinary browsing carries no
  // checkboxes; while it is on, the rows' own Restore and Delete permanently… step aside, so one row cannot be restored or
  // erased on its own while others are selected.
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<{ page: number; keys: ReadonlySet<string> }>({
    page: 1,
    keys: new Set(),
  })
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkWorking = useRef(false)
  const bulkPanelRef = useRef<HTMLDivElement>(null)
  const bulkDeleteRef = useRef<HTMLButtonElement>(null)
  const selectPageRef = useRef<HTMLButtonElement>(null)
  const selectToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (bulkConfirming) bulkPanelRef.current?.focus()
  }, [bulkConfirming])

  // Cancelling hands the focus back to the button that asked - once it is enabled again, so after the render.
  const returnFocusTo = useRef<string | null>(null)
  const returnEraseFocusTo = useRef<string | null>(null)

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus()
    } else if (returnFocusTo.current) {
      restoreButtons.current.get(returnFocusTo.current)?.focus()
      returnFocusTo.current = null
    }
  }, [confirming])

  useEffect(() => {
    if (erasing) {
      eraseRef.current?.focus()
    } else if (returnEraseFocusTo.current) {
      eraseButtons.current.get(returnEraseFocusTo.current)?.focus()
      returnEraseFocusTo.current = null
    }
  }, [erasing])

  function askToErase(item: TrashItem) {
    setBlocked(null)
    setOutcome(null)
    setEraseError(null)
    setErasing(item)
  }

  function cancelErasing() {
    if (eraseBusy) return
    returnEraseFocusTo.current = erasing?.id ?? null
    setEraseError(null)
    setErasing(null)
  }

  function cancelConfirming() {
    returnFocusTo.current = confirming?.id ?? null
    setConfirming(null)
  }

  const load = useCallback(
    (signal?: AbortSignal) => {
      listTrash(universe.id, page, signal)
        .then((result) => {
          // A restore or a delete - which can take a story's or arc's own rows with it - can empty the page it was on:
          // step back to the last page there is rather than show an empty page that used to have something on it.
          if (result.items.length === 0 && result.page > 1) {
            setPage(Math.max(1, result.totalPages))
            return
          }
          setState({ kind: 'ready', page: result })
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not open the Trash.',
          })
        })
    },
    [universe.id, page],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  // The row that was restored leaves the list, taking the focus with it: the focus goes to what happened instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  function askToRestore(item: TrashItem) {
    // Someone who cannot publish has no choice to make: the server restores whatever was selected as private (ADR 0041).
    if (item.publication === TrashPublication.None || !access.publish) {
      void restore(item)
      return
    }
    setBlocked(null)
    setOutcome(null)
    setConfirming(item)
  }

  /**
   * `keepPrivate` restores and then takes the selection back at once - the only order the API allows, since an item in
   * the Trash has no publication route. The window between the two is one round trip.
   */
  async function restore(item: TrashItem, keepPrivate = false) {
    setConfirming(null)
    setRestoring(item.id)
    setBlocked(null)
    setOutcome(null)

    try {
      await restoreFromTrash(universe.id, item)
      let privateNote: ReactNode = null
      if (!access.publish && item.publication !== TrashPublication.None) {
        privateNote = ' It was restored privately: only the owner can publish it again.'
      } else if (keepPrivate) {
        try {
          await unpublishContent(
            universe.id,
            item.kind === TrashKind.Entry ? 'entry' : 'story',
            item.id,
          )
          privateNote = ' It is private now.'
        } catch {
          privateNote = ' It could not be made private: open it and choose Make private.'
        }
      }
      setOutcome({
        text: (
          <>
            {backText(item)}
            {privateNote}
          </>
        ),
        link: {
          to: restoredPath(universe.id, item),
          label: (
            <>
              Open <Quoted text={item.name} />
            </>
          ),
        },
      })

      load()
    } catch (error: unknown) {
      // Nothing moved either way: a refused restore writes nothing, so the row is still in the list below and can be
      // tried again once the objection is dealt with.
      const findings = blockingFindingsOf(error)
      if (findings) {
        setBlocked(findings)
      } else {
        setOutcome({
          text:
            error instanceof Error ? (
              error.message
            ) : (
              <>
                <Quoted text={item.name} /> could not be restored.
              </>
            ),
          link: null,
        })
      }
      load()
    } finally {
      setRestoring(null)
    }
  }

  /** Deletes the row the author confirmed, once. A failure leaves the row, and the question, where they were. */
  async function erase(item: TrashItem) {
    if (eraseBusy) return
    setEraseBusy(true)
    setEraseError(null)

    let erasedSceneIds: string[]
    try {
      erasedSceneIds = await deleteFromTrash(universe.id, item)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 404) {
        // Restored or deleted somewhere else meanwhile: there is nothing left here to delete.
        setErasing(null)
        setOutcome({
          text: (
            <>
              <Quoted text={item.name} /> is no longer in the Trash, so nothing was deleted.
            </>
          ),
          link: null,
        })
        load()
      } else {
        setEraseError(
          <>
            <Quoted text={item.name} /> could not be deleted just now. Try again.
          </>,
        )
      }
      setEraseBusy(false)
      return
    }

    // Only now that the server has erased it: the recovery copies of unsaved writing this device kept for what went - an
    // entry's article, a scene's manuscript, every scene of a story - have nothing left to recover into. Scoped by id, so
    // no other copy is touched. Best effort, like every recovery-copy write: storage that fails never undoes the delete,
    // and a copy it could not drop is never offered, because nothing can open the scene or entry it names.
    if (user) {
      const scopes = [
        ...(item.kind === TrashKind.Entry
          ? [{ kind: 'article' as const, contentId: item.id }]
          : []),
        ...erasedSceneIds.map((contentId) => ({ kind: 'manuscript' as const, contentId })),
      ]
      for (const scope of scopes) {
        void discardDraft({ accountId: user.id, universeId: universe.id, ...scope }).catch(
          () => undefined,
        )
      }
    }

    setEraseBusy(false)
    setErasing(null)
    setOutcome({
      text: (
        <>
          <Quoted text={item.name} /> was permanently deleted.
        </>
      ),
      link: null,
    })
    load()
  }

  const result = state.kind === 'ready' ? state.page : null
  const pageItems = result?.items ?? []

  // What is selected belongs to the page on screen, as in Lore: another page is another list, so nothing is ever selected
  // out of sight. Reset while rendering, so no frame shows an old page's selection; and only rows still on screen count.
  if (selection.page !== page) setSelection({ page, keys: new Set() })
  const selectedKeys = selection.page === page ? selection.keys : new Set<string>()
  const selected = pageItems.filter((item) => selectedKeys.has(keyOf(item)))
  // While the question is open or the delete is working, the selection cannot change underneath it.
  const selectionLocked = bulkConfirming || bulkBusy

  function toggle(item: TrashItem) {
    if (selectionLocked) return
    const next = new Set(selectedKeys)
    if (next.has(keyOf(item))) next.delete(keyOf(item))
    else next.add(keyOf(item))
    setSelection({ page, keys: next })
  }

  function selectPage() {
    setSelection({ page, keys: new Set(pageItems.map(keyOf)) })
    // Select page has nothing left to do once it has; the next step is the delete.
    requestAnimationFrame(() => bulkDeleteRef.current?.focus())
  }

  function clearSelection() {
    setSelection({ page, keys: new Set() })
    requestAnimationFrame(() => selectPageRef.current?.focus())
  }

  function stopSelecting() {
    setSelection({ page, keys: new Set() })
    setIsSelecting(false)
    setBulkConfirming(false)
    setBulkError(null)
  }

  function startSelecting() {
    setOutcome(null)
    setBlocked(null)
    setIsSelecting(true)
  }

  function askToBulkErase() {
    if (selected.length === 0) return
    setOutcome(null)
    setBlocked(null)
    setBulkError(null)
    setBulkConfirming(true)
  }

  function cancelBulkErase() {
    if (bulkBusy) return
    setBulkError(null)
    setBulkConfirming(false)
    // The question replaced the bar; the focus goes back to the button that asked, once the bar is back.
    requestAnimationFrame(() => bulkDeleteRef.current?.focus())
  }

  /**
   * Erases every selected row in one request, every one or none. A failure the list is still right about keeps the
   * selection and the question for another try; a Trash that changed underneath (409) deleted nothing, and the selection,
   * now naming rows that may not be there, is let go.
   */
  async function bulkErase() {
    if (bulkWorking.current || selected.length === 0) return
    bulkWorking.current = true
    setBulkBusy(true)
    setBulkError(null)

    try {
      const erased = await bulkDeleteFromTrash(universe.id, selected)

      // Only now that the server has erased them: exactly the recovery copies of what went - each erased entry's article,
      // each erased scene's manuscript, a story's scenes among them - and nothing else. Best effort, as for one row.
      if (user) {
        const scopes = [
          ...erased.erasedEntryIds.map((contentId) => ({ kind: 'article' as const, contentId })),
          ...erased.erasedSceneIds.map((contentId) => ({ kind: 'manuscript' as const, contentId })),
        ]
        for (const scope of scopes) {
          void discardDraft({ accountId: user.id, universeId: universe.id, ...scope }).catch(
            () => undefined,
          )
        }
      }

      stopSelecting()
      setOutcome({
        text:
          erased.deleted === 1
            ? '1 item was permanently deleted.'
            : `${erased.deleted} items were permanently deleted.`,
        link: null,
      })
      load()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === TRASH_SELECTION_CHANGED) {
        stopSelecting()
        setOutcome({
          text: 'The Trash changed before these items could be deleted, so nothing was deleted. Select them again.',
          link: null,
        })
        load()
      } else {
        setBulkError(
          'Nothing was deleted. The selected items could not be deleted just now. Try again.',
        )
      }
    } finally {
      bulkWorking.current = false
      setBulkBusy(false)
    }
  }

  const busy = restoring !== null || confirming !== null || erasing !== null

  return (
    <article className="trash">
      <PageHeader
        title="Trash"
        lede={
          <>
            {access.permanentlyDelete ? (
              <p>
                What you removed from your lore, your stories and your world rules. Everything here
                can be restored with everything it held, until you choose to delete it permanently.
              </p>
            ) : (
              <p>
                What was removed from this universe&rsquo;s lore, stories and world rules.
                Everything here can be restored with everything it held. Restored items that were
                public will be restored privately. Only the owner can delete anything permanently.
              </p>
            )}
            {access.keepIdeas ? (
              <p data-testid="trash-ideas-pointer">
                Deleted ideas are not here: they belong to your account, and wait in{' '}
                <Link to={`/app/universes/${universe.id}/ideas?view=deleted`}>
                  Ideas, under Recently deleted
                </Link>
                .
              </p>
            ) : null}
          </>
        }
        actions={
          // Selecting is for erasing in bulk, which is the owner's alone (ADR 0041).
          access.permanentlyDelete && (pageItems.length > 0 || isSelecting) ? (
            <button
              ref={selectToggleRef}
              className="button button--secondary trash__select"
              type="button"
              aria-pressed={isSelecting}
              disabled={busy || bulkBusy}
              onClick={() => (isSelecting ? stopSelecting() : startSelecting())}
              data-testid="trash-select"
            >
              <ActionIcon icon={ListChecks} />
              Select
            </button>
          ) : null
        }
      />

      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {outcome ? (
        <div className="notice trash__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="trash-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="trash-open">
              {outcome.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Looking through the Trash…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--secondary" type="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="trash__list" data-testid="trash-list">
          {result.items.map((item) => {
            const kind = TRASH_KIND_LABELS[item.kind]
            const waiting = blockedText(item)
            const waitingId = `trash-waiting-${item.id}`
            const isChecked = isSelecting && selectedKeys.has(keyOf(item))

            const what = (
              <>
                {/* What it is, at a glance: an entry's type tile, or the icon of the story part or rule. The kind is
                    said in words beside the name, so the tile is decorative. */}
                {item.kind === TrashKind.Entry ? (
                  <EntityTile
                    className="trash__tile"
                    universeId={universe.id}
                    entityId={item.id}
                    image={null}
                    typeIcon={item.entityTypeIcon}
                    typeAccent={item.entityTypeAccentColor}
                  />
                ) : (
                  <KindTile kind={item.kind} />
                )}
                <div className="trash__what">
                  <p className="trash__name">
                    <bdi>{item.name}</bdi>
                  </p>
                  <p className="trash__meta">
                    <span className="trash__kind" data-testid="trash-kind">
                      {kind}
                    </span>{' '}
                    · {whereItWas(item)} · removed {formatDateTime(item.trashedAt)}
                  </p>
                  {waiting ? (
                    <p className="trash__waiting" id={waitingId} data-testid="trash-waiting">
                      {waiting}
                    </p>
                  ) : null}
                </div>
              </>
            )

            if (isSelecting) {
              // Selecting: the row is its checkbox's label, so pressing anywhere on it - or Space on the box - selects
              // it. Restore and Delete permanently… step aside until selecting is done.
              return (
                <li
                  className="trash__row"
                  key={keyOf(item)}
                  data-testid={`trash-row-${item.name}`}
                  data-kind={kind}
                  data-selected={isChecked ? 'true' : undefined}
                >
                  <label className="trash__pick">
                    <input
                      className="trash__check"
                      type="checkbox"
                      checked={isChecked}
                      disabled={selectionLocked}
                      onChange={() => toggle(item)}
                      aria-label={`Select ${kind.toLowerCase()} “${item.name}”`}
                      data-testid={`select-${item.name}`}
                    />
                    {what}
                  </label>
                </li>
              )
            }

            return (
              <li
                className="trash__row"
                key={keyOf(item)}
                data-testid={`trash-row-${item.name}`}
                data-kind={kind}
              >
                {what}
                <div className="trash__actions">
                  <button
                    ref={(node) => {
                      if (node) restoreButtons.current.set(item.id, node)
                      else restoreButtons.current.delete(item.id)
                    }}
                    className="button button--secondary"
                    type="button"
                    disabled={busy || waiting !== null}
                    aria-label={`Restore ${kind.toLowerCase()} “${item.name}”`}
                    aria-describedby={waiting ? waitingId : undefined}
                    onClick={() => askToRestore(item)}
                    data-testid={`restore-${item.name}`}
                  >
                    <ActionIcon icon={ArchiveRestore} />
                    {restoring === item.id ? 'Restoring…' : 'Restore'}
                  </button>
                  {access.permanentlyDelete ? (
                    <button
                      ref={(node) => {
                        if (node) eraseButtons.current.set(item.id, node)
                        else eraseButtons.current.delete(item.id)
                      }}
                      className="button button--text trash__erase"
                      type="button"
                      disabled={busy}
                      aria-label={`Delete permanently: ${kind.toLowerCase()} “${item.name}”`}
                      onClick={() => askToErase(item)}
                      data-testid={`erase-${item.name}`}
                    >
                      Delete permanently…
                    </button>
                  ) : null}
                </div>
                {confirming?.id === item.id && confirming.kind === item.kind ? (
                  <RestorePublicConfirm
                    item={item}
                    panelRef={confirmRef}
                    onRestore={() => void restore(item)}
                    onRestorePrivate={() => void restore(item, true)}
                    onCancel={cancelConfirming}
                  />
                ) : null}
                {erasing?.id === item.id && erasing.kind === item.kind ? (
                  <EraseConfirm
                    item={item}
                    panelRef={eraseRef}
                    busy={eraseBusy}
                    error={eraseError}
                    onErase={() => void erase(item)}
                    onCancel={cancelErasing}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="trash-empty"
          title="The Trash is empty."
          hint="Anything you remove from your lore, your stories or your world rules waits here."
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1 || selectionLocked}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages || selectionLocked}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}

      {isSelecting && bulkConfirming ? (
        <BulkEraseConfirm
          items={selected}
          panelRef={bulkPanelRef}
          busy={bulkBusy}
          error={bulkError}
          onErase={() => void bulkErase()}
          onCancel={cancelBulkErase}
        />
      ) : null}

      {isSelecting && !bulkConfirming ? (
        <footer className="actionbar trash__selectbar" data-testid="trash-selectbar">
          <p className="actionbar__status" role="status" data-testid="trash-selected-count">
            {selected.length === 0
              ? 'Select rows on this page to delete them permanently.'
              : `${selected.length} selected`}
          </p>
          <div className="actionbar__actions">
            {/* The one red control on the screen while selecting; the selection's own tools stay neutral. */}
            <button
              ref={bulkDeleteRef}
              className="button button--secondary button--danger-quiet"
              type="button"
              onClick={askToBulkErase}
              disabled={selected.length === 0}
              data-testid="trash-bulk-delete"
            >
              {selected.length > 0
                ? `Delete permanently (${selected.length})`
                : 'Delete permanently'}
            </button>
            <button
              ref={selectPageRef}
              className="button button--secondary"
              type="button"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="trash-select-page"
            >
              Select page
            </button>
            <button
              className="button button--text"
              type="button"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="trash-clear-selection"
            >
              Clear selection
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                stopSelecting()
                requestAnimationFrame(() => selectToggleRef.current?.focus())
              }}
              data-testid="trash-select-done"
            >
              Done
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  )
}

/**
 * The question before a restore that touches the public portal. Trash keeps an entry's or story's public selection, so
 * restoring it brings that back: straight into public view when its universe is public, or silently selected when it
 * is not. The copy says which, and never claims visibility the item will not have.
 */
function RestorePublicConfirm({
  item,
  panelRef,
  onRestore,
  onRestorePrivate,
  onCancel,
}: {
  item: TrashItem
  panelRef: React.RefObject<HTMLDivElement | null>
  onRestore: () => void
  onRestorePrivate: () => void
  onCancel: () => void
}) {
  const noun = item.kind === TrashKind.Entry ? 'entry' : 'story'
  const visible = item.publication === TrashPublication.Visible
  const titleId = `trash-confirm-${item.id}`

  return (
    <div
      className="trash__confirm"
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-publication-confirm"
      data-publication={visible ? 'visible' : 'hidden'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <p className="trash__confirmtitle" id={titleId}>
        {visible ? (
          <>
            Restoring <Quoted text={item.name} /> makes it public again.
          </>
        ) : (
          <>
            <Quoted text={item.name} /> is still selected for publication.
          </>
        )}
      </p>
      <p className="trash__confirmtext" data-testid="trash-publication-text">
        {visible
          ? `This ${noun} was public before it was moved to the Trash. Restoring it will make it visible again in your public universe, to anyone, straight away.`
          : `It was selected for publication before it was moved to the Trash. Readers cannot see it now, and restoring it does not change that: it would appear once ${
              item.kind === TrashKind.Story
                ? 'this universe is public and the story has a public summary'
                : 'this universe is public'
            }.`}
      </p>
      <div className="form__actions">
        <button
          className="button"
          type="button"
          onClick={onRestore}
          data-testid="trash-confirm-restore"
        >
          {visible ? 'Restore and publish' : 'Restore, keep selected'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onRestorePrivate}
          data-testid="trash-confirm-private"
        >
          Restore as private
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onCancel}
          data-testid="trash-confirm-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * The one question before something is erased for good: what it is, what goes with it, and that it cannot be undone. One
 * deliberate confirmation - nothing to type - in the row it is about, as the universe's own deletion asks in Settings.
 */
function EraseConfirm({
  item,
  panelRef,
  busy,
  error,
  onErase,
  onCancel,
}: {
  item: TrashItem
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  error: ReactNode
  onErase: () => void
  onCancel: () => void
}) {
  const titleId = `trash-erase-title-${item.id}`
  const textId = `trash-erase-text-${item.id}`

  return (
    <div
      className="trash__confirm"
      role="group"
      aria-labelledby={titleId}
      aria-describedby={textId}
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-erase-confirm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <p className="trash__confirmtitle" id={titleId}>
        Permanently delete the {TRASH_KIND_LABELS[item.kind].toLowerCase()}{' '}
        <Quoted text={item.name} />?
      </p>
      <p className="trash__confirmtext" id={textId} data-testid="trash-erase-text">
        {eraseText(item.kind)} <strong className="trash__final">This cannot be undone.</strong>
      </p>
      {error ? (
        <p className="trash__confirmerror" role="alert" data-testid="trash-erase-error">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
        <button
          className="button button--danger"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onErase}
          data-testid="trash-erase-delete"
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onCancel}
          data-testid="trash-erase-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * The one question before a selection is erased for good: how many, which ones by kind and name, what goes with each kind
 * selected - said once per kind, from the same words a single row's question uses - and that it cannot be undone. A
 * selected story or arc takes rows that were not selected; a selected chapter takes none of its former scenes. It takes
 * the place of the selection bar, so nothing in the selection can change while it is open.
 */
function BulkEraseConfirm({
  items,
  panelRef,
  busy,
  error,
  onErase,
  onCancel,
}: {
  items: TrashItem[]
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  error: string | null
  onErase: () => void
  onCancel: () => void
}) {
  const kinds = [...new Set(items.map((item) => item.kind))].sort((a, b) => a - b)
  const count = items.length

  return (
    <div
      className="trash__confirm trash__bulkconfirm"
      role="group"
      aria-labelledby="trash-bulk-title"
      aria-describedby="trash-bulk-final"
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-bulk-confirm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <h2 className="trash__confirmtitle" id="trash-bulk-title">
        Permanently delete {count} selected {count === 1 ? 'item' : 'items'}?
      </h2>
      <ul className="trash__bulklist" aria-label="Selected" data-testid="trash-bulk-list">
        {items.map((item) => (
          <li key={keyOf(item)}>
            <span className="trash__kind">{TRASH_KIND_LABELS[item.kind]}</span>{' '}
            <bdi className="trash__bulkname">{item.name}</bdi>
          </li>
        ))}
      </ul>
      <ul className="trash__confirmtext trash__bulkconsequences" data-testid="trash-bulk-text">
        {kinds.map((kind) => (
          <li key={kind} data-kind={TRASH_KIND_LABELS[kind]}>
            <span className="trash__kind">Each {TRASH_KIND_LABELS[kind].toLowerCase()}:</span>{' '}
            {eraseText(kind)}
          </li>
        ))}
      </ul>
      <p className="trash__confirmtext" id="trash-bulk-final">
        <strong className="trash__final">This cannot be undone.</strong>
      </p>
      {error ? (
        <p className="trash__confirmerror" role="alert" data-testid="trash-bulk-error">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
        <button
          className="button button--danger"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onErase}
          data-testid="trash-bulk-delete-confirm"
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onCancel}
          data-testid="trash-bulk-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

const KIND_ICONS: Record<TrashKindValue, LucideIcon> = {
  [TrashKind.Entry]: FileText,
  [TrashKind.Story]: Feather,
  [TrashKind.Chapter]: BookOpen,
  [TrashKind.Scene]: FileText,
  [TrashKind.PlotArc]: Spline,
  [TrashKind.PlotBeat]: CircleDot,
  [TrashKind.WorldRule]: Scale,
  [TrashKind.Relationship]: Network,
  [TrashKind.TimelineEvent]: Hourglass,
}

/** A story part's or a rule's square: its kind's icon on the sunken paper, the shape an entry's tile has. */
function KindTile({ kind }: { kind: TrashKindValue }) {
  const Icon = KIND_ICONS[kind]
  return (
    <span className="tile tile--blank trash__tile" aria-hidden="true">
      <Icon className="tile__icon" strokeWidth={1.75} />
    </span>
  )
}
