import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { SaveAction } from './SaveAction'
import { Link } from 'react-router-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { IdeaReferencePicker } from './IdeaReferencePicker'
import { Quoted } from './NameList'
import { RecoveredDraft } from './RecoveredDraft'
import { useAuth } from '../auth/useAuth'
import {
  createIdea,
  deleteIdea,
  getIdea,
  IDEA_CHANGED,
  listAllUniverses,
  referenceContext,
  referencePath,
  saveIdea,
} from '../ideas/api'
import {
  IDEA_BODY_MAX_LENGTH,
  IDEA_REFERENCE_KIND_LABELS,
  IDEA_TITLE_MAX_LENGTH,
  type IdeaDetail,
  type IdeaReference,
  type IdeaUniverse,
} from '../ideas/types'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import type { UniverseSummary } from '../universes/types'
import { EmptyState } from './EmptyState'
import { confirmAction } from '../lib/confirm'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'elsewhere' }
  | { kind: 'error'; message: string }

/** What an author edits, and exactly what a recovery copy holds. */
interface Fields {
  title: string
  body: string
  universeId: string | null
  references: IdeaReference[]
}

/** The idea as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
interface Stored extends Fields {
  universe: IdeaUniverse | null
  updatedAt: string | null
}

const count = new Intl.NumberFormat('en')

function referenceKey(reference: { kind: number; id: string }) {
  return `${reference.kind}:${reference.id}`
}

function sameFields(a: Fields, b: Fields) {
  if (a.title !== b.title || a.body !== b.body || a.universeId !== b.universeId) return false
  const left = a.references.map(referenceKey).sort()
  const right = b.references.map(referenceKey).sort()
  return left.length === right.length && left.every((key, index) => key === right[index])
}

function storedFrom(idea: IdeaDetail): Stored {
  return {
    title: idea.title,
    body: idea.body,
    universeId: idea.universe?.id ?? null,
    universe: idea.universe,
    references: idea.references,
    updatedAt: idea.updatedAt,
  }
}

function fieldsOf({ title, body, universeId, references }: Fields): Fields {
  return { title, body, universeId, references }
}

/** Nothing written yet: what a new idea is before a key is pressed, whatever universe it starts in. */
function isBlank(fields: Fields) {
  return fields.title === '' && fields.body === '' && fields.references.length === 0
}

/** A recovery copy read back, or null when it is not one this editor could have kept. */
function parseCopy(content: string): Fields | null {
  try {
    const value = JSON.parse(content) as Partial<Fields> | null
    if (
      !value ||
      typeof value.title !== 'string' ||
      typeof value.body !== 'string' ||
      !(value.universeId === null || typeof value.universeId === 'string') ||
      !Array.isArray(value.references)
    ) {
      return null
    }
    return {
      title: value.title,
      body: value.body,
      universeId: value.universeId,
      references: value.references,
    }
  } catch {
    return null
  }
}

/** The stored moment a stale save's refusal reports, when it carries one. */
function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

function referenceCountLabel(total: number) {
  return total === 1 ? '1 reference' : `${total} references`
}

interface IdeaEditorProps {
  /** The idea being edited, or null for a new one. */
  ideaId: string | null
  /** The universe a new idea starts in - the one it was started from - or null. */
  defaultUniverseId: string | null
  /**
   * The universe this screen is inside, if any. Only its ideas open here: another idea named by the address shows nothing of
   * itself and points to all ideas, and one moved out while open says so.
   */
  contextUniverse: { id: string; name: string } | null
  /** Where this idea's list is, for the way back. */
  listPath: string
  listLabel: ReactNode
  onCreated: (idea: IdeaDetail) => void
  onDeleted: (idea: { id: string; title: string }) => void
}

