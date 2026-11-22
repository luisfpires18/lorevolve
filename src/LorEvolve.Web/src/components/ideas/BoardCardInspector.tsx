import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { Spline, X } from 'lucide-react'
import { Field } from '../Field'
import {
  BOARD_CARD_KIND_LABELS,
  BOARD_NOTE_MAX_LENGTH,
  BoardCardKind,
  cardName,
  type BoardCard,
  type BoardConnection,
} from '../../ideas/boards'
import type { Fields } from '../../ideas/boardDraft'
import type { BoardSelection } from '../../ideas/boardSelection'
import { useI18n } from '../../i18n'
import { Button } from '../Button'

/** The inspector for the chosen card: its note or what it points to, its lines, and drawing a line or taking it off. */
export function BoardCardInspector({
  inspectorId,
  selectedCard,
  isHeld,
  editCard,
  listPath,
  draft,
  linesOf,
  otherEnd,
  select,
  connecting,
  setConnecting,
  removeCard,
}: {
  inspectorId: string
  selectedCard: BoardCard
  isHeld: boolean
  editCard: (id: string, change: Partial<BoardCard>) => void
  listPath: string
  draft: Fields
  linesOf: (card: BoardCard) => BoardConnection[]
  otherEnd: (line: BoardConnection, card: BoardCard) => BoardCard | undefined
  select: (selection: BoardSelection) => void
  connecting: string | null
  setConnecting: Dispatch<SetStateAction<string | null>>
  removeCard: (card: BoardCard) => void
}) {
  const { t, tx } = useI18n()
  return (
    <>
      <h2 className="idea__subheading" id={inspectorId}>
        {selectedCard.kind === BoardCardKind.Entity && selectedCard.entityTypeName
          ? t('ideas.board.kindOfType', {
              kind: BOARD_CARD_KIND_LABELS[selectedCard.kind],
              type: selectedCard.entityTypeName,
            })
          : BOARD_CARD_KIND_LABELS[selectedCard.kind]}
      </h2>
      {selectedCard.kind === BoardCardKind.Note ? (
        <Field
          as="textarea"
          id={`${inspectorId}-text`}
          label={t('ideas.board.inspector.note')}
          rows={5}
          value={selectedCard.text ?? ''}
          maxLength={BOARD_NOTE_MAX_LENGTH}
          readOnly={isHeld}
          onChange={(event) => editCard(selectedCard.id, { text: event.target.value })}
          data-testid="board-note-text"
        />
      ) : (
        <div className="board__target">
          <p className="idearow__title">
            <bdi>{cardName(selectedCard)}</bdi>
          </p>
          {selectedCard.excerpt ? (
            <p className="idearow__excerpt prose">{selectedCard.excerpt}</p>
          ) : null}
          {selectedCard.isGone ? (
            <p className="idearef__trashed" data-testid="board-card-gone">
              {selectedCard.kind === BoardCardKind.Idea
                ? t('ideas.board.inspector.ideaDeleted')
                : t('ideas.board.inspector.entryTrashed')}
            </p>
          ) : selectedCard.kind === BoardCardKind.Idea ? (
            <Link
              to={`${listPath.replace(/\/boards$/, '')}/${selectedCard.ideaId}`}
              data-testid="board-card-open"
            >
              {t('ideas.board.inspector.openIdea')}
            </Link>
          ) : draft.universeId ? (
            <Link
              to={`/app/universes/${draft.universeId}/lore/${selectedCard.entityId}`}
              data-testid="board-card-open"
            >
              {t('ideas.board.inspector.openEntry')}
            </Link>
          ) : null}
        </div>
      )}

      {linesOf(selectedCard).length > 0 ? (
        <ul className="board__lines" data-testid="board-card-lines">
          {linesOf(selectedCard).map((line) => (
            <li key={line.id}>
              <button
                className="boardlist__choose"
                type="button"
                onClick={() => select({ kind: 'line', id: line.id })}
              >
                {tx('ideas.board.lineTo', {
                  name: <bdi>{cardName(otherEnd(line, selectedCard)!)}</bdi>,
                })}
                {line.label ? <> - {line.label}</> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="board__inspectoractions">
        <Button
          tone="secondary"
          icon={Spline}
          disabled={isHeld || draft.cards.length < 2}
          aria-pressed={connecting === selectedCard.id}
          onClick={() => setConnecting(connecting === selectedCard.id ? null : selectedCard.id)}
          data-testid="board-connect"
        >
          {t('ideas.board.inspector.drawLine')}
        </Button>
        <Button
          tone="secondary"
          icon={X}
          disabled={isHeld}
          onClick={() => removeCard(selectedCard)}
          data-testid="board-remove-card"
        >
          {t('ideas.board.inspector.takeOff')}
        </Button>
      </div>
    </>
  )
}
