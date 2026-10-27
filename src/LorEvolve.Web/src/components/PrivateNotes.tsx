import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { NotebookPen } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EditConflict, LatestText } from './EditConflict'
import { SaveAction } from './SaveAction'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { useDrawerGuard } from '../lib/drawerGuard'
import { isChangedElsewhere } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import {
  getPrivateNote,
  PRIVATE_NOTE_CHANGED,
  PRIVATE_NOTE_MAX_LENGTH,
  savePrivateNote,
  type PrivateNote,
} from '../lore/privateNote'

interface PrivateNotesProps {
  universeId: string
  entityId: string
  /** The entry's name, for the drawer's heading. */
  entryName: string
}

const count = new Intl.NumberFormat('en')

/**
 * The owner's private note on an entry (issue 23): a Private note tool beside Family tree, opening a drawer with one plain
 * text box and an explicit Save. Drawn for the owner alone - the API refuses everyone else - and nothing is read until the
 * drawer opens, so an entry page asks for no note by default.
 *
 * Deliberately less than the article or the manuscript (owner decision): no saved versions, and no recovery copy on this
 * device - a note is confidential, and a copy in the browser's storage would be a second place it lives. What it keeps is
 * the one protection every protected save has (ADR 0043): a save names the version it was written over, a save over a
 * newer note is refused, and the owner reviews the latest before keeping or taking it.
 */
export function PrivateNotes({ universeId, entityId, entryName }: PrivateNotesProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className="button button--text"
        type="button"
        aria-haspopup="dialog"
        title="Private note"
        onClick={() => setIsOpen(true)}
        data-testid="private-note-trigger"
      >
        <ActionIcon icon={NotebookPen} />
        <span className="entry__toollabel">Private note</span>
      </button>

      {isOpen ? (
        <PrivateNoteDrawer
          key={entityId}
          universeId={universeId}
          entityId={entityId}
          entryName={entryName}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  )
}

interface DrawerProps extends PrivateNotesProps {
  onClose: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

function PrivateNoteDrawer({ universeId, entityId, entryName, onClose }: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const headingId = useId()
  const textId = useId()
  const hintId = useId()
  const statusId = useId()
  const tooLongId = useId()

  const [load, setLoad] = useState<LoadState>('loading')
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<PrivateNote>({
    entityId,
    content: '',
    updatedAt: null,
    version: 0,
  })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const inFlight = useRef(false)

  const isReady = load === 'ready'
  const isDirty = isReady && draft !== stored.content
  const isTooLong = draft.length > PRIVATE_NOTE_MAX_LENGTH

  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    'This note has unsaved changes. Close without saving them?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getPrivateNote(universeId, entityId, controller.signal)
      .then((note) => {
        setStored(note)
        setDraft(note.content)
        setLoad('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad('error')
      })

    return () => controller.abort()
  }, [universeId, entityId, reads])

  function reread() {
    setConflict(false)
    setFailure(null)
    setLoad('loading')
    setReads((current) => current + 1)
  }

  async function save() {
    if (inFlight.current || !isDirty || isTooLong) return

    const content = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await savePrivateNote(universeId, entityId, {
        content,
        expectedVersion: stored.version,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(saved)
      setSaves((current) => current + 1)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PRIVATE_NOTE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This entry is no longer here, so its note could not be saved. It may have been moved to the Trash in another window. Your text is still here: copy it before you close this.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.message)
      } else {
        setFailure('The note could not be saved. Your text is still here. Try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  /** Ctrl+S / Cmd+S saves from anywhere in the drawer, and never opens the browser's "Save page". */
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }

  /** The owner has seen the latest note and keeps their own: still unsaved, now measured against the latest. */
  function keepMine(latest: PrivateNote) {
    setStored(latest)
    setConflict(false)
    requestAnimationFrame(() => editor.current?.focus())
  }

  const describedBy = [hintId, statusId, isTooLong ? tooLongId : null].filter(Boolean).join(' ')

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="private-note-drawer"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">Private note</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{entryName}</bdi>
          </h2>
          <p className="drawer__context" id={hintId}>
            Only you, the owner of this universe, can read this. It is never published, searched,
            shown to collaborators, or read by the Assistant or a connected app.
          </p>
        </header>

        <div className="drawer__body">
          {load === 'loading' ? (
            <p className="notice" role="status" data-testid="private-note-loading">
              Opening the note…
            </p>
          ) : null}

          {load === 'error' ? (
            <div
              className="notice notice--error"
              role="alert"
              data-testid="private-note-load-error"
            >
              <p>This note could not be opened.</p>
              <button className="button button--secondary" type="button" onClick={reread}>
                Try again
              </button>
            </div>
          ) : null}

          {isReady ? (
            <form
              className="reviewform privatenote"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
              onKeyDown={onKeyDown}
            >
              {conflict ? (
                <EditConflict
                  what="note"
                  read={() => getPrivateNote(universeId, entityId)}
                  renderLatest={(latest) => (
                    <LatestText label="Latest saved note">
                      {latest.content === '' ? (
                        <p className="entry__blank">No text in the latest version.</p>
                      ) : (
                        <div className="recovery__prose prose" dir="auto">
                          {latest.content}
                        </div>
                      )}
                    </LatestText>
                  )}
                  onKeepMine={keepMine}
                  onUseLatest={reread}
                  testId="private-note-conflict"
                />
              ) : null}

              {failure ? (
                <p className="form__message" role="alert" data-testid="private-note-error">
                  {failure}
                </p>
              ) : null}

              <label className="field__label" htmlFor={textId}>
                Note
              </label>
              <textarea
                ref={editor}
                id={textId}
                className="field__input field__input--area privatenote__text"
                rows={12}
                dir="auto"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Notes for yourself: reveals to come, what this entry is really for, loose ends."
                spellCheck
                aria-describedby={describedBy}
                aria-invalid={isTooLong ? true : undefined}
                aria-keyshortcuts="Control+S Meta+S"
                data-testid="private-note-text"
              />

              {isTooLong ? (
                <p className="field__error" id={tooLongId} data-testid="private-note-too-long">
                  Too long to save: {count.format(draft.length)} of{' '}
                  {count.format(PRIVATE_NOTE_MAX_LENGTH)} characters.
                </p>
              ) : null}

              <div className="privatenote__bar">
                <SaveAction
                  label="Save note"
                  isDirty={isDirty}
                  isSaving={isSaving}
                  isBlocked={isTooLong}
                  saves={saves}
                  restingStatus={
                    stored.updatedAt === null
                      ? 'Nothing saved yet'
                      : `Saved ${formatDateTime(stored.updatedAt)}`
                  }
                  statusId={statusId}
                  statusTestId="private-note-status"
                  testId="private-note-save"
                  keyShortcuts="Control+S Meta+S"
                />
              </div>
            </form>
          ) : null}
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void close()}
            data-testid="private-note-close"
          >
            Close
          </button>
        </footer>
      </div>
    </dialog>
  )
}
