import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../lib/api'
import type { Change } from '../lib/editConflict'
import { confirmAction } from '../lib/confirm'

type ReviewState<T> =
  | { kind: 'notice' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'missing' }
  | { kind: 'reviewing'; latest: T }

interface EditConflictProps<T> {
  /** What changed, in a creator's words: "entry", "article", "story", "scene", "manuscript". */
  what: string
  /** Reads the latest saved version through the ordinary read, under the ordinary access check. */
  read: () => Promise<T>
  /** The latest version, drawn the simplest useful way for its kind: changed fields, or the whole text. */
  renderLatest: (latest: T) => ReactNode
  /** The author keeps their unsaved work and takes the version they reviewed as the one the next save is written over. */
  onKeepMine: (latest: T) => void
  /** The author lets their unsaved work go for the version they reviewed. Asked first. */
  onUseLatest: (latest: T) => void
  testId: string
  /** The unsaved work is a suggestion being written (task 045): it is sent, not saved. */
  suggesting?: boolean
}

/**
 * The one presentation of a save refused because the content was saved somewhere else while it was being edited (ADR 0043).
 *
 * The unsaved work is never touched here: it stays in the form or editor it was written in. The author reviews the latest
 * saved version first - read only when asked for - and only then chooses to keep their own work, which makes the next save
 * one written over what they have now seen, or to take the latest. There is no save from here: keeping is not saving, and
 * the next save is the author's own, refused again if anything changed in the meantime.
 */
export function EditConflict<T>({
  what,
  read,
  renderLatest,
  onKeepMine,
  onUseLatest,
  testId,
  suggesting = false,
}: EditConflictProps<T>) {
  const reviewId = useId()
  const hintId = useId()
  const [state, setState] = useState<ReviewState<T>>({ kind: 'notice' })
  const heading = useRef<HTMLHeadingElement>(null)

  // Arriving at the latest version puts a keyboard and a screen reader on its heading.
  useEffect(() => {
    if (state.kind === 'reviewing') heading.current?.focus()
  }, [state.kind])

  async function review() {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'reviewing', latest: await read() })
    } catch (error: unknown) {
      setState(
        error instanceof ApiError && error.status === 404
          ? { kind: 'missing' }
          : { kind: 'failed' },
      )
    }
  }

  async function chooseLatest(latest: T) {
    if (
      !(await confirmAction({
        title: 'Replace your unsaved changes with the latest version?',
        message: 'Your changes will be lost.',
        confirmLabel: 'Use the latest version',
        cancelLabel: 'Keep my changes',
        variant: 'destructive',
      }))
    ) {
      return
    }
    onUseLatest(latest)
  }

  return (
    <div className="editconflict" data-testid={testId} data-state={state.kind}>
      <div role="alert">
        {suggesting ? (
          <>
            <p className="editconflict__title">
              This {what} changed while you were writing your suggestion.
            </p>
            <p className="editconflict__text">
              Your suggestion is still here and hasn&rsquo;t been sent. Look at the latest version
              first, then decide what to keep.
            </p>
          </>
        ) : (
          <>
            <p className="editconflict__title">This {what} changed while you were editing.</p>
            <p className="editconflict__text">
              Your changes are still here and haven&rsquo;t been saved. Lorex won&rsquo;t save over
              the newer version. Look at it first, then decide what to keep.
            </p>
          </>
        )}
      </div>

      {state.kind === 'notice' || state.kind === 'failed' ? (
        <div className="editconflict__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void review()}
            data-testid={`${testId}-review`}
          >
            Review the latest version
          </button>
        </div>
      ) : null}

      {state.kind === 'failed' ? (
        <p className="editconflict__text" role="status">
          Lorex couldn&rsquo;t open the latest version. Try again.
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="editconflict__text" role="status">
          Opening the latest version&hellip;
        </p>
      ) : null}

      {state.kind === 'missing' ? (
        <p className="editconflict__text" role="alert" data-testid={`${testId}-missing`}>
          This {what} isn&rsquo;t here anymore. Someone may have moved it to the Trash. Your changes
          are still on screen, so copy them before you leave.
        </p>
      ) : null}

      {state.kind === 'reviewing' ? (
        <section
          className="editconflict__review"
          aria-labelledby={reviewId}
          data-testid={`${testId}-latest`}
        >
          <h3 className="editconflict__heading" id={reviewId} ref={heading} tabIndex={-1}>
            Latest saved version
          </h3>
          {renderLatest(state.latest)}
          <div className="editconflict__actions">
            <button
              className="button"
              type="button"
              onClick={() => onKeepMine(state.latest)}
              aria-describedby={hintId}
              data-testid={`${testId}-keep`}
            >
              Keep my changes
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => chooseLatest(state.latest)}
              data-testid={`${testId}-use-latest`}
            >
              Use the latest version
            </button>
          </div>
          <p className="editconflict__hint" id={hintId}>
            {suggesting
              ? 'Your suggestion stays here, unsent. Send it again when you’re ready.'
              : 'Your changes stay where they are, unsaved. Save again when you’re ready.'}
          </p>
        </section>
      ) : null}
    </div>
  )
}

/**
 * A structured form's changes: each changed field once, one value above the other. Stacked rather than side by side, so a
 * phone reads it as easily as a desk. Authored words keep their own direction. A conflict reads "Saved now" above "Yours";
 * a suggestion (task 045) reads "Before" above "Suggested".
 */
export function ChangeList({
  changes,
  sides = { latest: 'Saved now', mine: 'Yours' },
  empty = 'The latest version matches your changes.',
  testId = 'conflict',
}: {
  changes: Change[]
  sides?: { latest: string; mine: string }
  empty?: string
  testId?: string
}) {
  if (changes.length === 0) {
    return <p className="editconflict__text">{empty}</p>
  }

  return (
    <dl className="changelist">
      {changes.map((change) => (
        <div className="changelist__row" key={change.label} data-testid={`${testId}-change`}>
          <dt className="changelist__label">{change.label}</dt>
          <dd className="changelist__value" data-side="latest">
            <span className="changelist__side">{sides.latest}</span>
            <span dir="auto" data-testid={`${testId}-latest-value`}>
              {change.latest || '—'}
            </span>
          </dd>
          <dd className="changelist__value" data-side="mine">
            <span className="changelist__side">{sides.mine}</span>
            <span dir="auto" data-testid={`${testId}-mine-value`}>
              {change.mine || '—'}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A long text's latest saved version, whole, scrolling inside its own region. */
export function LatestText({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <div
        className="editconflict__latesttext"
        role="region"
        aria-label={label}
        tabIndex={0}
        data-testid="conflict-latest-text"
      >
        {children}
      </div>
      <p className="editconflict__hint">Your version is still in the editor.</p>
    </>
  )
}
