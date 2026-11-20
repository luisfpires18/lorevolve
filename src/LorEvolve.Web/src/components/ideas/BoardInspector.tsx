import type { Dispatch, SetStateAction } from 'react'
import type { BoardCard, BoardConnection } from '../../ideas/boards'
import type { Fields } from '../../ideas/boardDraft'
import type { BoardSelection } from '../../ideas/boardSelection'
import { useI18n } from '../../i18n'
import { BoardCardInspector } from './BoardCardInspector'
import { BoardLineInspector } from './BoardLineInspector'
import { QuietNote } from '../QuietNote'

/** A board editor's inspector: the chosen card, the chosen line, or what the board holds. */
export function BoardInspector({
  inspectorId,
  selectedCard,
  selectedLine,
  draft,
  isHeld,
  editCard,
  listPath,
  linesOf,
  otherEnd,
  select,
  connecting,
  setConnecting,
  removeCard,
  cardsById,
  editLine,
  removeLine,
}: {
  inspectorId: string
  selectedCard: BoardCard | undefined
  selectedLine: BoardConnection | undefined
  draft: Fields
  isHeld: boolean
  editCard: (id: string, change: Partial<BoardCard>) => void
  listPath: string
  linesOf: (card: BoardCard) => BoardConnection[]
  otherEnd: (line: BoardConnection, card: BoardCard) => BoardCard | undefined
  select: (selection: BoardSelection) => void
  connecting: string | null
  setConnecting: Dispatch<SetStateAction<string | null>>
  removeCard: (card: BoardCard) => void
  cardsById: Map<string, BoardCard>
  editLine: (id: string, label: string) => void
  removeLine: (id: string) => void
}) {
  const { t, tn } = useI18n()
  return (
    <aside className="board__inspector" aria-labelledby={inspectorId} data-testid="board-inspector">
      {selectedCard ? (
        <BoardCardInspector
          inspectorId={inspectorId}
          selectedCard={selectedCard}
          isHeld={isHeld}
          editCard={editCard}
          listPath={listPath}
          draft={draft}
          linesOf={linesOf}
          otherEnd={otherEnd}
          select={select}
          connecting={connecting}
          setConnecting={setConnecting}
          removeCard={removeCard}
        />
      ) : selectedLine ? (
        <BoardLineInspector
          inspectorId={inspectorId}
          selectedLine={selectedLine}
          cardsById={cardsById}
          isHeld={isHeld}
          editLine={editLine}
          removeLine={removeLine}
        />
      ) : (
        <>
          <h2 className="idea__subheading" id={inspectorId}>
            {t('ideas.board.counts', {
              cards: tn('ideas.board.cards', draft.cards.length),
              lines: tn('ideas.board.lines', draft.connections.length),
            })}
          </h2>
          <QuietNote spacing="hint">{t('ideas.board.inspector.hint')}</QuietNote>
        </>
      )}
    </aside>
  )
}
