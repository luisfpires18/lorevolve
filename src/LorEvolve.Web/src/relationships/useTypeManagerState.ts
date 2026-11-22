import { useState } from 'react'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import type { RelationshipType } from './types'
import { BLANK, type TypeDraft } from './typeDraft'

export function useTypeManagerState() {
  const [types, setTypes] = useState<RelationshipType[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<TypeDraft>(BLANK)
  const form = useFormSave({ needChange: null, failed: () => t('relationships.types.saveFailed') })
  return {
    types,
    setTypes,
    editingId,
    setEditingId,
    isAdding,
    setIsAdding,
    draft,
    setDraft,
    form,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    isSaving: form.isSaving,
  }
}
