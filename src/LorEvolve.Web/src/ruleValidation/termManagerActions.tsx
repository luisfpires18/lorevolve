import type { KeyboardEvent } from 'react'
import { t, type useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import {
  createValidationTerm,
  deleteValidationTerm,
  listValidationTerms,
  renameValidationTerm,
} from './api'
import { TERM_KIND_WORDS, type ValidationTerm } from './types'
import { confirmAction } from '../lib/confirm'
import type { useTermManagerState } from './useTermManagerState'

/** The term manager's handlers: reading the terms again, renaming, deleting and adding one. */
export function termManagerActions({
  universeId,
  tx,
  setTerms,
  setMessage,
  renaming,
  setRenaming,
  busyId,
  setBusyId,
  newKind,
  newName,
  setNewName,
  setNewError,
}: ReturnType<typeof useTermManagerState> & {
  universeId: string
  tx: ReturnType<typeof useI18n>['tx']
}) {
  async function refresh() {
    setTerms(await listValidationTerms(universeId))
  }

  async function saveRename() {
    if (!renaming || busyId) return
    const text = renaming.text.trim()
    setBusyId(renaming.id)
    try {
      await renameValidationTerm(universeId, renaming.id, text)
      setRenaming(null)
      await refresh()
    } catch (error: unknown) {
      setRenaming(
        (current) =>
          current && {
            ...current,
            error:
              error instanceof ApiError
                ? (error.fieldErrors.name ?? error.message)
                : t('canon.terms.renameFailed'),
          },
      )
    } finally {
      setBusyId(null)
    }
  }

  async function remove(term: ValidationTerm) {
    setMessage(null)
    const deleted = await confirmAction({
      title: tx('canon.terms.delete.title', {
        word: TERM_KIND_WORDS[term.kind],
        name: <bdi>{term.name}</bdi>,
      }),
      message: t('canon.terms.delete.message'),
      confirmLabel: t('canon.terms.delete.confirm'),
      busyLabel: t('canon.terms.delete.busy'),
      variant: 'destructive',
      failure: t('canon.terms.delete.failed'),
      action: async () => {
        try {
          await deleteValidationTerm(universeId, term.id)
        } catch (error: unknown) {
          await refresh().catch(() => undefined)
          throw error
        }
      },
    })
    if (deleted) await refresh()
  }

  async function add() {
    const name = newName.trim()
    if (name === '') {
      setNewError(t('canon.terms.nameRequired', { word: TERM_KIND_WORDS[newKind] }))
      return
    }
    setNewError(null)
    try {
      await createValidationTerm(universeId, newKind, name)
      setNewName('')
      await refresh()
    } catch (error: unknown) {
      setNewError(
        error instanceof ApiError
          ? (error.fieldErrors.name ?? error.message)
          : t('canon.terms.addFailed'),
      )
    }
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setRenaming(null)
    }
  }

  return { refresh, saveRename, remove, add, onRenameKeyDown }
}
