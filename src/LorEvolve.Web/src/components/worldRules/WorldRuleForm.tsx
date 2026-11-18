import { SaveAction } from '../SaveAction'
import { Field } from '../Field'
import { WorldRuleCheckSection } from '../WorldRuleCheckSection'
import {
  WORLD_RULE_DESCRIPTION_MAX_LENGTH,
  WORLD_RULE_TITLE_MAX_LENGTH,
} from '../../worldRules/types'
import { t } from '../../i18n'
import type { RefObject } from 'react'
import { count, type Fields, type Stored } from '../../worldRules/ruleDraft'
import type { worldRuleActions } from '../../worldRules/worldRuleActions'

/** The world rule's form: the title, the description with its count, the check, and the save bar. */
export function WorldRuleForm({
  universeId,
  isNew,
  titleId,
  descriptionId,
  statusId,
  countId,
  stored,
  draft,
  fieldErrors,
  isDirty,
  isTooLong,
  nearLimit,
  isSaving,
  saves,
  titleInput,
  edit,
  editCheck,
  save,
}: Pick<ReturnType<typeof worldRuleActions>, 'edit' | 'editCheck' | 'save'> & {
  universeId: string
  isNew: boolean
  titleId: string
  descriptionId: string
  statusId: string
  countId: string
  stored: Stored
  draft: Fields
  fieldErrors: Record<string, string>
  isDirty: boolean
  isTooLong: boolean
  nearLimit: boolean
  isSaving: boolean
  saves: number
  titleInput: RefObject<HTMLInputElement | null>
}) {
  return (
    <form
      className="rule__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save(stored.updatedAt)
      }}
    >
      <Field
        label={t('canon.editor.title')}
        id={titleId}
        error={
          fieldErrors.title ? (
            <span data-testid="world-rule-title-error">{fieldErrors.title}</span>
          ) : undefined
        }
      >
        {(control) => (
          <input
            id={control.id}
            ref={titleInput}
            className="field__input field__input--title"
            type="text"
            dir="auto"
            value={draft.title}
            maxLength={WORLD_RULE_TITLE_MAX_LENGTH}
            placeholder={t('canon.editor.titlePlaceholder')}
            onChange={(event) => edit({ title: event.target.value })}
            aria-invalid={control['aria-invalid']}
            aria-describedby={control['aria-describedby']}
            aria-required="true"
            data-testid="world-rule-title"
          />
        )}
      </Field>

      <Field
        label={t('canon.editor.description')}
        hint={t('canon.editor.descriptionHint')}
        id={descriptionId}
        error={fieldErrors.description}
      >
        {(control) => (
          <>
            <textarea
              id={control.id}
              className="field__input field__input--area rule__description"
              rows={8}
              dir="auto"
              value={draft.description}
              placeholder={t('canon.editor.descriptionPlaceholder')}
              spellCheck
              onChange={(event) => edit({ description: event.target.value })}
              aria-invalid={isTooLong || fieldErrors.description ? true : undefined}
              aria-describedby={
                [control['aria-describedby'], nearLimit ? countId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              data-testid="world-rule-description"
            />
            {nearLimit ? (
              <p
                className={isTooLong ? 'field__error' : 'field__hint rule__count'}
                id={countId}
                data-testid="world-rule-description-count"
              >
                {t(isTooLong ? 'canon.editor.countTooLong' : 'canon.editor.count', {
                  used: count(draft.description.length),
                  max: count(WORLD_RULE_DESCRIPTION_MAX_LENGTH),
                })}
              </p>
            ) : null}
          </>
        )}
      </Field>

      <WorldRuleCheckSection
        universeId={universeId}
        value={draft.check}
        onChange={editCheck}
        stored={stored.validation}
        found={stored.found}
        isDirty={isDirty}
        errors={fieldErrors}
      />

      <div className="manuscript__bar rule__bar">
        <div className="rule__actions">
          <SaveAction
            label={isNew ? t('canon.editor.create') : t('canon.editor.save')}
            isDirty={isDirty}
            isSaving={isSaving}
            isBlocked={isTooLong}
            saves={saves}
            restingStatus={
              stored.updatedAt === null ? t('canon.editor.notSaved') : t('canon.editor.saved')
            }
            statusId={statusId}
            statusTestId="world-rule-status"
            testId="world-rule-save"
            keyShortcuts="Control+S Meta+S"
          />
        </div>
      </div>
    </form>
  )
}
