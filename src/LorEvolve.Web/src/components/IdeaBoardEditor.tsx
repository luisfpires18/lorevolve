import { useId, type ReactNode } from 'react'
import { IdeaBoardPicker } from './IdeaBoardPicker'
import { BoardFields } from './ideas/BoardFields'
import { BoardHead } from './ideas/BoardHead'
import { BoardNotices } from './ideas/BoardNotices'
import { BoardSaveBar } from './ideas/BoardSaveBar'
import { BoardToolbar } from './ideas/BoardToolbar'
import { BoardUnavailable } from './ideas/BoardUnavailable'
import { BoardWork } from './ideas/BoardWork'
import { boardCardActions } from '../ideas/boardCardActions'
import { boardDraftActions } from '../ideas/boardDraftActions'
import type { IdeaBoardDetail } from '../ideas/boards'
import { useBoardDraft } from '../ideas/useBoardDraft'
import { useBoardRead } from '../ideas/useBoardRead'
import { useBoardSave } from '../ideas/useBoardSave'
import { useBoardState } from '../ideas/useBoardState'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useI18n } from '../i18n'

interface IdeaBoardEditorProps {
  /** The board being edited, or null for a new one. */
  boardId: string | null
  /** The universe a new board starts in - the one it was started from - or null. */
  defaultUniverseId: string | null
  /** The universe this screen is inside, if any: only its boards open here. */
  contextUniverse: { id: string; name: string } | null
  listPath: string
  listLabel: ReactNode
  onCreated: (board: IdeaBoardDetail) => void
  onDeleted: (board: { id: string; title: string }) => void
}

/**
 * One idea board, new or saved (ADR 0066): a title, an optional universe, and cards - notes, ideas, lore entries - with
 * lines between them, on a canvas or as a plain list.
 *
 * A board is not lore. Placing an idea or an entry on it changes nothing about either, a line is never a relationship,
 * and nothing here offers to turn the board into anything else.
 *
 * Saving is explicit and whole, as an idea's is: Save, or Ctrl+S / Cmd+S. A save over a board saved elsewhere since it
 * opened is refused and the author chooses. Unsaved changes are kept on this device as a recovery copy (ADR 0029) and
 * leaving asks first. Every card is reachable without a pointer: Tab on the canvas, or the list view.
 */
export function IdeaBoardEditor({
  boardId,
  defaultUniverseId,
  contextUniverse,
  listPath,
  listLabel,
  onCreated,
  onDeleted,
}: IdeaBoardEditorProps) {
  const { t, tn, tx } = useI18n()
  const headingId = useId()
  const titleId = useId()
  const universeFieldId = useId()
  const statusId = useId()
  const recoveryId = useId()
  const inspectorId = useId()

  const base = useBoardState({ boardId, defaultUniverseId, contextUniverse })
  const { discard, load, stored, draft, universes, picking, setPicking, announcement } = base
  useBoardRead({ ...base, boardId, t })
  const drafting = useBoardDraft(base)
  const { isDirty } = drafting

  const name = draft.title.trim() || stored.title || t('ideas.board.thisBoard')
  useLeaveGuard(isDirty ? t('ideas.board.leaveGuard', { name }) : null, discard)

  const saving = useBoardSave({ ...base, ...drafting, boardId, onCreated, t })
  const drafts = boardDraftActions({
    ...base,
    ...drafting,
    ...saving,
    boardId,
    onDeleted,
    t,
    tn,
    tx,
  })
  const cards = boardCardActions({ ...base, t })

  if (load.kind !== 'ready') {
    return (
      <BoardUnavailable
        load={load}
        listPath={listPath}
        contextUniverse={contextUniverse}
        reread={drafts.reread}
      />
    )
  }

  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)
  const cardsById = new Map(draft.cards.map((card) => [card.id, card]))
  const view = {
    ...base,
    ...drafting,
    ...saving,
    ...drafts,
    ...cards,
    listPath,
    listLabel,
    headingId,
    titleId,
    universeFieldId,
    statusId,
    recoveryId,
    inspectorId,
    chosenUniverse,
    cardsById,
  }
  const { addPicked } = cards

  return (
    <article className="board" aria-labelledby={headingId} data-testid="board-editor">
      <BoardHead {...view} />

      <BoardNotices {...view} />

      <BoardFields {...view} />

      <BoardToolbar {...view} />

      <BoardWork {...view} />

      <BoardSaveBar {...view} />

      {picking ? (
        <IdeaBoardPicker
          what={picking}
          universe={
            draft.universeId
              ? {
                  id: draft.universeId,
                  name: chosenUniverse?.name ?? t('ideas.board.thisUniverse'),
                }
              : null
          }
          placed={
            new Set(draft.cards.map((card) => card.ideaId ?? card.entityId ?? '').filter(Boolean))
          }
          onChoose={addPicked}
          onClose={() => setPicking(null)}
        />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="board-announcer">
        {announcement}
      </p>
    </article>
  )
}
