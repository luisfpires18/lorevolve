import { useEffect, useId, useRef, useState } from 'react'
import { FilePenLine } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ChangeList } from './EditConflict'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import type { Change } from '../lib/editConflict'
import {
  listSuggestions,
  resolveSuggestion,
  SUGGESTION_RESOLVED,
  SUGGESTION_TARGET_CHANGED,
  SuggestionStatus,
  type Suggestion,
} from '../suggestions/api'
import { useUniverseAccess } from '../universes/access'

interface ReviewSuggestionsProps<T> {
  universeId: string
  /** Where the subject's suggestions are read (`suggestionsPath`). */
  path: string
  /** What they are about, in a creator's words: "entry", "story", "scene". */
  what: string
  /** Whether the Suggestions tab is showing. Nothing is read until it first is. */
  active: boolean
  /** A suggestion's two sides as the subject's form shows its fields. */
  describe: (before: T, proposed: T) => Change[]
  /** An accepted suggestion changed the content: the page reads it again. */
  onAccepted: () => void
  /** Opens the content's own form to write a new suggestion. */
  onSuggest: () => void
}

type Feedback = { text: string; isError: boolean }

/**
 * The suggested changes to one entry, story or scene (task 045), inside the review drawer. Read only once the tab is
 * first shown, so opening the drawer for comments asks for no suggestions. Open ones first; accepted and rejected ones
 * stay readable, folded. Each shows its changed fields, "Before" above "Suggested". The owner and Editors accept or
 * reject; the API decides every request, and refuses an accept once the content was saved after the suggestion.
 */
