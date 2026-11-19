import { useRef, useState } from 'react'
import { EMPTY_STORED, fieldsOf, type Fields, type LoadState, type Stored } from './ruleDraft'

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
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [announcement, setAnnouncement] = useState(announceOnOpen ?? '')
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const shortcut = useRef<() => void>(() => {})

  return {
    load,
    setLoad,
    reads,
    setReads,
    stored,
    setStored,
    draft,
    setDraft,
    isSaving,
    setIsSaving,
    saves,
    setSaves,
    failure,
    setFailure,
    fieldErrors,
    setFieldErrors,
    conflict,
    setConflict,
    announcement,
    setAnnouncement,
    inFlight,
    titleInput,
    shortcut,
  }
}
