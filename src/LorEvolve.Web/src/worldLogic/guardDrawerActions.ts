import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmDiscard } from '../lib/confirm'
import { isChangedElsewhere } from '../lib/editConflict'
import { createSystemRule, getSystemRule, saveSystemRule } from './api'
import { CONDITION_CODES } from './conditionSchema'
import type { Json } from './guard'
import { newGuard } from './guardBlocks'
import { checkComplete, measure } from './guardChecks'
import { blockFor, blockPaths, pathKey, pathOf } from './guardPaths'
import { toCreateRequest, toUpdateRequest } from './guardRequests'
import { sameCondition } from './guardSummary'
import type { SystemRuleDetail, SystemRuleSummary } from './types'
import type { useGuardDrawerState } from './useGuardDrawerState'
import { SYSTEM_RULE_CHANGED, gb } from './machinePanelTypes'
import { summaryOf } from './ruleSummary'

/** The guard builder drawer's handlers: taking a rule as read, editing, saving, and the two ways out of a conflict. */
export function guardDrawerActions({
  universeId,
  projectId,
  onSaved,
  detail,
  setDetail,
  setInitial,
  title,
  setTitle,
  condition,
  setCondition,
  setReading,
  setLoad,
  setProblems,
  setTitleError,
  setMessage,
  setConflict,
  setSaving,
  inFlight,
  pendingFocus,
}: ReturnType<typeof useGuardDrawerState> & {
  universeId: string
  projectId: string | null
  onSaved: (rule: SystemRuleSummary) => void
}) {
  function take(rule: SystemRuleDetail) {
    const next = { title: rule.title, condition: (rule.condition as Json | null) ?? newGuard() }
    setDetail(rule)
    setInitial(next)
    setTitle(next.title)
    setCondition(next.condition)
    setReading((count) => count + 1)
    setLoad('ready')
  }

  function edit(next: Json) {
    setCondition(next)
    setProblems([])
  }

  function refused(error: ApiError) {
    const body = (error.problem ?? {}) as { code?: unknown; path?: unknown; message?: unknown }
    if (typeof body.code === 'string' && typeof body.path === 'string') {
      const known = (CONDITION_CODES as readonly string[]).includes(body.code)
      const text = known
        ? undefined
        : typeof body.message === 'string'
          ? body.message
          : error.message
      const path = pathOf(body.path)
      if (path === null) {
        setMessage(text ?? t(`${gb}.codes.${body.code}` as never))
        return
      }
      const block = blockFor(path, blockPaths(condition))
      setProblems([{ key: `codes.${body.code}`, path: block, message: text }])
      pendingFocus.current = pathKey(block)
      return
    }
    if (error.fieldErrors.title) {
      setTitleError(error.fieldErrors.title)
      pendingFocus.current = 'title'
    }
    setMessage(Object.values(error.fieldErrors)[0] ?? error.message)
  }

  async function save(base: SystemRuleDetail | null) {
    if (inFlight.current) return
    const name = title.trim()
    const local = checkComplete(condition)
    const limit = measure(condition).problem
    if (limit) local.push(limit)
    setTitleError(name === '' ? t(`${gb}.required.title`) : undefined)
    setProblems(local)
    setMessage(local.length > 0 ? t(`${gb}.problems`) : null)
    if (local.length > 0) {
      pendingFocus.current = pathKey(blockFor(local[0].path, blockPaths(condition)))
      return
    }
    if (name === '') {
      pendingFocus.current = 'title'
      return
    }
    if (base && name === base.title && sameCondition(condition, base.condition as Json)) {
      onSaved(summaryOf(base))
      return
    }

    inFlight.current = true
    setSaving(true)
    setConflict(false)
    try {
      const saved = base
        ? await saveSystemRule(universeId, base.id, toUpdateRequest(base, name, condition))
        : await createSystemRule(universeId, toCreateRequest(name, condition, projectId))
      onSaved(summaryOf(saved))
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SYSTEM_RULE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 400) {
        refused(error)
      } else {
        setMessage(t(`${gb}.saveFailed`))
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  /** Saves the guard over whatever is stored now: the rule is read again, then written over at its new version. */
  async function keepMine() {
    if (!detail) return
    try {
      const current = await getSystemRule(universeId, detail.id)
      setDetail(current)
      await save(current)
    } catch {
      setMessage(t(`${gb}.saveFailed`))
    }
  }

  async function loadSaved() {
    if (!detail || !(await confirmDiscard())) return
    try {
      take(await getSystemRule(universeId, detail.id))
      setConflict(false)
      setProblems([])
      setMessage(null)
      setTitleError(undefined)
    } catch {
      setMessage(t(`${gb}.loadFailed`))
    }
  }

  return { take, edit, refused, save, keepMine, loadSaved }
}