export function ReviewSuggestions<T>({
  universeId,
  path,
  what,
  active,
  describe,
  onAccepted,
  onSuggest,
}: ReviewSuggestionsProps<T>) {
  const access = useUniverseAccess()
  const headingId = useId()
  const [wanted, setWanted] = useState(active)
  const [reads, setReads] = useState(0)
  const [suggestions, setSuggestions] = useState<Suggestion<T>[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackLine = useRef<HTMLParagraphElement>(null)

  if (active && !wanted) setWanted(true)

  useEffect(() => {
    if (!wanted) return
    const controller = new AbortController()

    listSuggestions<T>(path, controller.signal)
      .then((read) => {
        setSuggestions(read)
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => controller.abort()
  }, [path, wanted, reads])

  // A decision moves its suggestion out of Open, taking the pressed button with it: the focus goes to what happened.
  useEffect(() => {
    if (feedback) feedbackLine.current?.focus()
  }, [feedback])

  async function decide(suggestion: Suggestion<T>, decision: 'accept' | 'reject') {
    setFeedback(null)
    setBusy(suggestion.id)
    try {
      const decided = await resolveSuggestion<T>(universeId, suggestion.id, decision)
      setSuggestions((current) =>
        current === null
          ? current
          : current.map((each) => (each.id === decided.id ? decided : each)),
      )
      setFeedback({
        text: decision === 'accept' ? 'Suggestion accepted.' : 'Suggestion rejected.',
        isError: false,
      })
      if (decision === 'accept') onAccepted()
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        (error.code === SUGGESTION_TARGET_CHANGED || error.code === SUGGESTION_RESOLVED)
      ) {
        // Someone saved the content or decided first: read again, so the list says which.
        setFeedback({ text: error.message, isError: true })
        setReads((count) => count + 1)
      } else if (
        decision === 'accept' &&
        error instanceof ApiError &&
        (error.status === 400 || error.status === 409)
      ) {
        setFeedback({ text: `This suggestion can’t be accepted. ${error.message}`, isError: true })
      } else {
        setFeedback({
          text:
            decision === 'accept'
              ? 'Lorex couldn’t accept that suggestion. Try again.'
              : 'Lorex couldn’t reject that suggestion. Try again.',
          isError: true,
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const open = suggestions?.filter((each) => each.status === SuggestionStatus.Open) ?? []
  const decided = suggestions?.filter((each) => each.status !== SuggestionStatus.Open) ?? []

  function renderSuggestion(suggestion: Suggestion<T>) {
    const isOpen = suggestion.status === SuggestionStatus.Open
    const state =
      suggestion.status === SuggestionStatus.Accepted
        ? 'accepted'
        : suggestion.status === SuggestionStatus.Rejected
          ? 'rejected'
          : 'open'

    return (
      <li
        className="reviewthread suggestion"
        key={suggestion.id}
        data-testid="suggestion"
        data-status={state}
        data-resolved={isOpen ? 'false' : 'true'}
      >
        <p className="reviewcomment__meta">
          <span className="reviewcomment__author" data-testid="suggestion-author">
            {suggestion.proposedByName === null ? (
              'Unknown author'
            ) : (
              <bdi>{suggestion.proposedByName}</bdi>
            )}
          </span>
          <time dateTime={suggestion.createdAt}>{formatDateTime(suggestion.createdAt)}</time>
        </p>

        {isOpen && suggestion.targetChanged ? (
          <p className="callout callout--warning suggestion__note" data-testid="suggestion-changed">
            The {what} has changed since this suggestion was made.{' '}
            {access.resolveSuggestions
              ? 'It can’t be accepted now. Reject it, or make the change yourself.'
              : 'It can’t be accepted now. Suggest it again if it still applies.'}
          </p>
        ) : null}

        <ChangeList
          changes={describe(suggestion.before, suggestion.proposed)}
          sides={{ latest: 'Before', mine: 'Suggested' }}
          empty="Lorex can’t show these changes anymore."
          testId="suggestion"
        />

        {isOpen ? null : (
          <p className="reviewthread__resolved" data-testid="suggestion-resolution">
            {state === 'accepted' ? 'Accepted by ' : 'Rejected by '}
            {suggestion.resolvedByName === null ? (
              'Unknown author'
            ) : (
              <bdi>{suggestion.resolvedByName}</bdi>
            )}
            {suggestion.resolvedAt ? <> · {formatDateTime(suggestion.resolvedAt)}</> : null}
          </p>
        )}

        {isOpen && access.resolveSuggestions ? (
          <div className="reviewthread__tools">
            {suggestion.targetChanged ? null : (
              <button
                className="button button--sm"
                type="button"
                disabled={busy !== null}
                onClick={() => void decide(suggestion, 'accept')}
                data-testid="suggestion-accept"
              >
                {busy === suggestion.id ? 'Accepting' : 'Accept'}
              </button>
            )}
            <button
              className="button button--secondary button--sm"
              type="button"
              disabled={busy !== null}
              onClick={() => void decide(suggestion, 'reject')}
              data-testid="suggestion-reject"
            >
              Reject
            </button>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <>
      {feedback ? (
        <p
          className={feedback.isError ? 'form__message' : 'callout'}
          role={feedback.isError ? 'alert' : 'status'}
          tabIndex={-1}
          ref={feedbackLine}
          data-testid="suggestions-feedback"
        >
          {feedback.text}
        </p>
      ) : null}

      {access.suggestChanges ? (
        <div>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={onSuggest}
            data-testid="suggestions-new"
          >
            <ActionIcon icon={FilePenLine} />
            Suggest changes
          </button>
        </div>
      ) : (
        <p className="history__quiet" data-testid="suggestions-read-only">
          You can read suggestions here, but your role can&rsquo;t make them.
        </p>
      )}

      {failed ? (
        <p className="history__quiet" role="status">
          The suggestions couldn&rsquo;t be read.
        </p>
      ) : suggestions === null ? (
        <p className="history__quiet" role="status">
          Opening&hellip;
        </p>
      ) : suggestions.length === 0 ? (
        <p className="history__quiet" data-testid="suggestions-empty">
          No suggestions yet.
        </p>
      ) : (
        <>
          {open.length > 0 ? (
            <section className="reviewsection" aria-labelledby={`${headingId}-open`}>
              <h3 className="reviewsection__title" id={`${headingId}-open`}>
                Open <span className="reviewsection__count">{open.length}</span>
              </h3>
              <ol className="reviewsection__list" data-testid="suggestions-open">
                {open.map(renderSuggestion)}
              </ol>
            </section>
          ) : null}
          {decided.length > 0 ? (
            <details className="reviewsection" data-testid="suggestions-decided-group">
              <summary className="reviewsection__title">
                Accepted and rejected <span className="reviewsection__count">{decided.length}</span>
              </summary>
              <ol className="reviewsection__list" data-testid="suggestions-decided">
                {decided.map(renderSuggestion)}
              </ol>
            </details>
          ) : null}
        </>
      )}
    </>
  )
}