/**
 * One idea: a title, a plain-text body, an optional universe and, while it has one, optional references to that
 * universe's lore and stories. The same editor for a new idea and an existing one, globally and inside a universe.
 *
 * An idea is not lore. Nothing saved here changes an entry, a story, Canon or the timeline, and the screen never offers
 * to turn it into any of them.
 *
 * Saving is explicit: Save, or Ctrl+S / Cmd+S. The idea is unsaved until the API confirms it, so a failed save changes
 * nothing on screen. A save over an idea saved from another tab or device since this one opened is refused, and the author
 * chooses: keep this version, or load that one. While anything is unsaved, following a link, signing out, the browser's
 * Back and Forward and leaving the page all ask first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere (ADR 0029, ADR 0030). If an idea
 * opens with a copy that differs from what is saved, the saved idea stays in the form, held, until the author recovers the
 * copy or discards it.
 *
 * Changing the universe while the idea references things asks first, and takes the references out of the unsaved idea in
 * plain sight: references stay inside one universe, and the change is only kept once it is saved.
 */
export function IdeaEditor({
  ideaId,
  defaultUniverseId,
  contextUniverse,
  listPath,
  listLabel,
  onCreated,
  onDeleted,
}: IdeaEditorProps) {
  const headingId = useId()
  const titleId = useId()
  const bodyId = useId()
  const universeFieldId = useId()
  const referencesId = useId()
  const statusId = useId()
  const recoveryId = useId()
  const bodyCountId = useId()

  const isNew = ideaId === null
  const { user } = useAuth()

  // An existing idea's copy belongs to the account, not to a universe: the idea outlives any universe it is in. A new
  // idea's copy is kept per place it was started, so one started in a universe is never offered in another.
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user
      ? {
          accountId: user.id,
          universeId: isNew ? defaultUniverseId : null,
          kind: 'idea',
          contentId: ideaId ?? 'new',
        }
      : null,
  )

  const [load, setLoad] = useState<LoadState>(isNew ? { kind: 'ready' } : { kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>(() => ({
    title: '',
    body: '',
    universeId: defaultUniverseId,
    universe: null,
    references: [],
    updatedAt: null,
  }))
  const [draft, setDraft] = useState<Fields>(() => fieldsOf(stored))
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const shortcut = useRef<() => void>(() => {})
  const contextUniverseId = contextUniverse?.id ?? null

  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()

    getIdea(ideaId, controller.signal)
      .then((idea) => {
        // Inside a universe only that universe's ideas open. An address naming one of the account's ideas that belongs to
        // another universe, or to none, shows nothing of it here and points to where it does open. An idea moved out while
        // it is open here stays on screen, saying so - that was the author's own save, not an address.
        if (contextUniverseId !== null && idea.universe?.id !== contextUniverseId) {
          setLoad({ kind: 'elsewhere' })
          return
        }
        const next = storedFrom(idea)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: 'This idea could not be opened.' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [isNew, ideaId, reads, contextUniverseId])

  useEffect(() => {
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        // Without the list, the field still shows the idea's own universe and "No universe"; choosing another waits.
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => {
      controller.abort()
    }
  }, [])

  const isReady = load.kind === 'ready'
  const isDirty = isReady && (isNew ? !isBlank(draft) : !sameFields(draft, stored))
  const isTooLong = draft.body.length > IDEA_BODY_MAX_LENGTH

  // A copy is worth offering when it holds something the saved idea does not - for a new idea, anything written at all.
  const copy = found ? parseCopy(found.content) : null
  const isNothingToRecover = (fields: Fields) =>
    isNew ? isBlank(fields) : sameFields(fields, stored)
  const offer = isReady && found && copy && !isNothingToRecover(copy) ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  // A copy identical to what is saved, or one this editor could not have written, goes without a word.
  const isUselessCopy =
    isReady && found !== undefined && found !== null && (copy === null || isNothingToRecover(copy))
  useEffect(() => {
    if (isUselessCopy) discard()
  }, [isUselessCopy, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) {
      keep(JSON.stringify(draft), stored.updatedAt)
    } else {
      forget()
    }
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  // A new idea starts in its title, once any copy has been looked for.
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!isNew || isHeld || focusedOnce.current) return
    focusedOnce.current = true
    titleInput.current?.focus()
  }, [isNew, isHeld])

  const name = draft.title.trim() || stored.title || 'This idea'
  useLeaveGuard(
    isDirty ? `“${name}” has unsaved changes. Leave without saving them?` : null,
    discard,
  )

  function edit(change: Partial<Fields>) {
    setDraft((current) => ({ ...current, ...change }))
    if (change.title !== undefined && fieldErrors.title) {
      setFieldErrors((current) => {
        const next = { ...current }
        delete next.title
        return next
      })
    }
  }

  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong || isHeld) return

    if (draft.title.trim() === '') {
      setFieldErrors({ title: 'Give the idea a title, so you can find it again.' })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(null)

    const input = {
      title: sent.title.trim(),
      body: sent.body,
      universeId: sent.universeId,
      references: sent.references.map(({ kind, id }) => ({ kind, id })),
      expectedUpdatedAt,
    }

    try {
      if (isNew) {
        const created = await createIdea(input)
        discard()
        onCreated(created)
        return
      }

      const saved = await saveIdea(ideaId, input)
      const next = storedFrom(saved)
      setStored(next)
      // What was sent is now saved - trimmed, and with its references' names as they are. Anything typed while the save
      // was in flight is still unsaved, and stays.
      setDraft((current) => (sameFields(current, sent) ? fieldsOf(next) : current))
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === IDEA_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This idea is no longer here, so it could not be saved. It may have been deleted in another window. Your writing is still here: copy it before you leave.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Something needs a change before this idea can be saved.',
        )
      } else {
        setFailure('The idea could not be saved. Your writing is still here. Try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: 'Replace this idea with the version saved elsewhere?',
        message: 'What you changed here since your last save will be lost.',
        confirmLabel: 'Use the saved version',
        cancelLabel: 'Keep my changes',
        variant: 'destructive',
      }))
    ) {
      return
    }
    discard()
    reread()
  }

  function recoverDraft() {
    if (!offer || !copy) return
    settle()

    // A copy may name a universe that has since been deleted: the idea is kept, unassigned, and so is the copy.
    const universeGone =
      copy.universeId !== null &&
      universes !== null &&
      !universes.some((universe) => universe.id === copy.universeId)

    setDraft(universeGone ? { ...copy, universeId: null, references: [] } : copy)
    setAnnouncement(
      universeGone
        ? 'The recovered draft is in the form, unassigned: the universe it named no longer exists. It is not saved yet.'
        : 'The recovered draft is in the form. It is not saved yet.',
    )
    requestAnimationFrame(() => titleInput.current?.focus())
  }

  function discardDraft() {
    discard()
    setAnnouncement(
      isNew
        ? 'The recovered draft was discarded.'
        : 'The recovered draft was discarded. The saved idea is unchanged.',
    )
    requestAnimationFrame(() => titleInput.current?.focus())
  }

  async function changeUniverse(next: string | null) {
    if (next === draft.universeId) return
    if (draft.references.length > 0) {
      const confirmed = await confirmAction({
        title: "Change this idea's universe?",
        message: `An idea's references stay inside its universe. Changing the universe takes this idea's ${referenceCountLabel(draft.references.length)} out of it. Nothing is saved until you save.`,
        confirmLabel: 'Change universe',
        variant: 'warning',
      })
      if (!confirmed) return
      edit({ universeId: next, references: [] })
      setAnnouncement('Universe changed. Its references were taken out of the unsaved idea.')
      return
    }
    edit({ universeId: next })
  }

  function addReference(reference: IdeaReference) {
    setIsPicking(false)
    if (!draft.references.some((current) => referenceKey(current) === referenceKey(reference))) {
      edit({ references: [...draft.references, reference] })
    }
    setAnnouncement(`Added a reference to “${reference.name}”. It is not saved yet.`)
    requestAnimationFrame(() => addButton.current?.focus())
  }

  function removeReference(reference: IdeaReference) {
    edit({
      references: draft.references.filter(
        (current) => referenceKey(current) !== referenceKey(reference),
      ),
    })
    setAnnouncement(`Removed the reference to “${reference.name}”. It is not saved yet.`)
    requestAnimationFrame(() => addButton.current?.focus())
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const deleted = await confirmAction({
      title: (
        <>
          Delete “<bdi>{title}</bdi>”?
        </>
      ),
      message: isDirty
        ? 'Your unsaved changes will be lost. The idea as last saved goes to Recently deleted, where you can restore it.'
        : 'It goes to Recently deleted, where you can restore it.',
      confirmLabel: 'Delete idea',
      busyLabel: 'Deleting…',
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? 'This idea is no longer here. It may already have been deleted in another window.'
          : 'The idea could not be deleted. Try again.',
      action: () => deleteIdea(ideaId),
    })
    if (!deleted) return
    discard()
    onDeleted({ id: ideaId, title })
  }

  if (load.kind === 'loading') {
    return (
      <p className="notice" role="status" data-testid="idea-loading">
        Opening the idea…
      </p>
    )
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="idea-missing"
        title="This idea is not here."
        hint={
          <>
            It may have been deleted, or it belongs to someone else. Deleted ideas wait in{' '}
            <Link to={`${listPath}?view=deleted`}>Recently deleted</Link>.
          </>
        }
      />
    )
  }

  if (load.kind === 'elsewhere') {
    return (
      <EmptyState
        testId="idea-not-in-universe"
        title={
          <>
            This idea is not in <Quoted text={contextUniverse?.name ?? ''} />.
          </>
        }
        hint={
          <>
            It belongs to another universe, or to none, so it does not open here.{' '}
            <Link to={`/app/ideas/${ideaId}`}>Open it in all ideas</Link>, or go back to{' '}
            <Link to={listPath}>{listLabel}</Link>.
          </>
        }
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="idea-load-error">
        <p>{load.message}</p>
        <button className="button button--secondary" type="button" onClick={reread}>
          Try again
        </button>
      </div>
    )
  }

  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)

  const nearLimit = draft.body.length > IDEA_BODY_MAX_LENGTH * 0.9
  const belongsElsewhere =
    !isNew && contextUniverse !== null && stored.universeId !== contextUniverse.id

  return (
    <article className="idea" aria-labelledby={headingId} data-testid="idea-editor">
      <header className="idea__head">
        <Link className="idea__back" to={listPath} data-testid="idea-back">
          {listLabel}
        </Link>
        <div className="doc__titlerow">
          <h1 className="idea__heading" id={headingId} data-testid="idea-heading">
            {isNew ? 'New idea' : <bdi>{stored.title}</bdi>}
          </h1>
          {!isNew ? (
            <ActionMenu label={`More actions for ${stored.title}`} triggerTestId="idea-actions">
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={isSaving}
                onClick={() => void remove()}
                data-testid="idea-delete"
              >
                <ActionIcon icon={Trash2} />
                Delete idea
              </button>
            </ActionMenu>
          ) : null}
        </div>
        <p className="idea__lede">
          A possibility, not lore. Nothing saved here changes your world.
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              Last saved <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>
              .
            </>
          ) : null}
        </p>
        {belongsElsewhere ? (
          <p className="idea__elsewhere" data-testid="idea-elsewhere">
            {stored.universe ? (
              <>
                This idea belongs to <Quoted text={stored.universe.name} />, not to{' '}
                <Quoted text={contextUniverse.name} />.
              </>
            ) : (
              'This idea belongs to no universe.'
            )}{' '}
            <Link to={`/app/ideas/${ideaId}`}>Open it in all ideas</Link>
          </p>
        ) : null}
      </header>

      {offer && copy ? (
        <div id={recoveryId}>
          <RecoveredDraft
            what={isNew ? 'a new idea' : 'this idea'}
            draft={offer}
            savedUpdatedAt={stored.updatedAt}
            preview={
              <div
                className="recovery__prose idea__preview prose"
                role="region"
                aria-label="The recovered draft"
                tabIndex={0}
              >
                <p className="idea__previewtitle">{copy.title || 'Untitled'}</p>
                {copy.body === '' ? (
                  <p className="entry__blank">No body in this draft.</p>
                ) : (
                  copy.body
                )}
              </div>
            }
            onRecover={recoverDraft}
            onDiscard={discardDraft}
            testId="idea-recovery"
          />
        </div>
      ) : null}

      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="idea-conflict">
          <p className="manuscript__conflicttext">
            This idea was saved in another tab or on another device after you opened it here.
            Nothing was overwritten, and your version below is not saved.
          </p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={() => void save(conflict.updatedAt)}
              data-testid="idea-keep-mine"
            >
              Save mine over it
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={loadSavedVersion}
              data-testid="idea-load-saved"
            >
              Load the saved version
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message idea__failure" role="alert" data-testid="idea-error">
          {failure}
        </p>
      ) : null}

      <form
        className="idea__form"
        onSubmit={(event) => {
          event.preventDefault()
          void save(stored.updatedAt)
        }}
        aria-describedby={offer ? recoveryId : undefined}
      >
        <div className="field">
          <label className="field__label" htmlFor={titleId}>
            Title
          </label>
          <input
            id={titleId}
            ref={titleInput}
            className="field__input field__input--title"
            type="text"
            dir="auto"
            value={draft.title}
            maxLength={IDEA_TITLE_MAX_LENGTH}
            placeholder="Insert a title"
            readOnly={isHeld}
            onChange={(event) => edit({ title: event.target.value })}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? `${titleId}-error` : undefined}
            aria-required="true"
            data-testid="idea-title"
          />
          {fieldErrors.title ? (
            <p className="field__error" id={`${titleId}-error`} data-testid="idea-title-error">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={bodyId}>
            Body
          </label>
          <p className="field__hint" id={`${bodyId}-hint`}>
            Optional. Plain text, kept exactly as you write it.
          </p>
          <textarea
            id={bodyId}
            className="field__input field__input--area idea__body"
            rows={10}
            value={draft.body}
            placeholder="Insert the idea"
            readOnly={isHeld}
            spellCheck
            onChange={(event) => edit({ body: event.target.value })}
            aria-invalid={isTooLong || fieldErrors.body ? true : undefined}
            aria-describedby={[`${bodyId}-hint`, nearLimit ? bodyCountId : null]
              .filter(Boolean)
              .join(' ')}
            data-testid="idea-body"
          />
          {nearLimit ? (
            <p
              className={isTooLong ? 'field__error' : 'field__hint idea__count'}
              id={bodyCountId}
              data-testid="idea-body-count"
            >
              {isTooLong ? 'Too long to save: ' : null}
              {count.format(draft.body.length)} of {count.format(IDEA_BODY_MAX_LENGTH)} characters.
            </p>
          ) : null}
          {fieldErrors.body ? <p className="field__error">{fieldErrors.body}</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={universeFieldId}>
            Universe
          </label>
          <p className="field__hint" id={`${universeFieldId}-hint`}>
            Optional. An idea can belong to one of your universes, or to none.
          </p>
          <select
            id={universeFieldId}
            className="field__input field__input--select idea__universe"
            value={draft.universeId ?? ''}
            disabled={isHeld}
            onChange={(event) =>
              changeUniverse(event.target.value === '' ? null : event.target.value)
            }
            aria-invalid={fieldErrors.universeid ? true : undefined}
            aria-describedby={`${universeFieldId}-hint`}
            data-testid="idea-universe"
          >
            <option value="">No universe</option>
            {chosenUniverse && !universes?.some((universe) => universe.id === chosenUniverse.id) ? (
              <option value={chosenUniverse.id}>{chosenUniverse.name}</option>
            ) : null}
            {(universes ?? []).map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.isArchived ? `${universe.name} (archived)` : universe.name}
              </option>
            ))}
          </select>
          {fieldErrors.universeid ? <p className="field__error">{fieldErrors.universeid}</p> : null}
        </div>

        <section
          className="idea__references"
          aria-labelledby={referencesId}
          data-testid="idea-references"
        >
          <h2 className="idea__subheading" id={referencesId}>
            References
          </h2>
          <p className="field__hint">
            Optional. Point at lore or story content this idea is about. A reference changes nothing
            in what it points at.
          </p>

          {draft.universeId === null ? (
            <p className="idea__noreferences" data-testid="idea-references-need-universe">
              Choose a universe to reference its lore and stories.
            </p>
          ) : draft.references.length === 0 ? (
            <p className="idea__noreferences">No references.</p>
          ) : (
            <ul className="idearefs" data-testid="idea-reference-list">
              {draft.references.map((reference) => {
                const kind = IDEA_REFERENCE_KIND_LABELS[reference.kind]
                const context = referenceContext(reference)
                return (
                  <li
                    className="idearef"
                    key={referenceKey(reference)}
                    data-testid="idea-reference"
                    data-kind={kind}
                    data-name={reference.name}
                    data-trashed={reference.isInTrash ? 'true' : 'false'}
                  >
                    <span className="idearef__kind">{kind}</span>
                    <span className="idearef__what">
                      {reference.isInTrash || draft.universeId === null ? (
                        <span className="idearef__name">
                          <bdi>{reference.name}</bdi>
                        </span>
                      ) : (
                        <Link
                          className="idearef__name"
                          to={referencePath(draft.universeId, reference)}
                          data-testid="idea-reference-open"
                        >
                          <bdi>{reference.name}</bdi>
                        </Link>
                      )}
                      {context ? <span className="idearef__context">{context}</span> : null}
                      {reference.isInTrash ? (
                        <span className="idearef__trashed" data-testid="idea-reference-trashed">
                          In the Trash - restore it to open it
                        </span>
                      ) : null}
                    </span>
                    <button
                      className="button button--secondary button--sm idearef__remove"
                      type="button"
                      disabled={isHeld}
                      onClick={() => removeReference(reference)}
                      aria-label={`Remove the reference to ${kind.toLowerCase()} “${reference.name}”`}
                      data-testid="idea-reference-remove"
                    >
                      <ActionIcon icon={X} />
                      <span className="idearef__removelabel">Remove</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            ref={addButton}
            className="button button--secondary"
            type="button"
            disabled={draft.universeId === null || isHeld}
            onClick={() => setIsPicking(true)}
            data-testid="idea-add-reference"
          >
            <ActionIcon icon={Plus} />
            Add reference
          </button>
          {fieldErrors.references ? (
            <p className="field__error" data-testid="idea-references-error">
              {fieldErrors.references}
            </p>
          ) : null}
        </section>

        <div className="manuscript__bar idea__bar">
          {failed && isDirty ? (
            <p className="recovery__warning" role="status" data-testid="idea-recovery-warning">
              This device could not keep a recovery copy of these changes. Save to keep them.
            </p>
          ) : null}
          <div className="idea__actions">
            <SaveAction
              label={isNew ? 'Create idea' : 'Save changes'}
              isDirty={isDirty}
              isSaving={isSaving}
              isBlocked={isTooLong || isHeld}
              saves={saves}
              restingStatus={stored.updatedAt === null ? 'Not saved yet' : 'Saved'}
              statusId={statusId}
              statusTestId="idea-status"
              testId="idea-save"
              keyShortcuts="Control+S Meta+S"
            />
          </div>
        </div>
      </form>

      {isPicking && draft.universeId !== null ? (
        <IdeaReferencePicker
          universeId={draft.universeId}
          universeName={chosenUniverse?.name ?? null}
          chosen={draft.references}
          onChoose={addReference}
          onClose={() => setIsPicking(false)}
        />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="idea-announcer">
        {announcement}
      </p>
    </article>
  )
}
