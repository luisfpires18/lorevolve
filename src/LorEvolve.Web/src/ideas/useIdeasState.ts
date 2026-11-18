import { useRef, useState, type ReactNode } from 'react'
import type { IdeaPage } from './types'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: IdeaPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to the idea it brought back. */
interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

/** Every state and ref of an ideas list: what is typed, read and restored, and what was said. */
export function useIdeasState(search: string) {
  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)
  return {
    typed,
    setTyped,
    state,
    setState,
    reads,
    setReads,
    universes,
    setUniverses,
    restoring,
    setRestoring,
    outcome,
    setOutcome,
    outcomeRef,
  }
}
