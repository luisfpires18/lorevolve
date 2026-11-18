import { useId, useRef, useState } from 'react'
import type { Proposal } from './types'

export type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; proposal: Proposal }
  | { kind: 'missing' }
  | { kind: 'error' }

export type Feedback = { text: string; isError: boolean }

/** One proposal's review state: the read, what is chosen, busy or applied, the feedback, the change being edited, and the approval's id. */
export function useAiChangeState() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  // A running approval's count, read from the server while the one request that applies everything is open.
  const [applied, setApplied] = useState<{ done: number; total: number } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // One approval keeps its id until it is answered, so pressing again after a lost answer applies nothing twice.
  const approval = useRef<{ key: string; id: string } | null>(null)
  const feedbackLine = useRef<HTMLParagraphElement>(null)
  const listId = useId()

  return {
    load,
    setLoad,
    reads,
    setReads,
    selected,
    setSelected,
    busy,
    setBusy,
    applied,
    setApplied,
    feedback,
    setFeedback,
    editing,
    setEditing,
    approval,
    feedbackLine,
    listId,
  }
}
