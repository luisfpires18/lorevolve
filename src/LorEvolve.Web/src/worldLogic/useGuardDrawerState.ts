import { useId, useRef, useState } from 'react'
import type { Json, Problem } from './guard'
import { newGuard } from './guardBlocks'
import type { SystemRuleDetail } from './types'

/** The guard builder drawer's state: its dialog and ids, the rule as read, the draft, and the save's progress. */
export function useGuardDrawerState({ ruleId }: { ruleId: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const conditionId = useId()
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>(ruleId ? 'loading' : 'ready')
  const [detail, setDetail] = useState<SystemRuleDetail | null>(null)
  const [initial, setInitial] = useState<{ title: string; condition: Json }>(() => ({
    title: '',
    condition: newGuard(),
  }))
  const [title, setTitle] = useState(initial.title)
  const [condition, setCondition] = useState<Json>(initial.condition)
  // A new reading of the rule redraws the blocks, so no control keeps text from before it.
  const [reading, setReading] = useState(0)
  const [problems, setProblems] = useState<Problem[]>([])
  const [titleError, setTitleError] = useState<string | undefined>(undefined)
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const pendingFocus = useRef<string | null>(null)

  return {
    dialog,
    titleId,
    conditionId,
    load,
    setLoad,
    detail,
    setDetail,
    initial,
    setInitial,
    title,
    setTitle,
    condition,
    setCondition,
    reading,
    setReading,
    problems,
    setProblems,
    titleError,
    setTitleError,
    message,
    setMessage,
    conflict,
    setConflict,
    saving,
    setSaving,
    inFlight,
    pendingFocus,
  }
}
