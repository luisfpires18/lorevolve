import { useEffect } from 'react'
import { getSystemRule } from './api'
import type { SystemRuleDetail } from './types'
import type { useGuardDrawerState } from './useGuardDrawerState'

/** The guard builder drawer's effects: reading the chosen rule, and the focus on the first field or a refused block. */
export function useGuardDrawerEffects({
  universeId,
  ruleId,
  take,
  load,
  setLoad,
  dialog,
  pendingFocus,
}: ReturnType<typeof useGuardDrawerState> & {
  universeId: string
  ruleId: string | null
  take: (rule: SystemRuleDetail) => void
}) {
  useEffect(() => {
    if (!ruleId) return
    const controller = new AbortController()
    getSystemRule(universeId, ruleId, controller.signal)
      .then(take)
      .catch(() => {
        if (!controller.signal.aborted) setLoad('error')
      })
    return () => controller.abort()
  }, [universeId, ruleId])

  // The first field once there is one, and the block a refusal names once it is drawn.
  useEffect(() => {
    if (load === 'ready') dialog.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [load])
  useEffect(() => {
    if (pendingFocus.current === null) return
    const key = pendingFocus.current
    pendingFocus.current = null
    const target =
      key === 'title'
        ? dialog.current?.querySelector<HTMLElement>('[data-testid="guard-builder-title"]')
        : dialog.current?.querySelector<HTMLElement>(
            `[data-testid="guard-block"][data-path="${key}"]`,
          )
    target?.focus()
  })
}
