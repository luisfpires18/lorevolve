import { blockingFindingsOf } from '../canon/blocked'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { bulkCreateEntities } from './api'
import { fieldOfKey } from './massCreate'
import type { NavigateFunction } from 'react-router-dom'
import type { MassCreatedState } from '../pages/MassCreatePage'
import type { ServerProblem, useMassRows } from './useMassRows'

/** Sending the rows as one batch, and the leave question while any are unsent. */
export function useMassCreate({
  rows,
  draft,
  isDone,
  setIsDone,
  sending,
  setAttempted,
  isReady,
  problems,
  serverProblems,
  setServerProblems,
  controlId,
  isCreating,
  setIsCreating,
  setFailure,
  setBlocked,
  needFixing,
  universe,
  navigate,
  lorePath,
}: ReturnType<typeof useMassRows> & {
  universe: { id: string }
  navigate: NavigateFunction
  lorePath: string
}) {
  const { t, tn } = useI18n()
  const hasWork = !isDone && (rows.length > 0 || draft.trim() !== '')
  useLeaveGuard(
    !hasWork
      ? null
      : rows.length > 0
        ? tn('lore.massCreate.leaveRows', rows.length, { n: rows.length })
        : t('lore.massCreate.leavePaste'),
  )

  async function create() {
    if (sending.current || rows.length === 0) return
    setAttempted(true)

    const firstUnready = rows.find((row) => !isReady(row))
    if (firstUnready) {
      const field =
        problems.get(firstUnready.key)?.[0]?.field ??
        serverProblems.get(firstUnready.key)?.[0]?.field ??
        'name'
      document.getElementById(controlId(field, firstUnready.key))?.focus()
      return
    }

    sending.current = true
    setIsCreating(true)
    setFailure(null)
    setBlocked(null)

    try {
      const { created } = await bulkCreateEntities(
        universe.id,
        rows.map((row) => ({
          entityTypeId: row.typeId!,
          name: row.name.trim(),
          canonStatus: row.status!,
        })),
      )

      // Nothing is unsaved any more, so leaving asks nothing. Back to the whole of Lore, newest first, where every new
      // entry is - a type filter would hide the ones of any other type.
      setIsDone(true)
      await navigate(lorePath, {
        state: { massCreated: created.length } satisfies MassCreatedState,
      })
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError && error.status === 400) {
        // Problems come back keyed by row, in the order the rows were sent: `entries[3].name`.
        const byRow = new Map<number, ServerProblem[]>()
        let general: string | null = null
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          const index = /^entries\[(\d+)\]/.exec(key)?.[1]
          const row = index === undefined ? undefined : rows[Number(index)]
          if (row) {
            byRow.set(row.key, [...(byRow.get(row.key) ?? []), { field: fieldOfKey(key), message }])
          } else {
            general = message
          }
        }
        setServerProblems(byRow)
        setFailure(
          t('lore.massCreate.nothingCreated', {
            reason: general ?? (byRow.size > 0 ? t('lore.massCreate.fixRows') : error.message),
          }),
        )
      } else {
        setFailure(
          t('lore.massCreate.nothingCreatedKept', {
            reason: error instanceof ApiError ? error.message : t('lore.massCreate.tryAgain'),
          }),
        )
      }
    } finally {
      sending.current = false
      setIsCreating(false)
    }
  }

  const unavailable = rows.length === 0 || needFixing > 0 || isCreating
  const status =
    rows.length === 0
      ? t('lore.massCreate.statusNone')
      : needFixing > 0
        ? tn('lore.massCreate.statusFix', needFixing, { n: needFixing })
        : tn('lore.massCreate.statusReady', rows.length, { n: rows.length })

  return { create, unavailable, status }
}
