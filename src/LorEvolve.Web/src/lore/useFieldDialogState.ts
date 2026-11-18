import { useState } from 'react'
import { draftOf, type TargetChoice } from './fieldDraft'
import type { FieldImageShapeValue, FieldKindValue, FieldSemanticValue } from './fieldKinds'
import type { FieldDefinition } from './typeDefinitions'

/** Every state of a field's drawer: what it opened over, the draft's settings, errors and saving. */
export function useFieldDialogState({ field }: { field: FieldDefinition | null }) {
  // What this drawer was opened over: the settings an unsaved change is measured against, and the version an edit names.
  // A refused stale save moves it on only when the author chooses (ADR 0043).
  const [base, setBase] = useState(() => ({ draft: draftOf(field), version: field?.version ?? 0 }))
  const initial = base.draft
  // Someone else saved this field after the drawer opened; the draft is kept until the author decides.
  const [stale, setStale] = useState(false)
  const [name, setName] = useState(initial.name)
  const [kind, setKind] = useState<FieldKindValue>(initial.kind)
  const [isRequired, setIsRequired] = useState(initial.isRequired)
  const [options, setOptions] = useState(initial.options)
  const [semantic, setSemantic] = useState<FieldSemanticValue | null>(initial.semantic)
  const [defaultValue, setDefaultValue] = useState(initial.defaultValue)
  const [imageShape, setImageShape] = useState<FieldImageShapeValue>(initial.imageShape)
  const [target, setTarget] = useState<TargetChoice>(initial.target)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  return {
    base,
    setBase,
    initial,
    stale,
    setStale,
    name,
    setName,
    kind,
    setKind,
    isRequired,
    setIsRequired,
    options,
    setOptions,
    semantic,
    setSemantic,
    defaultValue,
    setDefaultValue,
    imageShape,
    setImageShape,
    target,
    setTarget,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
  }
}
