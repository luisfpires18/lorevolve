import { Lightbulb, List, Plus, StickyNote } from 'lucide-react'
import { BOARD_MAX_CARDS, cardName, type BoardCard } from '../../ideas/boards'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

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
        <Button
          tone="secondary"
          icon={StickyNote}
          disabled={isHeld || isFull}
          onClick={addNote}
          data-testid="board-add-note"
        >
          {t('ideas.board.addNote')}
        </Button>
        <Button
          tone="secondary"
          icon={Lightbulb}
          disabled={isHeld || isFull}
          onClick={() => setPicking('idea')}
          data-testid="board-add-idea"
        >
          {t('ideas.board.addIdea')}
        </Button>
        <Button
          tone="secondary"
          icon={Plus}
          disabled={isHeld || isFull || draft.universeId === null}
          title={draft.universeId === null ? t('ideas.board.addLoreNeedsUniverse') : undefined}
          onClick={() => setPicking('entry')}
          data-testid="board-add-entry"
        >
          {t('ideas.board.addLore')}
        </Button>
        <Button
          tone="secondary"
          icon={List}
          className="board__layout"
          aria-pressed={layout === 'list'}
          onClick={() => setLayout(layout === 'list' ? 'board' : 'list')}
          data-testid="board-list-toggle"
        >
          {t('ideas.board.listView')}
        </Button>
      </div>
      {isFull ? (
        <p className="field__hint" data-testid="board-full">
          {t('ideas.board.cardsFull', { max: BOARD_MAX_CARDS })}
        </p>
      ) : null}
      {connecting ? (
        <p className="notice board__connecting" role="status" data-testid="board-connecting">
          {t('ideas.board.connecting', { name: cardName(cardsById.get(connecting)!) })}{' '}
          <FormActions
            onCancel={() => setConnecting(null)}
            cancelTestId="board-connect-cancel"
            size="sm"
          />
        </p>
      ) : null}
    </>
  )
}
