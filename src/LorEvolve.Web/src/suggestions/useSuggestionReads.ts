import { useEffect } from 'react'
import { listSuggestions } from './api'
import { merged, STATES } from './suggestionList'
import type { useReviewSuggestionsState } from './useReviewSuggestionsState'

/** Reads both lists once wanted, and again on a newer read; then moves the focus to each feedback line. */
export function useSuggestionReads<T>({
  path,
  wanted,
  reads,
  setLoaded,
  setFailed,
  feedback,
  feedbackLine,
}: Pick<
  ReturnType<typeof useReviewSuggestionsState<T>>,
  'wanted' | 'reads' | 'setLoaded' | 'setFailed' | 'feedback' | 'feedbackLine'
> & { path: string }) {
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

  // A decision moves its suggestion out of Open, taking the pressed button with it: the focus goes to what happened.
  useEffect(() => {
    if (feedback) feedbackLine.current?.focus()
  }, [feedback])
}
