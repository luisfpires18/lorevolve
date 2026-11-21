import { useCallback, useEffect } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { getWorldRule } from './api'
import { fieldsOf, storedFrom, type LoadState } from './ruleDraft'
import type { useWorldRuleState } from './useWorldRuleState'

const SAVED: LoadState = { kind: 'ready', value: null }

/** The world rule editor's read of a saved rule, and the focus on a new rule's title. */
export function useWorldRuleReads({
  universeId,
  ruleId,
  setStored,
  setDraft,
  titleInput,
}: ReturnType<typeof useWorldRuleState> & { universeId: string; ruleId: string | null }) {
  const isNew = ruleId === null

  // What it reads goes into the stored rule and the draft, so the ready value is empty.
  const read = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        ruleId === null
          ? undefined
          : getWorldRule(universeId, ruleId, signal).then((rule) => {
              const next = storedFrom(rule)
              setStored(next)
              setDraft(fieldsOf(next))
              return null
            }),
      [universeId, ruleId, setStored, setDraft],
    ),
    { missing: true, initial: isNew ? SAVED : undefined, keep: true, keepOnFailure: false },
  )

  // A new rule starts in its title.
  useEffect(() => {
    if (isNew) titleInput.current?.focus()
  }, [isNew])

  return read
}
