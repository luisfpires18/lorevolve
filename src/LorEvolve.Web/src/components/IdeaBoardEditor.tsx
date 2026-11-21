import { useId, type ReactNode } from 'react'
import { IdeaBoardPicker } from './IdeaBoardPicker'
import { BoardFields } from './ideas/BoardFields'
import { BoardToolbar } from './ideas/BoardToolbar'
import { RecordUnavailable } from './ideas/RecordUnavailable'
import { BoardWork } from './ideas/BoardWork'
import { boardCardActions } from '../ideas/boardCardActions'
import type { IdeaBoardDetail } from '../ideas/boards'
import { useBoardEditor } from '../ideas/useBoardEditor'
import { useI18n } from '../i18n'
import { Announce } from './Announce'
import { DocumentHead } from './DocumentHead'
import { EditorNotices } from './EditorNotices'
import { EditorSaveBar } from './EditorSaveBar'

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
  const { t, tn } = useI18n()
  const headingId = useId()
  const titleId = useId()
  const universeFieldId = useId()
  const statusId = useId()
  const recoveryId = useId()
  const inspectorId = useId()

  const base = useBoardEditor({ boardId, defaultUniverseId, contextUniverse, onCreated, onDeleted })
  const { load, stored, draft, universes, picking, setPicking, announcement } = base
  const cards = boardCardActions({ ...base, t })

  if (load.kind !== 'ready') {
    return (
      <RecordUnavailable
        load={load}
        testIdPrefix="board"
        words="ideas.board"
        listPath={listPath}
        contextUniverse={contextUniverse}
        elsewhere={{ open: t('ideas.board.elsewhere.open') }}
        reread={base.reread}
      />
    )
  }

  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)
  const cardsById = new Map(draft.cards.map((card) => [card.id, card]))
  const view = {
    ...base,
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
  const { conflict } = base

  return (
    <article className="board" aria-labelledby={headingId} data-testid="board-editor">
      <DocumentHead
        testIdPrefix="board"
        listPath={listPath}
        listLabel={listLabel}
        isNew={base.isNew}
        title={stored.title}
        newTitle={t('ideas.board.newBoard')}
        menuLabel={t('ideas.board.moreActions', { title: stored.title })}
        deleteLabel={t('ideas.board.deleteBoard')}
        onDelete={() => void base.remove()}
        busy={base.isSaving}
        titleId={headingId}
        lede={t('ideas.board.lede')}
        lastSavedKey="ideas.board.lastSaved"
        updatedAt={stored.updatedAt}
      />

      <EditorNotices
        testId="board"
        recoveryId={recoveryId}
        recovery={
          view.offer && view.copy
            ? {
                what: view.isNew ? t('ideas.board.recoveryNew') : t('ideas.board.recoveryThis'),
                draft: view.offer,
                savedUpdatedAt: stored.updatedAt,
                preview: (
                  <div
                    className="recovery__prose idea__preview prose"
                    role="region"
                    aria-label={t('ideas.board.recoveredDraft')}
                    tabIndex={0}
                  >
                    <p className="idea__previewtitle">
                      {view.copy.title || t('ideas.board.untitled')}
                    </p>
                    <p>
                      {t('ideas.board.countsStop', {
                        cards: tn('ideas.board.cards', view.copy.cards.length),
                        lines: tn('ideas.board.lines', view.copy.connections.length),
                      })}
                    </p>
                  </div>
                ),
                onRecover: view.recoverDraft,
                onDiscard: view.discardDraft,
              }
            : null
        }
        conflict={
          conflict
            ? {
                text: t('ideas.board.conflict.text'),
                onKeepMine: () => void view.save(conflict.updatedAt),
                keepLabel: t('ideas.board.conflict.keepMine'),
                onLoadSaved: () => void view.loadSavedVersion(),
                loadLabel: t('ideas.board.conflict.loadSaved'),
                busy: view.isSaving,
              }
            : null
        }
        failure={view.failure}
        failureClassName="idea__failure"
      />

      <BoardFields {...view} />

      <BoardToolbar {...view} />

      <BoardWork {...view} />

      <EditorSaveBar
        record
        keyShortcuts
        warning={
          view.failed && view.isDirty
            ? { text: t('ideas.board.recoveryWarning'), testId: 'board-recovery-warning' }
            : null
        }
        save={{
          label: view.isNew ? t('ideas.board.create') : t('ideas.board.save'),
          isDirty: view.isDirty,
          isSaving: view.isSaving,
          isBlocked: view.isHeld,
          saves: view.saves,
          restingStatus:
            stored.updatedAt === null ? t('ideas.board.notSavedYet') : t('ideas.board.saved'),
          statusId,
          statusTestId: 'board-status',
          testId: 'board-save',
          type: 'button',
          onSave: () => void view.save(stored.updatedAt),
        }}
      />

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

      <Announce testId="board-announcer">{announcement}</Announce>
    </article>
  )
}
