import { useState } from 'react'
import type { RelationshipType } from './types'
import { BLANK, type TypeDraft } from './typeDraft'

export function useTypeManagerState() {
  const [types, setTypes] = useState<RelationshipType[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<TypeDraft>(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  return {
    types,
    setTypes,
    editingId,
    setEditingId,
    isAdding,
    setIsAdding,
    draft,
    setDraft,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
  }
}
