import { useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { Announce } from './Announce'
import { CharCount, type CharCountProps } from './CharCount'

/** How long "Saved" stays on the button after a save, before it goes quiet again. */
const SAVED_FOR_MS = 2000

export interface SaveActionProps {
  /** The verb at rest: "Save changes", "Create idea", "Save chronology". */
  label: string
  isDirty: boolean
  isSaving: boolean
  /** Anything else that stops a save right now - too long, held by a recovery offer. */
  isBlocked?: boolean
  /** Bumped by the editor after each save the API confirmed; the button says "Saved" for a moment. */
  saves: number
  /** What the status says when nothing is unsaved and no save just happened: "Saved", "Not saved yet". */
  restingStatus: ReactNode
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
  const { t } = useI18n()
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
      <Announce inline id={statusId} state={state} testId={statusTestId}>
        {isSaving
          ? t('entity.save.status.saving')
          : isDirty
            ? t('entity.save.status.unsaved')
            : justSaved
              ? t('entity.save.status.saved')
              : restingStatus}
      </Announce>
      <Button
        className="saveaction"
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
          t('entity.save.button.saving')
        ) : state === 'saved' ? (
          <>
            <ActionIcon icon={Check} />
            {t('entity.save.button.saved')}
          </>
        ) : (
          label
        )}
      </Button>
    </>
  )
}

/**
 * The foot of an explicit-save editor: the count against the limit, the warning that no recovery copy could be kept,
 * the publication slot, and Save. `record` is the look of a saved record's editor (an idea, a board, a machine): the
 * `editorbar` class and Save in `editorbar__actions`. Catalogue: `docs/design/ui-components.md`.
 */
export function SaveBar({
  save,
  count,
  warning,
  keyShortcuts,
  record,
  children,
}: {
  save: Omit<SaveActionProps, 'keyShortcuts'>
  count?: CharCountProps
  /** Passed only while it shows: a failed recovery copy with unsaved changes. */
  warning?: { text: string; testId: string } | null
  /** Where the editor takes Ctrl+S / Cmd+S. Left out where the editor has no shortcut. */
  keyShortcuts?: boolean
  record?: boolean
  /** The publication control, between the warning and Save. */
  children?: ReactNode
}) {
  const action = (
    <SaveAction {...save} keyShortcuts={keyShortcuts ? 'Control+S Meta+S' : undefined} />
  )
  return (
    <div className={record ? 'manuscript__bar editorbar' : 'manuscript__bar'}>
      {count ? <CharCount {...count} /> : null}
      {warning ? (
        <p className="recovery__warning" role="status" data-testid={warning.testId}>
          {warning.text}
        </p>
      ) : null}
      {children ? <div className="manuscript__publication">{children}</div> : null}
      {record ? <div className="actions editorbar__actions">{action}</div> : action}
    </div>
  )
}
