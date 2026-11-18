import { useEffect, useId, useRef, useState } from 'react'
import { discardBackup, type BackupRefusal, type BackupValidation } from './api'

export type Stage =
  | { kind: 'choose' }
  | { kind: 'checking'; percent: number | null }
  | { kind: 'refused'; refusal: BackupRefusal }
  | { kind: 'ready'; validation: BackupValidation }
  | { kind: 'restoring'; validation: BackupValidation }

/** The restore panel's file id, stage, drafts and refs, with the unmount discard and the heading focus. */
export function useRestoreBackupState() {
  const fileId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [chooseError, setChooseError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const readyHeading = useRef<HTMLHeadingElement>(null)
  const refusedHeading = useRef<HTMLHeadingElement>(null)
  const upload = useRef<AbortController | null>(null)

  // The token of a checked file nobody has restored yet, so leaving lets the server drop it.
  const waiting = useRef<string | null>(null)

  useEffect(
    () => () => {
      upload.current?.abort()
      if (waiting.current) void discardBackup(waiting.current)
    },
    [],
  )

  useEffect(() => {
    if (stage.kind === 'ready') readyHeading.current?.focus()
    if (stage.kind === 'refused') refusedHeading.current?.focus()
  }, [stage.kind])

  return {
    fileId,
    file,
    setFile,
    stage,
    setStage,
    chooseError,
    setChooseError,
    name,
    setName,
    nameError,
    setNameError,
    failure,
    setFailure,
    fileInput,
    readyHeading,
    refusedHeading,
    upload,
    waiting,
  }
}
