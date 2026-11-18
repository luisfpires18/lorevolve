import { useEffect } from 'react'
import { ApiError } from '../lib/api'
import { getWorldRule } from './api'
import { t } from '../i18n'
import { fieldsOf, storedFrom } from './ruleDraft'
import type { useWorldRuleState } from './useWorldRuleState'

/** The world rule editor's read of a saved rule, and the focus on a new rule's title. */
export function useWorldRuleReads({
  universeId,
  ruleId,
  reads,
  setLoad,
  setStored,
  setDraft,
  titleInput,
}: ReturnType<typeof useWorldRuleState> & { universeId: string; ruleId: string | null }) {
  const isNew = ruleId === null

  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()

    getWorldRule(universeId, ruleId, controller.signal)
      .then((rule) => {
        const next = storedFrom(rule)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: t('canon.editor.openFailed') },
        )
      })

    return () => {
      controller.abort()
    }
  }, [isNew, universeId, ruleId, reads])

  // A new rule starts in its title.
  useEffect(() => {
    if (isNew) titleInput.current?.focus()
  }, [isNew])
}
