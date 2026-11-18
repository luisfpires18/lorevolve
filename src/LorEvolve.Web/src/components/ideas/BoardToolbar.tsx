import { Lightbulb, List, Plus, StickyNote } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { BOARD_MAX_CARDS, cardName, type BoardCard } from '../../ideas/boards'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'

/** A board editor's toolbar, the hint when the board is full, and the line being drawn. */
export function BoardToolbar({
  isHeld,
  draft,
  addNote,
  setPicking,
  layout,
  setLayout,
  connecting,
  cardsById,
  setConnecting,
}: ReturnType<typeof useBoardState> & {
  isHeld: boolean
  addNote: () => void
  cardsById: Map<string, BoardCard>
}) {
  const { t } = useI18n()
  const isFull = draft.cards.length >= BOARD_MAX_CARDS
  return (
    <>
      <div className="board__toolbar" role="toolbar" aria-label={t('ideas.board.toolbar')}>
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull}
          onClick={addNote}
          data-testid="board-add-note"
        >
          <ActionIcon icon={StickyNote} />
          {t('ideas.board.addNote')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull}
          onClick={() => setPicking('idea')}
          data-testid="board-add-idea"
        >
          <ActionIcon icon={Lightbulb} />
          {t('ideas.board.addIdea')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull || draft.universeId === null}
          title={draft.universeId === null ? t('ideas.board.addLoreNeedsUniverse') : undefined}
          onClick={() => setPicking('entry')}
          data-testid="board-add-entry"
        >
          <ActionIcon icon={Plus} />
          {t('ideas.board.addLore')}
        </button>
        <button
          className="button button--secondary board__layout"
          type="button"
          aria-pressed={layout === 'list'}
          onClick={() => setLayout(layout === 'list' ? 'board' : 'list')}
          data-testid="board-list-toggle"
        >
          <ActionIcon icon={List} />
          {t('ideas.board.listView')}
        </button>
      </div>
      {isFull ? (
        <p className="field__hint" data-testid="board-full">
          {t('ideas.board.cardsFull', { max: BOARD_MAX_CARDS })}
        </p>
      ) : null}
      {connecting ? (
        <p className="notice board__connecting" role="status" data-testid="board-connecting">
          {t('ideas.board.connecting', { name: cardName(cardsById.get(connecting)!) })}{' '}
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setConnecting(null)}
            data-testid="board-connect-cancel"
          >
            {t('ideas.board.cancel')}
          </button>
        </p>
      ) : null}
    </>
  )
}
