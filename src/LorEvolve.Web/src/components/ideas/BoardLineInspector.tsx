import { X } from 'lucide-react'
import { Field } from '../Field'
import {
  BOARD_LABEL_MAX_LENGTH,
  cardName,
  type BoardCard,
  type BoardConnection,
} from '../../ideas/boards'
import { useI18n } from '../../i18n'
import { Button } from '../Button'

/** The inspector for the chosen line: the cards it joins, its label, and Remove. */
export function BoardLineInspector({
  inspectorId,
  selectedLine,
  cardsById,
  isHeld,
  editLine,
  removeLine,
}: {
  inspectorId: string
  selectedLine: BoardConnection
  cardsById: Map<string, BoardCard>
  isHeld: boolean
  editLine: (id: string, label: string) => void
  removeLine: (id: string) => void
}) {
  const { t, tx } = useI18n()
  return (
    <>
      <h2 className="idea__subheading" id={inspectorId}>
        {t('ideas.board.inspector.line')}
      </h2>
      <p>
        {tx('ideas.board.inspector.between', {
          from: <bdi>{cardName(cardsById.get(selectedLine.fromCardId)!)}</bdi>,
          to: <bdi>{cardName(cardsById.get(selectedLine.toCardId)!)}</bdi>,
        })}
      </p>
      <Field
        name={`${inspectorId}-label`}
        label={t('ideas.board.inspector.label')}
        type="text"
        value={selectedLine.label ?? ''}
        maxLength={BOARD_LABEL_MAX_LENGTH}
        readOnly={isHeld}
        onChange={(event) => editLine(selectedLine.id, event.target.value)}
        data-testid="board-line-label"
      />
      <Button
        tone="danger-quiet"
        icon={X}
        disabled={isHeld}
        onClick={() => removeLine(selectedLine.id)}
        data-testid="board-remove-line"
      >
        {t('ideas.board.inspector.removeLine')}
      </Button>
    </>
  )
}
