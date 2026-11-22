import type { FormEvent } from 'react'
import {
  discardBackup,
  MAX_BACKUP_BYTES,
  refusalFrom,
  restoreBackup,
  RESTORE_EXPIRED,
  validateBackup,
} from './api'
import { ApiError } from '../lib/api'
import type { UniverseDetail } from '../universes/types'
import type { useI18n } from '../i18n'
import type { useRestoreBackupState } from './useRestoreBackupState'

/** The restore panel's handlers: checking the chosen file, choosing another and restoring. */
export function restoreBackupActions({
  t,
  onRestored,
  file,
  setFile,
  stage,
  setStage,
  setChooseError,
  name,
  setName,
  setNameError,
  setFailure,
  fileInput,
  upload,
  waiting,
}: ReturnType<typeof useRestoreBackupState> & {
  t: ReturnType<typeof useI18n>['t']
  onRestored: (universe: UniverseDetail) => void
}) {
  function forgetWaiting() {
    if (waiting.current) {
      void discardBackup(waiting.current)
      waiting.current = null
    }
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setChooseError(null)

    if (!file) {
      setChooseError(t('admin.restore.chooseFirst'))
      fileInput.current?.focus()
      return
    }

    if (file.size > MAX_BACKUP_BYTES) {
      setChooseError(t('admin.restore.tooLarge', { mb: MAX_BACKUP_BYTES / (1024 * 1024) }))
      fileInput.current?.focus()
      return
    }

    forgetWaiting()
    const controller = new AbortController()
    upload.current = controller
    setStage({ kind: 'checking', percent: 0 })

    try {
      const validation = await validateBackup(file, {
        signal: controller.signal,
        onProgress: ({ ratio }) =>
          setStage({
            kind: 'checking',
            percent: ratio === null || ratio >= 1 ? null : Math.round(ratio * 100),
          }),
      })

      waiting.current = validation.token
      setName(validation.preview.universeName)
      setNameError(validation.preview.nameAvailable ? undefined : t('admin.restore.nameTaken'))
      setFailure(null)
      setStage({ kind: 'ready', validation })
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStage({ kind: 'choose' })
        return
      }

      const refusal = refusalFrom(error)
      setStage({
        kind: 'refused',
        refusal: refusal ?? {
          code: error instanceof ApiError ? error.code : null,
          detail:
            error instanceof ApiError && error.status === 413
              ? t('admin.restore.serverTooLarge')
              : error instanceof ApiError && error.status !== 0
                ? error.message
                : t('admin.restore.sendFailed'),
          issues: [],
          moreIssues: 0,
        },
      })
    } finally {
      upload.current = null
    }
  }

  function chooseAnother() {
    forgetWaiting()
    setFile(null)
    setFailure(null)
    setNameError(undefined)
    setStage({ kind: 'choose' })
    requestAnimationFrame(() => fileInput.current?.focus())
  }

  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stage.kind !== 'ready') return

    const validation = stage.validation
    setFailure(null)
    setNameError(undefined)
    setStage({ kind: 'restoring', validation })

    try {
      const universe = await restoreBackup(validation.token, name.trim())
      waiting.current = null
      onRestored(universe)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === RESTORE_EXPIRED) {
        waiting.current = null
        setFile(null)
        setStage({ kind: 'choose' })
        setChooseError(error.message)
        requestAnimationFrame(() => fileInput.current?.focus())
        return
      }

      const refusal = refusalFrom(error)
      if (refusal) {
        waiting.current = null
        setStage({ kind: 'refused', refusal })
        return
      }

      setStage({ kind: 'ready', validation })

      if (error instanceof ApiError && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name)
        requestAnimationFrame(() => document.getElementById('restore-name')?.focus())
      } else {
        setFailure(
          error instanceof ApiError && error.status !== 0
            ? error.message
            : t('admin.restore.restoreFailed'),
        )
      }
    }
  }

  return { check, chooseAnother, restore }
}
