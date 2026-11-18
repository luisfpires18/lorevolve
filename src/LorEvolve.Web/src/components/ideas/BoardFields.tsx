import { Field } from '../Field'
import { BOARD_TITLE_MAX_LENGTH } from '../../ideas/boards'
import type { Fields } from '../../ideas/boardDraft'
import type { useBoardState } from '../../ideas/useBoardState'
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
}: ReturnType<typeof useBoardState> & {
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
      >
        {(control) => (
          <input
            {...control}
            ref={titleInput}
            className="field__input"
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
        )}
      </Field>
      <Field id={universeFieldId} label={t('ideas.board.fields.universe')}>
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select"
            value={draft.universeId ?? ''}
            disabled={isHeld}
            onChange={(event) =>
              void changeUniverse(event.target.value === '' ? null : event.target.value)
            }
            data-testid="board-universe"
          >
            {chosenUniverse && !universes?.some((universe) => universe.id === chosenUniverse.id) ? (
              <option value={chosenUniverse.id}>{chosenUniverse.name}</option>
            ) : null}
            {(universes ?? []).map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.isArchived
                  ? t('ideas.board.fields.archivedUniverse', { name: universe.name })
                  : universe.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  )
}
