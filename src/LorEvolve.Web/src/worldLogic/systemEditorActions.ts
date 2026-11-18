import type { useNavigate } from 'react-router-dom'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction, confirmDiscard } from '../lib/confirm'
import { createSystem, deleteSystem, saveSystem } from './api'
import { advanceVersions } from './machine'
import type { useSystemEditorState } from './useSystemEditorState'

/** The System editor's handlers: reading the System again, saving its name and summary, and deleting it. */
export function systemEditorActions({
  universeId,
  systemId,
  listPath,
  navigate,
  machineDirty,
  setConflict,
  setFailure,
  setFieldErrors,
  setLoad,
  setReads,
  saving,
  setSaving,
  name,
  setName,
  summary,
  setSummary,
  saved,
  setSaved,
  bases,
  setBases,
  setAnnouncement,
}: ReturnType<typeof useSystemEditorState> & {
  universeId: string
  systemId: string | null
  listPath: string
  navigate: ReturnType<typeof useNavigate>
}) {
  async function reread() {
    // Reading the System again starts the Machine tab over too, so an unsaved drawing is asked about first.
    if (
      machineDirty.current &&
      !(await confirmDiscard(t('canon.worldLogic.systems.machine.discard')))
    )
      return
    machineDirty.current = false
    setConflict(false)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((count) => count + 1)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(false)

    const input = {
      name: name.trim(),
      summary,
      projectId: saved?.projectId ?? null,
      expectedVersion: saved ? bases.details : undefined,
    }

    try {
      if (!systemId) {
        await createSystem(universeId, input)
        void navigate(listPath)
        return
      }

      const next = await saveSystem(universeId, systemId, input)
      setBases((current) =>
        advanceVersions(current, 'details', input.expectedVersion!, next.version),
      )
      setSaved(next)
      setName(next.name)
      setSummary(next.summary)
      setAnnouncement(t('canon.worldLogic.systems.editor.saved'))
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'system_changed') {
        setConflict(true)
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'system_name_taken'
      ) {
        setFieldErrors({ name: t('canon.worldLogic.systems.editor.nameTaken') })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('canon.worldLogic.systems.editor.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('canon.worldLogic.systems.editor.invalid'),
        )
      } else {
        setFailure(t('canon.worldLogic.systems.editor.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!systemId || !saved) return
    await confirmAction({
      title: t('canon.worldLogic.systems.editor.delete.title'),
      message: t('canon.worldLogic.systems.editor.delete.message'),
      confirmLabel: t('canon.worldLogic.systems.editor.delete.confirm'),
      busyLabel: t('canon.worldLogic.systems.editor.delete.busy'),
      variant: 'destructive',
      action: async () => {
        await deleteSystem(universeId, systemId)
        void navigate(listPath)
      },
    })
  }

  return { reread, save, remove }
}
