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
  type SuggestionState,
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
 * What has been read: every suggestion so far, and for each list whether older ones follow and where the next page starts
 * - the last one that list answered, whatever has been decided here since.
 */
interface Loaded<T> {
  items: Suggestion<T>[]
  more: Record<SuggestionState, boolean>
  after: Record<SuggestionState, string | null>
}

const STATES: SuggestionState[] = ['open', 'decided']

/** Newest first, then by id: the API's own order, kept when a decision moves one from a list to the other. */
function newestFirst<T>(a: Suggestion<T>, b: Suggestion<T>) {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? 1 : -1
}

/** Adds what a page answered, each suggestion once, a newer read of one replacing the older. */
function merged<T>(items: Suggestion<T>[], read: Suggestion<T>[]) {
  const fresh = new Map(read.map((each) => [each.id, each]))
  return [...items.filter((each) => !fresh.has(each.id)), ...read]
}

/**
 * The suggested changes to one entry, story or scene (task 045), inside the review drawer. Read only once the tab is
 * first shown, so opening the drawer for comments asks for no suggestions - then the first page of open ones and the first
 * page of accepted and rejected ones, each with Show more until every one has been reached. Accepted and rejected ones
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
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [failed, setFailed] = useState(false)
  const [reading, setReading] = useState<SuggestionState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackLine = useRef<HTMLParagraphElement>(null)

  if (active && !wanted) setWanted(true)

  useEffect(() => {
    if (!wanted) return
    const controller = new AbortController()

    Promise.all(STATES.map((state) => listSuggestions<T>(path, state, null, controller.signal)))
      .then(([open, decided]) => {
        setLoaded({
          items: merged(open.items, decided.items),
          more: { open: open.hasMore, decided: decided.hasMore },
          after: { open: open.items.at(-1)?.id ?? null, decided: decided.items.at(-1)?.id ?? null },
        })
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => controller.abort()
  }, [path, wanted, reads])

  /** The next page of one list, after the last one it answered. */
  async function readMore(state: SuggestionState) {
    if (!loaded) return
    setReading(state)
    try {
      const page = await listSuggestions<T>(path, state, loaded.after[state])
      setLoaded((current) =>
        current === null
          ? current
          : {
              items: merged(current.items, page.items),
              more: { ...current.more, [state]: page.hasMore },
              after: { ...current.after, [state]: page.items.at(-1)?.id ?? current.after[state] },
            },
      )
    } catch {
      setFeedback({ text: 'The suggestions couldn’t be read.', isError: true })
    } finally {
      setReading(null)
    }
  }

  // A decision moves its suggestion out of Open, taking the pressed button with it: the focus goes to what happened.
  useEffect(() => {
    if (feedback) feedbackLine.current?.focus()
  }, [feedback])

  async function decide(suggestion: Suggestion<T>, decision: 'accept' | 'reject') {
    setFeedback(null)
    setBusy(suggestion.id)
    try {
      const decided = await resolveSuggestion<T>(universeId, suggestion.id, decision)
      setLoaded((current) =>
        current === null ? current : { ...current, items: merged(current.items, [decided]) },
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

  const items = [...(loaded?.items ?? [])].sort(newestFirst)
  const open = items.filter((each) => each.status === SuggestionStatus.Open)
  const decided = items.filter((each) => each.status !== SuggestionStatus.Open)

  /** How many are listed, and a plus while older ones have not been read yet. */
  const counted = (state: SuggestionState, count: number) =>
    `${count}${loaded?.more[state] ? '+' : ''}`

  function moreButton(state: SuggestionState) {
    return loaded?.more[state] ? (
      <div>
        <button
          className="button button--text button--sm"
          type="button"
          disabled={reading !== null}
          aria-busy={reading === state}
          onClick={() => void readMore(state)}
          data-testid={`suggestions-more-${state}`}
        >
          Show more
        </button>
      </div>
    ) : null
  }

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
      ) : loaded === null ? (
        <p className="history__quiet" role="status">
          Opening&hellip;
        </p>
      ) : items.length === 0 && !loaded.more.open && !loaded.more.decided ? (
        <p className="history__quiet" data-testid="suggestions-empty">
          No suggestions yet.
        </p>
      ) : (
        <>
          {open.length > 0 || loaded.more.open ? (
            <section className="reviewsection" aria-labelledby={`${headingId}-open`}>
              <h3 className="reviewsection__title" id={`${headingId}-open`}>
                Open <span className="reviewsection__count">{counted('open', open.length)}</span>
              </h3>
              <ol className="reviewsection__list" data-testid="suggestions-open">
                {open.map(renderSuggestion)}
              </ol>
              {moreButton('open')}
            </section>
          ) : null}
          {decided.length > 0 || loaded.more.decided ? (
            <details className="reviewsection" data-testid="suggestions-decided-group">
              <summary className="reviewsection__title">
                Accepted and rejected{' '}
                <span className="reviewsection__count">{counted('decided', decided.length)}</span>
              </summary>
              <ol className="reviewsection__list" data-testid="suggestions-decided">
                {decided.map(renderSuggestion)}
              </ol>
              {moreButton('decided')}
            </details>
          ) : null}
        </>
      )}
    </>
  )
}
