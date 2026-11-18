import { t } from '../i18n'
import { ApiError } from '../lib/api'
import {
  createKnowledgeRecord,
  updateKnowledgeRecord,
  type KnowledgeRecord,
  type KnowledgeRecordInput,
} from './api'
import type { Dispatch, SetStateAction } from 'react'
import type { Draft, Side } from './recordDraft'

/** Builds a knowledge record drawer's Save: checks the draft, then creates or updates the record. */
export function recordFormSave({
  universeId,
  entityId,
  side,
  record,
  onSaved,
  draft,
  setErrors,
  setMessage,
  setIsSaving,
}: {
  universeId: string
  entityId: string
  side: Side
  record: KnowledgeRecord | null
  onSaved: () => void
  draft: Draft
  setErrors: Dispatch<SetStateAction<Record<string, string>>>
  setMessage: Dispatch<SetStateAction<string | null>>
  setIsSaving: Dispatch<SetStateAction<boolean>>
}) {
  async function save() {
    setErrors({})
    setMessage(null)

    const input: KnowledgeRecordInput = {
      knowerEntityId: side === 'knows' ? entityId : (draft.other?.id ?? ''),
      subjectEntityId: side === 'knows' ? (draft.other?.id ?? null) : entityId,
      statement: draft.statement,
      sceneId: draft.knownFromStart ? null : draft.sceneId || null,
      knownFromStart: draft.knownFromStart,
    }

    const local: Record<string, string> = {}
    if (side === 'about' && !draft.other) local.other = t('ai.knowledge.form.chooseKnower')
    if (draft.statement.trim() === '') local.statement = t('ai.knowledge.form.sayWhat')
    if (!draft.knownFromStart && !draft.sceneId) {
      local.sceneId = t('ai.knowledge.form.chooseScene')
    }
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    setIsSaving(true)
    try {
      if (record) await updateKnowledgeRecord(universeId, record.id, input)
      else await createKnowledgeRecord(universeId, input)
      onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 400) {
        const fields = error.fieldErrors
        setErrors({
          other: fields[side === 'knows' ? 'subjectentityid' : 'knowerentityid'] ?? '',
          statement: fields.statement ?? '',
          sceneId: fields.sceneid ?? '',
        })
        if (
          !fields.statement &&
          !fields.sceneid &&
          !fields.subjectentityid &&
          !fields.knowerentityid
        ) {
          setMessage(error.message)
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage(t('ai.knowledge.form.gone'))
      } else {
        setMessage(t('ai.knowledge.form.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { save }
}
