import { Field } from '../Field'
import { UniverseSelect } from './UniverseSelect'
import { BOARD_TITLE_MAX_LENGTH } from '../../ideas/boards'
import type { Fields } from '../../ideas/boardDraft'
import type { useBoardEditor } from '../../ideas/useBoardEditor'
import { useI18n } from '../../i18n'

/** A board editor's title and universe fields. */
export function BoardFields({
  titleId,
  universeFieldId,
  fieldErrors,
  titleInput,
  draft,
  isHeld,
  edit,
  changeUniverse,
  chosenUniverse,
  universes,
}: ReturnType<typeof useBoardEditor> & {
  titleId: string
  universeFieldId: string
  isHeld: boolean
  edit: (change: Partial<Fields>) => void
  changeUniverse: (next: string | null) => Promise<void>
  chosenUniverse: { id: string; name: string } | null
}) {
  const { t } = useI18n()
  return (
    <div className="board__fields">
      <Field
        id={titleId}
        label={t('ideas.board.fields.title')}
        error={
          fieldErrors.title ? (
            <span data-testid="board-title-error">{fieldErrors.title}</span>
          ) : undefined
        }
        name={null}
        ref={titleInput}
        type="text"
        dir="auto"
        value={draft.title}
        maxLength={BOARD_TITLE_MAX_LENGTH}
        placeholder={t('ideas.board.fields.titlePlaceholder')}
        readOnly={isHeld}
        onChange={(event) => edit({ title: event.target.value })}
        aria-required="true"
        data-testid="board-title"
      />
      <UniverseSelect
        universes={universes}
        archivedKey="ideas.board.fields.archivedUniverse"
        stray={chosenUniverse ? { id: chosenUniverse.id, label: chosenUniverse.name } : null}
        id={universeFieldId}
        label={t('ideas.board.fields.universe')}
        value={draft.universeId ?? ''}
        disabled={isHeld}
        onChange={(event) =>
          void changeUniverse(event.target.value === '' ? null : event.target.value)
        }
        data-testid="board-universe"
      />
    </div>
  )
}
