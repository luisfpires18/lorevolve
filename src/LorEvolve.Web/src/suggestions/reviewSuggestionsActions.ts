import { ApiError } from '../lib/api'
import {
  listSuggestions,
  resolveSuggestion,
  SUGGESTION_RESOLVED,
  SUGGESTION_TARGET_CHANGED,
  type Suggestion,
  type SuggestionState,
} from './api'
import type { useI18n } from '../i18n'
import { merged } from './suggestionList'
import type { useReviewSuggestionsState } from './useReviewSuggestionsState'

/** The suggestions tab's handlers: reading the next page of a list, and accepting or rejecting one. */
export function reviewSuggestionsActions<T>({
  universeId,
  path,
  t,
  onAccepted,
  loaded,
  setLoaded,
  setReads,
  setReading,
  setBusy,
  setFeedback,
}: ReturnType<typeof useReviewSuggestionsState<T>> & {
  universeId: string
  path: string
  t: ReturnType<typeof useI18n>['t']
  onAccepted: () => void
}) {
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
      setFeedback({ text: t('review.suggestions.readFailedFeedback'), isError: true })
    } finally {
      setReading(null)
    }
  }

  async function decide(suggestion: Suggestion<T>, decision: 'accept' | 'reject') {
    setFeedback(null)
    setBusy(suggestion.id)
    try {
      const decided = await resolveSuggestion<T>(universeId, suggestion.id, decision)
      setLoaded((current) =>
        current === null ? current : { ...current, items: merged(current.items, [decided]) },
      )
      setFeedback({
        text:
          decision === 'accept'
            ? t('review.suggestions.accepted')
            : t('review.suggestions.rejected'),
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
        setFeedback({
          text: t('review.suggestions.cantAccept', { reason: error.message }),
          isError: true,
        })
      } else {
        setFeedback({
          text:
            decision === 'accept'
              ? t('review.suggestions.acceptFailed')
              : t('review.suggestions.rejectFailed'),
          isError: true,
        })
      }
    } finally {
      setBusy(null)
    }
  }
  return { readMore, decide }
}
