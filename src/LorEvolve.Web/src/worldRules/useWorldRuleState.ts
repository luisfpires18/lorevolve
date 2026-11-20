import { useRef, useState } from 'react'
import {
  EMPTY_STORED,
  fieldsOf,
  storedMomentOf,
  type Fields,
  type LoadState,
  type Stored,
} from './ruleDraft'
import { WORLD_RULE_CHANGED } from './api'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { useFormSave } from '../lib/useFormSave'

/** The world rule editor's state: the read, the stored rule and the draft, the save's progress, and three refs. */
export function useWorldRuleState({
  isNew,
  announceOnOpen,
}: {
  isNew: boolean
  announceOnOpen: string | null
}) {
  const [load, setLoad] = useState<LoadState>(
    isNew ? { kind: 'ready', value: null } : { kind: 'loading' },
  )
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>(EMPTY_STORED)
  const [draft, setDraft] = useState<Fields>(fieldsOf(EMPTY_STORED))
  const [saves, setSaves] = useState(0)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  // A rule changed elsewhere opens the conflict; a rule gone says so; only a 400 names fields.
  const form = useFormSave({
    needChange: () => t('canon.editor.saveInvalid'),
    failed: () => t('canon.editor.saveFailed'),
    badRequestOnly: true,
    refusal: (error) => {
      if (!(error instanceof ApiError)) return false
      if (error.status === 409 && error.code === WORLD_RULE_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
        return true
      }
      return error.status === 404 ? t('canon.editor.saveGone') : false
    },
  })
  const [announcement, setAnnouncement] = useState(announceOnOpen ?? '')
  const titleInput = useRef<HTMLInputElement>(null)

  return {
    load,
    setLoad,
    reads,
    setReads,
    stored,
    setStored,
    draft,
    setDraft,
    isSaving: form.isSaving,
    runSave: form.save,
    saves,
    setSaves,
    failure: form.message,
    setFailure: form.setMessage,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    conflict,
    setConflict,
    announcement,
    setAnnouncement,
    titleInput,
  }
}
