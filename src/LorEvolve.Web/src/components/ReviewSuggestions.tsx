import { FilePenLine } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Change } from '../lib/editConflict'
import { SuggestionStatus, type SuggestionState } from '../suggestions/api'
import { useUniverseAccess } from '../universes/access'
import { newestFirst, type CHANGED_SINCE } from '../suggestions/suggestionList'
import { useReviewSuggestionsState } from '../suggestions/useReviewSuggestionsState'
import { useSuggestionReads } from '../suggestions/useSuggestionReads'
import { reviewSuggestionsActions } from '../suggestions/reviewSuggestionsActions'
import { SuggestionItem } from './suggestions/SuggestionItem'
import { Button } from './Button'
import { ShowMore } from './ShowMore'
import { QuietNote } from './QuietNote'
import { HeadingCount } from './HeadingCount'

interface ReviewSuggestionsProps<T> {
  universeId: string
  /** Where the subject's suggestions are read (`suggestionsPath`). */
  path: string
  /** What they are about, in a creator's words: "entry", "story", "scene". */
  what: keyof typeof CHANGED_SINCE
  /** Whether the Suggestions tab is showing. Nothing is read until it first is. */
  active: boolean
  /** A suggestion's two sides as the subject's form shows its fields. */
  describe: (before: T, proposed: T) => Change[]
  /** An accepted suggestion changed the content: the page reads it again. */
  onAccepted: () => void
  /** Opens the content's own form to write a new suggestion. */
  onSuggest: () => void
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
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const state = useReviewSuggestionsState<T>({ active })
  const { headingId, loaded, failed, reading, busy, feedback, feedbackLine } = state
  useSuggestionReads<T>({ ...state, path })
  const { readMore, decide } = reviewSuggestionsActions<T>({
    ...state,
    universeId,
    path,
    t,
    onAccepted,
  })

  const items = [...(loaded?.items ?? [])].sort(newestFirst)
  const open = items.filter((each) => each.status === SuggestionStatus.Open)
  const decided = items.filter((each) => each.status !== SuggestionStatus.Open)

  function moreButton(state: SuggestionState) {
    return (
      <ShowMore
        align="start"
        hasMore={Boolean(loaded?.more[state])}
        status={reading === state ? 'loading' : 'idle'}
        disabled={reading !== null}
        onMore={() => void readMore(state)}
        testId={`suggestions-more-${state}`}
      />
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
          <Button
            tone="secondary"
            size="sm"
            icon={FilePenLine}
            onClick={onSuggest}
            data-testid="suggestions-new"
          >
            {t('review.suggestions.suggest')}
          </Button>
        </div>
      ) : (
        <QuietNote className="history__quiet" size="ui" testId="suggestions-read-only">
          {t('review.suggestions.readOnly')}
        </QuietNote>
      )}

      {failed ? (
        <QuietNote className="history__quiet" size="ui" role="status">
          {t('review.suggestions.readFailed')}
        </QuietNote>
      ) : loaded === null ? (
        <QuietNote className="history__quiet" size="ui" role="status">
          {t('review.suggestions.opening')}
        </QuietNote>
      ) : items.length === 0 && !loaded.more.open && !loaded.more.decided ? (
        <QuietNote className="history__quiet" size="ui" testId="suggestions-empty">
          {t('review.suggestions.empty')}
        </QuietNote>
      ) : (
        <>
          {open.length > 0 || loaded.more.open ? (
            <section className="reviewsection" aria-labelledby={`${headingId}-open`}>
              <h3 className="reviewsection__title" id={`${headingId}-open`}>
                {tx('review.suggestions.open', {
                  n: <HeadingCount n={open.length} more={Boolean(loaded?.more.open)} />,
                })}
              </h3>
              <ol className="reviewsection__list" data-testid="suggestions-open">
                {open.map((suggestion) => (
                  <SuggestionItem
                    key={suggestion.id}
                    suggestion={suggestion}
                    what={what}
                    describe={describe}
                    access={access}
                    busy={busy}
                    decide={decide}
                  />
                ))}
              </ol>
              {moreButton('open')}
            </section>
          ) : null}
          {decided.length > 0 || loaded.more.decided ? (
            <details className="reviewsection" data-testid="suggestions-decided-group">
              <summary className="reviewsection__title">
                {tx('review.suggestions.decided', {
                  n: <HeadingCount n={decided.length} more={Boolean(loaded?.more.decided)} />,
                })}
              </summary>
              <ol className="reviewsection__list" data-testid="suggestions-decided">
                {decided.map((suggestion) => (
                  <SuggestionItem
                    key={suggestion.id}
                    suggestion={suggestion}
                    what={what}
                    describe={describe}
                    access={access}
                    busy={busy}
                    decide={decide}
                  />
                ))}
              </ol>
              {moreButton('decided')}
            </details>
          ) : null}
        </>
      )}
    </>
  )
}
