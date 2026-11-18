import { CHECK_ERROR_KEYS, checkInput, type CheckDraft } from '../ruleValidation/checkDraft'
import { ApiError } from '../lib/api'
import { createWorldRule, deleteWorldRule, saveWorldRule, WORLD_RULE_CHANGED } from './api'
import type { WorldRuleDetail } from './types'
import { confirmAction } from '../lib/confirm'
import { t, type useI18n } from '../i18n'
import { fieldsOf, sameFields, storedFrom, storedMomentOf, type Fields } from './ruleDraft'
import type { useWorldRuleState } from './useWorldRuleState'

/** The world rule editor's handlers: editing the draft, saving it, reading it again, and moving it to the Trash. */
export function worldRuleActions({
  universeId,
  ruleId,
  onCreated,
  onDeleted,
  tx,
  isDirty,
  isTooLong,
  stored,
  setStored,
  draft,
  setDraft,
  setLoad,
  setReads,
  setIsSaving,
  setSaves,
  setFailure,
  fieldErrors,
  setFieldErrors,
  setConflict,
  setAnnouncement,
  inFlight,
  titleInput,
}: ReturnType<typeof useWorldRuleState> & {
  universeId: string
  ruleId: string | null
  onCreated: (rule: WorldRuleDetail) => void
  onDeleted: (rule: { id: string; title: string }) => void
  tx: ReturnType<typeof useI18n>['tx']
  isDirty: boolean
  isTooLong: boolean
}) {
  const isNew = ruleId === null

  function edit(change: Partial<Omit<Fields, 'check'>>) {
    setDraft((current) => ({ ...current, ...change }))
    const changed = Object.keys(change)
    if (changed.some((field) => fieldErrors[field])) {
      setFieldErrors((current) => {
        const next = { ...current }
        for (const field of changed) delete next[field]
        return next
      })
    }
  }

  function editCheck(change: Partial<CheckDraft>) {
    setDraft((current) => ({ ...current, check: { ...current.check, ...change } }))
    if (Object.values(CHECK_ERROR_KEYS).some((key) => fieldErrors[key])) {
      setFieldErrors((current) => {
        const next = { ...current }
        for (const key of Object.values(CHECK_ERROR_KEYS)) delete next[key]
        return next
      })
    }
  }

  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong) return

    if (draft.title.trim() === '') {
      setFailure(null)
      setFieldErrors({ title: t('canon.editor.titleRequired') })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(null)

    const input = {
      title: sent.title.trim(),
      description: sent.description,
      expectedUpdatedAt,
      validation: checkInput(sent.check),
    }

    try {
      if (isNew) {
        onCreated(await createWorldRule(universeId, input))
        return
      }

      const saved = await saveWorldRule(universeId, ruleId, input)
      const next = storedFrom(saved)
      setStored(next)
      // What was sent is now saved - its title trimmed. Anything typed while the save was in flight is still unsaved, and
      // stays.
      setDraft((current) => (sameFields(current, sent) ? fieldsOf(next) : current))
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === WORLD_RULE_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('canon.editor.saveGone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('canon.editor.saveInvalid'),
        )
      } else {
        setFailure(t('canon.editor.saveFailed'))
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: t('canon.editor.replace.title'),
        message: t('canon.editor.replace.message'),
        confirmLabel: t('canon.editor.replace.confirm'),
        cancelLabel: t('canon.editor.replace.cancel'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    reread()
    setAnnouncement(t('canon.editor.savedLoaded'))
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const trashed = await confirmAction({
      title: tx('canon.editor.trash.title', { title: <bdi>{title}</bdi> }),
      message: isDirty ? t('canon.editor.trash.messageDirty') : t('canon.editor.trash.message'),
      confirmLabel: t('canon.editor.trash.confirm'),
      busyLabel: t('canon.editor.trash.busy'),
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? t('canon.editor.trash.gone')
          : t('canon.editor.trash.failed'),
      action: () => deleteWorldRule(universeId, ruleId),
    })
    if (trashed) onDeleted({ id: ruleId, title })
  }

  return { edit, editCheck, save, reread, loadSavedVersion, remove }
}
