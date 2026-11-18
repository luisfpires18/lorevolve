import { useRef, useState, type ReactNode } from 'react'
import type { IdeaBoardPage } from './boards'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: IdeaBoardPage } | { kind: 'error'; message: string }

/** Every state and ref of the boards list: what is typed, read and restored, and what was said. */
export function useBoardsState(search: string) {
  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ text: ReactNode; to: string | null } | null>(null)
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
