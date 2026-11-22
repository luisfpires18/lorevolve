import { useRef, useState } from 'react'
import { layoutOf } from './sectionLayout'
import type { EntityType } from './typeDefinitions'

/** Every state and ref of a type's sections drawer: the draft layout, the version it opened on, errors and focus. */
export function useFieldSectionsState({ type }: { type: EntityType }) {
  const added = useRef(0)
  const [base, setBase] = useState(() => ({
    layout: layoutOf(type),
    version: type.fieldLayoutVersion,
  }))
  const [sections, setSections] = useState(base.layout.sections)
  const [placed, setPlaced] = useState(base.layout.placed)
  const [order, setOrder] = useState(base.layout.order)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // The section name to focus once the render that shows it is on screen: a new one, or the first one refused.
  const focusKey = useRef<string | null>(null)

  return {
    added,
    base,
    setBase,
    sections,
    setSections,
    placed,
    setPlaced,
    order,
    setOrder,
    errors,
    setErrors,
    message,
    setMessage,
    stale,
    setStale,
    isSaving,
    setIsSaving,
    focusKey,
  }
}
