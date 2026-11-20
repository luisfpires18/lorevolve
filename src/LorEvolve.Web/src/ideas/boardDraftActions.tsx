import { BoardCardKind, deleteIdeaBoard } from './boards'
import { withoutEntries, type Fields } from './boardDraft'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import type { useI18n } from '../i18n'
import type { useDraftedEditor } from '../lib/useDraftedEditor'
import type { useBoardSave } from './useBoardSave'
import type { useBoardState } from './useBoardState'

/** A board editor's handlers for the whole board: reading again, the recovery copy, the universe and delete. */
export function boardDraftActions({
  boardId,
  onDeleted,
  t,
  tn,
  tx,
  edit,
  setConflict,
  setFailure,
  setFieldErrors,
  setSelected,
  setConnecting,
  setLoad,
  setReads,
  discard,
  offer,
  copy,
  settle,
  universes,
  setDraft,
  setAnnouncement,
  draft,
  stored,
  isDirty,
}: ReturnType<typeof useBoardState> &
  ReturnType<typeof useDraftedEditor<Fields>> &
  ReturnType<typeof useBoardSave> & {
    boardId: string | null
    onDeleted: (board: { id: string; title: string }) => void
  } & Pick<ReturnType<typeof useI18n>, 't' | 'tn' | 'tx'>) {
  // Worked out from `boardId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = boardId === null
  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setSelected(null)
    setConnecting(null)
    setLoad({ kind: 'loading' })
    setReads((total) => total + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: t('ideas.board.loadSaved.title'),
        message: t('ideas.board.loadSaved.message'),
        confirmLabel: t('ideas.board.loadSaved.confirm'),
        cancelLabel: t('ideas.board.loadSaved.cancel'),
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
    const universeGone =
      copy.universeId !== null &&
      universes !== null &&
      !universes.some((universe) => universe.id === copy.universeId)
    setDraft(universeGone ? withoutEntries({ ...copy, universeId: null }) : copy)
    setAnnouncement(
      universeGone ? t('ideas.board.recoveredUnassigned') : t('ideas.board.recovered'),
    )
  }

  function discardDraft() {
    discard()
    setAnnouncement(t('ideas.board.discarded'))
  }

  async function changeUniverse(next: string | null) {
    if (next === draft.universeId) return
    const entries = draft.cards.filter((card) => card.kind === BoardCardKind.Entity).length
    if (entries > 0) {
      const confirmed = await confirmAction({
        title: t('ideas.board.changeUniverse.title'),
        message: tn('ideas.board.changeUniverse.message', entries),
        confirmLabel: t('ideas.board.changeUniverse.confirm'),
        variant: 'warning',
      })
      if (!confirmed) return
      setDraft((current) => ({ ...withoutEntries(current), universeId: next }))
      setSelected(null)
      setConnecting(null)
      setAnnouncement(t('ideas.board.universeChanged'))
      return
    }
    edit({ universeId: next })
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const deleted = await confirmAction({
      title: tx('ideas.board.delete.title', { title: <bdi>{title}</bdi> }),
      message: isDirty ? t('ideas.board.delete.messageDirty') : t('ideas.board.delete.message'),
      confirmLabel: t('ideas.board.delete.confirm'),
      busyLabel: t('ideas.board.delete.busy'),
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? t('ideas.board.delete.gone')
          : t('ideas.board.delete.failed'),
      action: () => deleteIdeaBoard(boardId),
    })
    if (!deleted) return
    discard()
    onDeleted({ id: boardId, title })
  }

  return { reread, loadSavedVersion, recoverDraft, discardDraft, changeUniverse, remove }
}
