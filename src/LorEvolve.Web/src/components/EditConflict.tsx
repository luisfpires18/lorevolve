import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../lib/api'
import type { Change } from '../lib/editConflict'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
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
        title: t('entity.conflict.replaceConfirm.title'),
        message: t('entity.conflict.replaceConfirm.message'),
        confirmLabel: t('entity.conflict.replaceConfirm.confirm'),
        cancelLabel: t('entity.conflict.replaceConfirm.cancel'),
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
            <p className="editconflict__title">{t('entity.conflict.suggestion.title', { what })}</p>
            <p className="editconflict__text">{t('entity.conflict.suggestion.text')}</p>
          </>
        ) : (
          <>
            <p className="editconflict__title">{t('entity.conflict.edit.title', { what })}</p>
            <p className="editconflict__text">{t('entity.conflict.edit.text')}</p>
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
            {t('entity.conflict.review')}
          </button>
        </div>
      ) : null}

      {state.kind === 'failed' ? (
        <p className="editconflict__text" role="status">
          {t('entity.conflict.failed')}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="editconflict__text" role="status">
          {t('entity.conflict.loading')}
        </p>
      ) : null}

      {state.kind === 'missing' ? (
        <p className="editconflict__text" role="alert" data-testid={`${testId}-missing`}>
          {t('entity.conflict.missing', { what })}
        </p>
      ) : null}

      {state.kind === 'reviewing' ? (
        <section
          className="editconflict__review"
          aria-labelledby={reviewId}
          data-testid={`${testId}-latest`}
        >
          <h3 className="editconflict__heading" id={reviewId} ref={heading} tabIndex={-1}>
            {t('entity.conflict.latestHeading')}
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
              {t('entity.conflict.keepMine')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => chooseLatest(state.latest)}
              data-testid={`${testId}-use-latest`}
            >
              {t('entity.conflict.useLatest')}
            </button>
          </div>
          <p className="editconflict__hint" id={hintId}>
            {suggesting ? t('entity.conflict.hint.suggestion') : t('entity.conflict.hint.edit')}
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
  sides: customSides,
  empty: customEmpty,
  testId = 'conflict',
}: {
  changes: Change[]
  sides?: { latest: string; mine: string }
  empty?: string
  testId?: string
}) {
  const { t } = useI18n()
  const sides = customSides ?? {
    latest: t('entity.conflict.sides.latest'),
    mine: t('entity.conflict.sides.mine'),
  }
  const empty = customEmpty ?? t('entity.conflict.matches')

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
  const { t } = useI18n()
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
      <p className="editconflict__hint">{t('entity.conflict.latestTextHint')}</p>
    </>
  )
}
