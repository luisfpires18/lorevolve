import { useId, useState, type ReactNode } from 'react'
import { formatDateTime } from '../lib/dates'
import type { LocalDraft } from '../lib/localDrafts'
import { sameSave } from '../lib/useLocalDraft'
import { confirmAction } from '../lib/confirm'

interface RecoveredDraftProps {
  /** What the copy is of, as it reads in a sentence: "this article", "this scene's manuscript". */
  what: string
  draft: LocalDraft

  /** The `updatedAt` of what is saved now, to say plainly whether it has been saved since the copy was made. */
  savedUpdatedAt: string | null

  /** The copy, drawn read-only, for the author to look at before choosing. */
  preview: ReactNode

  onRecover: () => void
  onDiscard: () => void
  testId: string
}

/**
 * The offer of a recovery copy: writing this device kept that was never saved.
 *
 * It never decides for the author. The saved text stays in place until they choose, the copy can be read first, and
 * recovering only puts it in the editor as unsaved changes - saving is still theirs to do. When the saved text has been
 * saved again since the copy was made, it says so, because a copy made later on this device is not therefore newer than
 * what was saved from another one.
 */
export function RecoveredDraft({
  what,
  draft,
  savedUpdatedAt,
  preview,
  onRecover,
  onDiscard,
  testId,
}: RecoveredDraftProps) {
  const titleId = useId()
  const bodyId = useId()
  const previewId = useId()
  const [isShowing, setIsShowing] = useState(false)

  const savedSince = !sameSave(draft.baseUpdatedAt, savedUpdatedAt)

  async function discard() {
    if (
      await confirmAction({
        title: `Discard the recovered draft of ${what}?`,
        message: 'The changes in it were never saved, and cannot be brought back.',
        confirmLabel: 'Discard draft',
        variant: 'destructive',
      })
    ) {
      onDiscard()
    }
  }

  return (
    <section
      className="recovery"
      aria-labelledby={titleId}
      data-testid={testId}
      data-saved-since={savedSince ? 'true' : 'false'}
    >
      <p className="recovery__title" id={titleId}>
        Recovered draft
      </p>
      <div id={bodyId}>
        <p className="recovery__text">
          This device kept a copy of changes to {what} that were never saved, from{' '}
          <time dateTime={draft.savedAt}>{formatDateTime(draft.savedAt)}</time>.
        </p>
        {savedSince ? (
          <p className="recovery__text recovery__since" data-testid={`${testId}-saved-since`}>
            {savedUpdatedAt ? (
              <>
                It has been saved again since that copy was made, most recently{' '}
                <time dateTime={savedUpdatedAt}>{formatDateTime(savedUpdatedAt)}</time>, so the copy
                may be older than the saved text.
              </>
            ) : (
              <>
                The saved text has changed since that copy was made, so the copy may be out of date.
              </>
            )}
          </p>
        ) : null}
        <p className="recovery__hint">
          Recovering puts the copy in the editor as unsaved changes. Nothing is saved until you
          save.
        </p>
      </div>

      <div className="recovery__actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={onRecover}
          aria-describedby={bodyId}
          data-testid={`${testId}-recover`}
        >
          Recover draft
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={discard}
          aria-describedby={bodyId}
          data-testid={`${testId}-discard`}
        >
          Discard draft
        </button>
        <button
          className="button button--secondary"
          type="button"
          aria-expanded={isShowing}
          aria-controls={previewId}
          onClick={() => setIsShowing((showing) => !showing)}
          data-testid={`${testId}-preview-toggle`}
        >
          {isShowing ? 'Hide the draft' : 'Show the draft'}
        </button>
      </div>

      {isShowing ? (
        <div className="recovery__preview" id={previewId} data-testid={`${testId}-preview`}>
          {preview}
        </div>
      ) : null}
    </section>
  )
}
