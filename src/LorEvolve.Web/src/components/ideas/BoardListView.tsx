import {
  BOARD_CARD_KIND_LABELS,
  BoardCardKind,
  cardName,
  readingOrder,
  type BoardCard,
  type BoardConnection,
} from '../../ideas/boards'
import type { Fields } from '../../ideas/boardDraft'
import type { BoardSelection } from '../../ideas/boardSelection'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'

/** The board as a plain list: every card in reading order, each with the lines that join it. */
export function BoardListView({
  draft,
  selectedCard,
  connecting,
  connectTo,
  select,
  linesOf,
  otherEnd,
}: {
  draft: Fields
  selectedCard: BoardCard | undefined
  connecting: string | null
  connectTo: (toCardId: string) => void
  select: (selection: BoardSelection) => void
  linesOf: (card: BoardCard) => BoardConnection[]
  otherEnd: (line: BoardConnection, card: BoardCard) => BoardCard | undefined
}) {
  const { t, tx } = useI18n()
  return (
    <div className="boardlist" data-testid="board-list">
      {draft.cards.length === 0 ? (
        <QuietNote className="idea__noreferences">{t('ideas.board.noCards')}</QuietNote>
      ) : (
        <ol className="plainlist stack stack--3">
          {readingOrder(draft.cards).map((card) => {
            const lines = linesOf(card)
            return (
              <li className="boardlist__card" key={card.id}>
                <button
                  className="boardlist__choose"
                  type="button"
                  aria-pressed={selectedCard?.id === card.id}
                  onClick={() =>
                    connecting && connecting !== card.id
                      ? connectTo(card.id)
                      : select({ kind: 'card', id: card.id })
                  }
                  data-testid="board-list-card"
                  data-name={cardName(card)}
                >
                  <span className="idearef__kind">{BOARD_CARD_KIND_LABELS[card.kind]}</span>{' '}
                  <bdi>{cardName(card)}</bdi>
                  {card.isGone ? (
                    <span className="idearef__trashed">
                      {' '}
                      {card.kind === BoardCardKind.Idea
                        ? t('ideas.board.deletedIdea')
                        : t('ideas.board.inTrash')}
                    </span>
                  ) : null}
                </button>
                {lines.length > 0 ? (
                  <ul className="boardlist__lines">
                    {lines.map((line) => (
                      <li key={line.id}>
                        {tx('ideas.board.joinedTo', {
                          name: <bdi>{cardName(otherEnd(line, card)!)}</bdi>,
                        })}
                        {line.label ? <> - {line.label}</> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
