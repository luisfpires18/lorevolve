import { IdeaBoardCanvas } from '../IdeaBoardCanvas'
import type { BoardCard, BoardConnection } from '../../ideas/boards'
import type { BoardSelection } from '../../ideas/boardSelection'
import type { useBoardEditor } from '../../ideas/useBoardEditor'
import { BoardInspector } from './BoardInspector'
import { BoardListView } from './BoardListView'

/** A board editor's work area: the canvas or the list view, and the inspector beside it. */
export function BoardWork({
  layout,
  draft,
  selected,
  connecting,
  setConnecting,
  isHeld,
  select,
  connectTo,
  moveCard,
  centre,
  cardsById,
  inspectorId,
  listPath,
  editCard,
  removeCard,
  editLine,
  removeLine,
}: ReturnType<typeof useBoardEditor> & {
  isHeld: boolean
  select: (selection: BoardSelection) => void
  connectTo: (toCardId: string) => void
  moveCard: (id: string, x: number, y: number) => void
  cardsById: Map<string, BoardCard>
  inspectorId: string
  listPath: string
  editCard: (id: string, change: Partial<BoardCard>) => void
  removeCard: (card: BoardCard) => void
  editLine: (id: string, label: string) => void
  removeLine: (id: string) => void
}) {
  const selectedCard = selected?.kind === 'card' ? cardsById.get(selected.id) : undefined
  const selectedLine =
    selected?.kind === 'line'
      ? draft.connections.find((line) => line.id === selected.id)
      : undefined
  const linesOf = (card: BoardCard) =>
    draft.connections.filter((line) => line.fromCardId === card.id || line.toCardId === card.id)
  const otherEnd = (line: BoardConnection, card: BoardCard) =>
    cardsById.get(line.fromCardId === card.id ? line.toCardId : line.fromCardId)

  return (
    <div className="board__work">
      {layout === 'board' ? (
        <IdeaBoardCanvas
          title={draft.title}
          cards={draft.cards}
          connections={draft.connections}
          selected={selected}
          connecting={connecting}
          readOnly={isHeld}
          onSelect={select}
          onConnectTo={connectTo}
          onMoveCard={moveCard}
          centreRef={centre}
        />
      ) : (
        <BoardListView
          draft={draft}
          selectedCard={selectedCard}
          connecting={connecting}
          connectTo={connectTo}
          select={select}
          linesOf={linesOf}
          otherEnd={otherEnd}
        />
      )}

      <BoardInspector
        inspectorId={inspectorId}
        selectedCard={selectedCard}
        selectedLine={selectedLine}
        draft={draft}
        isHeld={isHeld}
        editCard={editCard}
        listPath={listPath}
        linesOf={linesOf}
        otherEnd={otherEnd}
        select={select}
        connecting={connecting}
        setConnecting={setConnecting}
        removeCard={removeCard}
        cardsById={cardsById}
        editLine={editLine}
        removeLine={removeLine}
      />
    </div>
  )
}
