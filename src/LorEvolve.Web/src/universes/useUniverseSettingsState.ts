import { useEffect, useRef, useState } from 'react'
import { getPublication } from '../publishing/api'
import { Visibility } from '../publishing/types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'

/** Settings' saved notes, the busy state, the two confirms with their focus, whether the universe is public, and the export. */
export function useUniverseSettingsState({ universe }: { universe: WorkspaceContext['universe'] }) {
  const [savedDetails, setSavedDetails] = useState(false)
  const [savedColour, setSavedColour] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [isPublic, setIsPublic] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archiveConfirm = useRef<HTMLDivElement>(null)
  const archiveButton = useRef<HTMLButtonElement>(null)
  const deleteConfirm = useRef<HTMLDivElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const hadDeleteConfirm = useRef(false)

  // Whether the universe is public, for the archive's words. Publication itself is on Publish.
  useEffect(() => {
    const controller = new AbortController()
    getPublication(universe.id, controller.signal)
      .then((state) => setIsPublic(state.visibility === Visibility.Public))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id])

  // A confirmation takes the focus when it opens; Cancel hands the focus back to what opened it, which is only mounted
  // again after the render.
  const archiveCancelled = useRef(false)
  useEffect(() => {
    if (confirmingArchive) {
      archiveConfirm.current?.focus()
    } else if (archiveCancelled.current) {
      archiveCancelled.current = false
      archiveButton.current?.focus()
    }
  }, [confirmingArchive])

  useEffect(() => {
    if (confirmingDelete) {
      hadDeleteConfirm.current = true
      deleteConfirm.current?.focus()
    } else if (hadDeleteConfirm.current) {
      hadDeleteConfirm.current = false
      deleteButton.current?.focus()
    }
  }, [confirmingDelete])

  const [exporting, setExporting] = useState<'backup' | 'readable' | null>(null)
  const [exportedAs, setExportedAs] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  return {
    savedDetails,
    setSavedDetails,
    savedColour,
    setSavedColour,
    busy,
    setBusy,
    confirmingDelete,
    setConfirmingDelete,
    confirmingArchive,
    setConfirmingArchive,
    isPublic,
    setIsPublic,
    error,
    setError,
    archiveConfirm,
    archiveButton,
    deleteConfirm,
    deleteButton,
    hadDeleteConfirm,
    archiveCancelled,
    exporting,
    setExporting,
    exportedAs,
    setExportedAs,
    exportError,
    setExportError,
  }
}
