import { useId, type ReactNode } from 'react'
import { SearchPickDrawer } from './SearchPickDrawer'
import { Quoted } from './NameList'
import { listBoardTargets } from '../ideas/api'
import { BoardFields } from './ideas/BoardFields'
import { BoardToolbar } from './ideas/BoardToolbar'
import { RecordNotices, RecordSaveBar, RecordUnavailable } from './ideas/RecordUnavailable'
import { BoardWork } from './ideas/BoardWork'
import { boardCardActions } from '../ideas/boardCardActions'
import type { IdeaBoardDetail } from '../ideas/boards'
import { chosenUniverseOf } from '../ideas/recordKind'
import { useBoardEditor } from '../ideas/useBoardEditor'
import { useI18n } from '../i18n'
import { Announce } from './Announce'
import { EditorHead } from './DocumentHead'

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

  const chosenUniverse = chosenUniverseOf(universes, draft.universeId, stored.universe)
  const cardsById = new Map(draft.cards.map((card) => [card.id, card]))
  // Ideas and entries already on the board, shown as placed rather than offered twice.
  const placed = new Set(
    draft.cards.map((card) => card.ideaId ?? card.entityId ?? '').filter(Boolean),
  )
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

  return (
    <article className="board" aria-labelledby={headingId} data-testid="board-editor">
      <EditorHead
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

      <RecordNotices
        words="ideas.board"
        testId="board"
        recoveryId={recoveryId}
        editor={view}
        preview={(copy) => (
          <p>
            {t('ideas.board.countsStop', {
              cards: tn('ideas.board.cards', copy.cards.length),
              lines: tn('ideas.board.lines', copy.connections.length),
            })}
          </p>
        )}
      />

      <BoardFields {...view} />

      <BoardToolbar {...view} />

      <BoardWork {...view} />

      <RecordSaveBar
        words="ideas.board"
        testId="board"
        statusId={statusId}
        editor={view}
        onSave={() => void view.save(stored.updatedAt)}
      />

      {picking ? (
        <SearchPickDrawer
          testId="board-picker"
          testPrefix="board-picker"
          eyebrow={
            draft.universeId
              ? tx('ideas.boardPicker.inUniverse', {
                  universe: <Quoted text={chosenUniverse?.name ?? t('ideas.board.thisUniverse')} />,
                })
              : t('ideas.boardPicker.inNoUniverse')
          }
          title={
            picking === 'idea' ? t('ideas.boardPicker.addIdea') : t('ideas.boardPicker.addEntry')
          }
          searchLabel={t('ideas.boardPicker.findByName')}
          search={(words, _choice, signal) =>
            listBoardTargets(picking, draft.universeId, words, signal)
          }
          option={(target) => ({
            key: target.id,
            name: target.name,
            isolate: true,
            context: target.entityTypeName,
          })}
          chosen={placed}
          onChoose={addPicked}
          onClose={() => setPicking(null)}
          words={{
            looking: t('ideas.boardPicker.looking'),
            failed: t('ideas.boardPicker.loadFailed'),
            empty:
              picking === 'idea'
                ? {
                    named: t('ideas.boardPicker.emptyNamedIdea'),
                    none: t('ideas.boardPicker.emptyIdeas'),
                  }
                : {
                    named: t('ideas.boardPicker.emptyNamedEntry'),
                    none: t('ideas.boardPicker.emptyEntries'),
                  },
            add: t('ideas.boardPicker.add'),
            done: t('ideas.boardPicker.placed'),
          }}
        />
      ) : null}

      <Announce testId="board-announcer">{announcement}</Announce>
    </article>
  )
}
