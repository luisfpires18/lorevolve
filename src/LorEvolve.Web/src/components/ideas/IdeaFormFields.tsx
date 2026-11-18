import type { RefObject } from 'react'
import { Field } from '../Field'
import type { Fields } from '../../ideas/ideaDraft'
import { IDEA_BODY_MAX_LENGTH, IDEA_TITLE_MAX_LENGTH } from '../../ideas/types'
import { numberFormat } from '../../i18n/format'
import type { UniverseSummary } from '../../universes/types'
import { useI18n } from '../../i18n'

const count = (value: number) => numberFormat({}, 'en').format(value)

/** An idea editor's title, body and universe fields. */
export function IdeaFormFields({
  titleId,
  bodyId,
  universeFieldId,
  bodyCountId,
  fieldErrors,
  titleInput,
  draft,
  isHeld,
  edit,
  isTooLong,
  nearLimit,
  changeUniverse,
  chosenUniverse,
  universes,
}: {
  titleId: string
  bodyId: string
  universeFieldId: string
  bodyCountId: string
  fieldErrors: Record<string, string>
  titleInput: RefObject<HTMLInputElement | null>
  draft: Fields
  isHeld: boolean
  edit: (change: Partial<Fields>) => void
  isTooLong: boolean
  nearLimit: boolean
  changeUniverse: (next: string | null) => Promise<void>
  chosenUniverse: { id: string; name: string } | null
  universes: UniverseSummary[] | null
}) {
  const { t } = useI18n()
  return (
    <>
      <Field
        id={titleId}
        label={t('ideas.editor.fields.title')}
        error={
          fieldErrors.title ? (
            <span data-testid="idea-title-error">{fieldErrors.title}</span>
          ) : undefined
        }
      >
        {(control) => (
          <input
            {...control}
            ref={titleInput}
            className="field__input field__input--title"
            type="text"
            dir="auto"
            value={draft.title}
            maxLength={IDEA_TITLE_MAX_LENGTH}
            placeholder={t('ideas.editor.fields.titlePlaceholder')}
            readOnly={isHeld}
            onChange={(event) => edit({ title: event.target.value })}
            aria-required="true"
            data-testid="idea-title"
          />
        )}
      </Field>

      <Field
        id={bodyId}
        label={t('ideas.editor.fields.body')}
        hint={t('ideas.editor.fields.bodyHint')}
        error={fieldErrors.body}
      >
        {(control) => (
          <>
            <textarea
              {...control}
              className="field__input field__input--area idea__body"
              rows={10}
              value={draft.body}
              placeholder={t('ideas.editor.fields.bodyPlaceholder')}
              readOnly={isHeld}
              spellCheck
              onChange={(event) => edit({ body: event.target.value })}
              aria-invalid={isTooLong || fieldErrors.body ? true : undefined}
              aria-describedby={[control['aria-describedby'], nearLimit ? bodyCountId : null]
                .filter(Boolean)
                .join(' ')}
              data-testid="idea-body"
            />
            {nearLimit ? (
              <p
                className={isTooLong ? 'field__error' : 'field__hint idea__count'}
                id={bodyCountId}
                data-testid="idea-body-count"
              >
                {t(
                  isTooLong ? 'ideas.editor.fields.bodyTooLong' : 'ideas.editor.fields.bodyCount',
                  {
                    used: count(draft.body.length),
                    max: count(IDEA_BODY_MAX_LENGTH),
                  },
                )}
              </p>
            ) : null}
          </>
        )}
      </Field>

      <Field
        id={universeFieldId}
        label={t('ideas.editor.fields.universe')}
        hint={t('ideas.editor.fields.universeHint')}
        error={fieldErrors.universeid}
      >
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select idea__universe"
            value={draft.universeId ?? ''}
            disabled={isHeld}
            onChange={(event) =>
              changeUniverse(event.target.value === '' ? null : event.target.value)
            }
            data-testid="idea-universe"
          >
            {chosenUniverse && !universes?.some((universe) => universe.id === chosenUniverse.id) ? (
              <option value={chosenUniverse.id}>{chosenUniverse.name}</option>
            ) : null}
            {(universes ?? []).map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.isArchived
                  ? t('ideas.editor.fields.archivedUniverse', { name: universe.name })
                  : universe.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}
