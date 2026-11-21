import { Lightbulb, List, StickyNote } from 'lucide-react'
import { BOARD_MAX_CARDS, cardName, type BoardCard } from '../../ideas/boards'
import type { useBoardEditor } from '../../ideas/useBoardEditor'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { Callout } from '../Callout'

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
}: ReturnType<typeof useBoardEditor> & {
  isHeld: boolean
  addNote: () => void
  cardsById: Map<string, BoardCard>
}) {
  const { t } = useI18n()
  const isFull = draft.cards.length >= BOARD_MAX_CARDS
  return (
    <>
      <div className="board__toolbar" role="toolbar" aria-label={t('ideas.board.toolbar')}>
        <NewButton
          tone="secondary"
          icon={StickyNote}
          disabled={isHeld || isFull}
          onClick={addNote}
          data-testid="board-add-note"
        >
          {t('ideas.board.addNote')}
        </NewButton>
        <NewButton
          tone="secondary"
          icon={Lightbulb}
          disabled={isHeld || isFull}
          onClick={() => setPicking('idea')}
          data-testid="board-add-idea"
        >
          {t('ideas.board.addIdea')}
        </NewButton>
        <NewButton
          tone="secondary"
          disabled={isHeld || isFull || draft.universeId === null}
          title={draft.universeId === null ? t('ideas.board.addLoreNeedsUniverse') : undefined}
          onClick={() => setPicking('entry')}
          data-testid="board-add-entry"
        >
          {t('ideas.board.addLore')}
        </NewButton>
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
        <QuietNote spacing="hint" testId="board-full">
          {t('ideas.board.cardsFull', { max: BOARD_MAX_CARDS })}
        </QuietNote>
      ) : null}
      {connecting ? (
        <Callout
          look="notice"
          as="p"
          className="board__connecting"
          role="status"
          testId="board-connecting"
        >
          {t('ideas.board.connecting', { name: cardName(cardsById.get(connecting)!) })}{' '}
          <FormActions
            onCancel={() => setConnecting(null)}
            cancelTestId="board-connect-cancel"
            size="sm"
          />
        </Callout>
      ) : null}
    </>
  )
}
