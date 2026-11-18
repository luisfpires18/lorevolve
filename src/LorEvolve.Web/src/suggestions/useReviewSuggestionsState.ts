import { useId, useRef, useState } from 'react'
import type { SuggestionState } from './api'
import type { Feedback, Loaded } from './suggestionList'

/** The suggestions tab's id, states and feedback line, wanted once the tab is first shown. */
export function useReviewSuggestionsState<T>({ active }: { active: boolean }) {
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
  return {
    headingId,
    wanted,
    setWanted,
    reads,
    setReads,
    loaded,
    setLoaded,
    failed,
    setFailed,
    reading,
    setReading,
    busy,
    setBusy,
    feedback,
    setFeedback,
    feedbackLine,
  }
}
