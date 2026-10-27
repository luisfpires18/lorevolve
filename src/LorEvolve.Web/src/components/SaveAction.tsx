import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { ActionIcon } from './ActionIcon'

/** How long "Saved" stays on the button after a save, before it goes quiet again. */
const SAVED_FOR_MS = 2000

interface SaveActionProps {
  /** The verb at rest: "Save changes", "Create idea", "Save chronology". */
  label: string
  isDirty: boolean
  isSaving: boolean
  /** Anything else that stops a save right now - too long, held by a recovery offer. */
  isBlocked?: boolean
  /** Bumped by the editor after each save the API confirmed; the button says "Saved" for a moment. */
  saves: number
  /** What the status says when nothing is unsaved and no save just happened: "Saved", "Not saved yet". */
  restingStatus: string
  statusId: string
  statusTestId: string
  testId: string
  type?: 'submit' | 'button'
  onSave?: () => void
  /** Declared where the editor takes Ctrl+S / Cmd+S. */
  keyShortcuts?: string
}

/**
 * The end of an explicit-save document: one button whose words carry the state - the verb while there is something to
 * save, "Saving…" while it goes, "✓ Saved" for a moment after, then the quiet verb again - and one visually hidden status
 * that says the same to assistive technology. Presentation only: the editor owns the draft, the request, conflicts and
 * failures, and tells this how things stand.
 *
 * Unavailable is `aria-disabled` rather than `disabled`, so the button keeps the focus through a save instead of dropping
 * it on the page; the editor's own save already refuses when there is nothing to save.
 */
export function SaveAction({
  label,
  isDirty,
  isSaving,
  isBlocked = false,
  saves,
  restingStatus,
  statusId,
  statusTestId,
  testId,
  type = 'submit',
  onSave,
  keyShortcuts,
}: SaveActionProps) {
  // The last save whose "Saved" has run its course. Only a timer's own save is ever retired, so a second save restarts the
  // moment rather than being cut short by the first one's timer, and an unmounted editor cancels its timer.
  const [retired, setRetired] = useState(0)

  useEffect(() => {
    if (saves === 0) return
    const timer = setTimeout(() => setRetired((current) => Math.max(current, saves)), SAVED_FOR_MS)
    return () => clearTimeout(timer)
  }, [saves])

  // Unsaved changes and a save in flight always win: "Saved" never covers new writing.
  const justSaved = saves > retired && !isDirty && !isSaving
  const state = isSaving ? 'saving' : isDirty ? 'dirty' : justSaved ? 'saved' : 'clean'
  const unavailable = !isDirty || isSaving || isBlocked

  return (
    <>
      <span
        className="visually-hidden"
        id={statusId}
        role="status"
        data-state={state}
        data-testid={statusTestId}
      >
        {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : justSaved ? 'Saved' : restingStatus}
      </span>
      <button
        className="button saveaction"
        type={type}
        aria-disabled={unavailable || undefined}
        aria-describedby={statusId}
        aria-keyshortcuts={keyShortcuts}
        data-state={state}
        data-testid={testId}
        onClick={(event) => {
          if (unavailable) {
            event.preventDefault()
            return
          }
          onSave?.()
        }}
      >
        {state === 'saving' ? (
          'Saving…'
        ) : state === 'saved' ? (
          <>
            <ActionIcon icon={Check} />
            Saved
          </>
        ) : (
          label
        )}
      </button>
    </>
  )
}
