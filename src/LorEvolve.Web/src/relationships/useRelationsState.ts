import { useRef, useState } from 'react'
import type { ChronologyPointDraft } from '../components/ChronologyPointFields'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import type { RelationshipType, RelationshipView } from './types'
import type { RelationDraft } from './relationDraft'

export function useRelationsState() {
  const [views, setViews] = useState<RelationshipView[] | null>(null)
  const [types, setTypes] = useState<RelationshipType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<RelationDraft | null>(null)
  const form = useFormSave({
    needChange: () => t('relationships.section.detailsNeedChange'),
    failed: () => t('relationships.section.saveFailed'),
  })
  const [opened, setOpened] = useState<string | null>(null)
  // The eras each end of a relation being edited has, read when the form needs them (Issue #18).
  const [erasOf, setErasOf] = useState<
    Record<
      string,
      { status: 'loading' | 'loaded' | 'failed'; eras: { id: string; name: string }[] }
    >
  >({})
  const [readError, setReadError] = useState<string | null>(null)
  const whenStatus = useRef<HTMLParagraphElement>(null)
  const whenOpen = useRef<HTMLButtonElement>(null)
  // A time the list is read at, when the author asked: only the relations that hold then.
  const [when, setWhen] = useState<ChronologyPointDraft | null>(null)
  const [shownAt, setShownAt] = useState<ChronologyPointDraft | null>(null)
  return {
    views,
    setViews,
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
    opened,
    setOpened,
    erasOf,
    setErasOf,
    readError,
    setReadError,
    whenStatus,
    whenOpen,
    when,
    setWhen,
    shownAt,
    setShownAt,
  }
}
