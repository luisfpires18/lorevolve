import type { KeyboardEvent } from 'react'
import {
  BOARD_CARD_KIND_KEYS,
  BOARD_CARD_KIND_LABELS,
  BoardCardKind,
  cardName,
  type BoardCard,
} from '../../ideas/boards'
import type { BoardSelection } from '../../ideas/boardSelection'
import type { ItemDrag, usePanZoom } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'
import { CanvasCardButton } from '../CanvasCardButton'

/** One card on the board: a real button, pressed to choose it and dragged to move it. */
export function BoardCardButton({
  card,
  selected,
  connecting,
  dragging,
  drawOrder,
  beginItemDrag,
  cardDrag,
  press,
  onCardKeyDown,
}: Pick<ReturnType<typeof usePanZoom>, 'beginItemDrag'> & {
  card: BoardCard
  selected: BoardSelection
  connecting: string | null
  dragging: { id: string; x: number; y: number } | null
  drawOrder: Map<string, number>
  cardDrag: (card: BoardCard) => ItemDrag
  press: (card: BoardCard) => void
  onCardKeyDown: (event: KeyboardEvent<HTMLButtonElement>, card: BoardCard) => void
}) {
  const { t } = useI18n()
  const isSelected = selected?.kind === 'card' && selected.id === card.id
  const name = cardName(card)
  const kind = BOARD_CARD_KIND_LABELS[card.kind]
  return (
    <CanvasCardButton
      x={card.x}
      y={card.y}
      width={card.width}
      height={card.height}
      z={drawOrder.get(card.id)}
      label={t(card.isGone ? 'ideas.canvas.cardGone' : 'ideas.canvas.card', { kind, name })}
      pressed={isSelected}
      connecting={connecting === card.id}
      dragging={dragging?.id === card.id}
      testId="board-card"
      data={{
        'data-kind': BOARD_CARD_KIND_KEYS[card.kind],
        'data-gone': card.isGone || undefined,
        'data-card-id': card.id,
        'data-name': name,
      }}
      onPointerDown={(event) => beginItemDrag(event, cardDrag(card))}
      onPress={() => press(card)}
      onKeyDown={(event) => onCardKeyDown(event, card)}
    >
      <span className="boardcard__kind" aria-hidden="true">
        {card.kind === BoardCardKind.Entity && card.entityTypeName ? card.entityTypeName : kind}
      </span>
      {card.kind === BoardCardKind.Note ? (
        <span className="boardcard__text" aria-hidden="true">
          {card.text || <span className="boardcard__empty">{t('ideas.canvas.emptyNote')}</span>}
        </span>
      ) : (
        <>
          <span className="boardcard__name" aria-hidden="true">
            <bdi>{name}</bdi>
          </span>
          {card.excerpt ? (
            <span className="boardcard__excerpt" aria-hidden="true">
              {card.excerpt}
            </span>
          ) : null}
        </>
      )}
      {card.isGone ? (
        <span className="boardcard__gone" aria-hidden="true">
          {card.kind === BoardCardKind.Idea
            ? t('ideas.canvas.deletedIdea')
            : t('ideas.canvas.inTrash')}
        </span>
      ) : null}
    </CanvasCardButton>
  )
}
