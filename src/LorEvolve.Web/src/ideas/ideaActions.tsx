import { deleteIdea } from './api'
import { referenceKey } from './ideaDraft'
import type { IdeaReference } from './types'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import type { useI18n } from '../i18n'
import type { useIdeaDraft } from './useIdeaDraft'
import type { useIdeaSave } from './useIdeaSave'
import type { useIdeaState } from './useIdeaState'

/** An idea editor's handlers: reading again, the recovery copy, the universe, references and delete. */
export function ideaActions({
  ideaId,
  onDeleted,
  t,
  tn,
  tx,
  edit,
  setConflict,
  setFailure,
  setFieldErrors,
  setLoad,
  setReads,
  discard,
  offer,
  copy,
  settle,
  universes,
  setDraft,
  setAnnouncement,
  titleInput,
  draft,
  setIsPicking,
  addButton,
  stored,
  isDirty,
}: ReturnType<typeof useIdeaState> &
  ReturnType<typeof useIdeaDraft> &
  ReturnType<typeof useIdeaSave> & {
    ideaId: string | null
    onDeleted: (idea: { id: string; title: string }) => void
  } & Pick<ReturnType<typeof useI18n>, 't' | 'tn' | 'tx'>) {
  // Worked out from `ideaId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = ideaId === null
  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: t('ideas.editor.loadSaved.title'),
        message: t('ideas.editor.loadSaved.message'),
        confirmLabel: t('ideas.editor.loadSaved.confirm'),
        cancelLabel: t('ideas.editor.loadSaved.cancel'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    discard()
    reread()
  }

  function recoverDraft() {
    if (!offer || !copy) return
    settle()

    // A copy may name a universe that has since been deleted: the idea is kept, unassigned, and so is the copy.
    const universeGone =
      copy.universeId !== null &&
      universes !== null &&
      !universes.some((universe) => universe.id === copy.universeId)

    setDraft(universeGone ? { ...copy, universeId: null, references: [] } : copy)
    setAnnouncement(
      universeGone ? t('ideas.editor.recoveredUnassigned') : t('ideas.editor.recovered'),
    )
    requestAnimationFrame(() => titleInput.current?.focus())
  }

  function discardDraft() {
    discard()
    setAnnouncement(isNew ? t('ideas.editor.discardedNew') : t('ideas.editor.discardedSaved'))
    requestAnimationFrame(() => titleInput.current?.focus())
  }

  async function changeUniverse(next: string | null) {
    if (next === draft.universeId) return
    if (draft.references.length > 0) {
      const confirmed = await confirmAction({
        title: t('ideas.editor.changeUniverse.title'),
        message: tn('ideas.editor.changeUniverse.message', draft.references.length, {
          n: draft.references.length,
        }),
        confirmLabel: t('ideas.editor.changeUniverse.confirm'),
        variant: 'warning',
      })
      if (!confirmed) return
      edit({ universeId: next, references: [] })
      setAnnouncement(t('ideas.editor.universeChanged'))
      return
    }
    edit({ universeId: next })
  }

  function addReference(reference: IdeaReference) {
    setIsPicking(false)
    if (!draft.references.some((current) => referenceKey(current) === referenceKey(reference))) {
      edit({ references: [...draft.references, reference] })
    }
    setAnnouncement(t('ideas.editor.referenceAdded', { name: reference.name }))
    requestAnimationFrame(() => addButton.current?.focus())
  }

  function removeReference(reference: IdeaReference) {
    edit({
      references: draft.references.filter(
        (current) => referenceKey(current) !== referenceKey(reference),
      ),
    })
    setAnnouncement(t('ideas.editor.referenceRemoved', { name: reference.name }))
    requestAnimationFrame(() => addButton.current?.focus())
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const deleted = await confirmAction({
      title: tx('ideas.editor.delete.title', { title: <bdi>{title}</bdi> }),
      message: isDirty ? t('ideas.editor.delete.messageDirty') : t('ideas.editor.delete.message'),
      confirmLabel: t('ideas.editor.delete.confirm'),
      busyLabel: t('ideas.editor.delete.busy'),
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? t('ideas.editor.delete.gone')
          : t('ideas.editor.delete.failed'),
      action: () => deleteIdea(ideaId),
    })
    if (!deleted) return
    discard()
    onDeleted({ id: ideaId, title })
  }
  return {
    reread,
    loadSavedVersion,
    recoverDraft,
    discardDraft,
    changeUniverse,
    addReference,
    removeReference,
    remove,
  }
}
