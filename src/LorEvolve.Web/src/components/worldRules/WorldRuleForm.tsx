import { SaveAction } from '../SaveAction'
import { Field } from '../Field'
import { WorldRuleCheckSection } from '../WorldRuleCheckSection'
import {
  WORLD_RULE_DESCRIPTION_MAX_LENGTH,
  WORLD_RULE_TITLE_MAX_LENGTH,
} from '../../worldRules/types'
import { t } from '../../i18n'
import type { RefObject } from 'react'
import type { Fields, Stored } from '../../worldRules/ruleDraft'
import type { worldRuleActions } from '../../worldRules/worldRuleActions'

/** The world rule's form: the title, the description with its count, the check, and the save bar. */
export function WorldRuleForm({
  universeId,
  isNew,
  titleId,
  descriptionId,
  statusId,
  stored,
  draft,
  fieldErrors,
  isDirty,
  isTooLong,
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
  stored: Stored
  draft: Fields
  fieldErrors: Record<string, string>
  isDirty: boolean
  isTooLong: boolean
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
        as="textarea"
        label={t('canon.editor.description')}
        hint={t('canon.editor.descriptionHint')}
        id={descriptionId}
        error={fieldErrors.description}
        controlClassName="rule__description"
        rows={8}
        dir="auto"
        value={draft.description}
        placeholder={t('canon.editor.descriptionPlaceholder')}
        spellCheck
        onChange={(event) => edit({ description: event.target.value })}
        aria-invalid={isTooLong || fieldErrors.description ? true : undefined}
        data-testid="world-rule-description"
        count={{
          used: draft.description.length,
          max: WORLD_RULE_DESCRIPTION_MAX_LENGTH,
          show: 'near',
          words: { count: 'canon.editor.count', tooLong: 'canon.editor.countTooLong' },
          // The margin is the hint's; over the limit the count is the plain error, as before.
          className: isTooLong ? undefined : 'rule__count',
          testId: 'world-rule-description-count',
        }}
      />

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
        <div className="actions rule__actions">
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
