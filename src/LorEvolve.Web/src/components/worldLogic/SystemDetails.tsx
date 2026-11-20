import { Field } from '../Field'
import { t } from '../../i18n'
import { SYSTEM_NAME_MAX_LENGTH, SYSTEM_SUMMARY_MAX_LENGTH } from '../../worldLogic/types'
import type { useSystemEditorState } from '../../worldLogic/useSystemEditorState'
import type { systemEditorActions } from '../../worldLogic/systemEditorActions'
import { ConflictBar } from '../ConflictBar'
import { FormActions } from '../FormActions'
import { FormMessage } from '../FormMessage'

type State = ReturnType<typeof useSystemEditorState>
type Actions = ReturnType<typeof systemEditorActions>

/** A System's details: the conflict banner, the error line, and the name and summary form with Save and Delete. */
export function SystemDetails({
  conflict,
  saving,
  failure,
  nameId,
  summaryId,
  fieldErrors,
  name,
  setName,
  summary,
  setSummary,
  reread,
  save,
  remove,
  isNew,
}: Pick<
  State,
  | 'conflict'
  | 'saving'
  | 'failure'
  | 'nameId'
  | 'summaryId'
  | 'fieldErrors'
  | 'name'
  | 'setName'
  | 'summary'
  | 'setSummary'
> &
  Actions & { isNew: boolean }) {
  return (
    <>
      {conflict ? (
        <ConflictBar
          text={t('canon.worldLogic.systems.editor.conflict')}
          onLoadSaved={() => void reread()}
          loadLabel={t('canon.worldLogic.systems.editor.loadSaved')}
          testId="system-editor"
        />
      ) : null}

      {failure ? <FormMessage testId="system-editor-error">{failure}</FormMessage> : null}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field
          label={t('canon.worldLogic.systems.editor.name')}
          id={nameId}
          error={
            fieldErrors.name ? (
              <span data-testid="system-editor-name-error">{fieldErrors.name}</span>
            ) : undefined
          }
        >
          {(control) => (
            <input
              id={control.id}
              className="field__input field__input--title"
              type="text"
              dir="auto"
              value={name}
              maxLength={SYSTEM_NAME_MAX_LENGTH}
              placeholder={t('canon.worldLogic.systems.editor.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              aria-required="true"
              data-testid="system-editor-name"
            />
          )}
        </Field>

        <Field
          label={t('canon.worldLogic.systems.editor.summary')}
          id={summaryId}
          error={fieldErrors.summary}
        >
          {(control) => (
            <textarea
              id={control.id}
              className="field__input field__input--area"
              rows={8}
              dir="auto"
              value={summary}
              maxLength={SYSTEM_SUMMARY_MAX_LENGTH}
              placeholder={t('canon.worldLogic.systems.editor.summaryPlaceholder')}
              onChange={(event) => setSummary(event.target.value)}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              data-testid="system-editor-summary"
            />
          )}
        </Field>

        <FormActions
          submitLabel={
            isNew
              ? t('canon.worldLogic.systems.editor.create')
              : t('canon.worldLogic.systems.editor.save')
          }
          busy={saving}
          busyLabel={t('canon.worldLogic.systems.editor.saving')}
          submitTestId="system-editor-save"
          onDelete={!isNew ? () => void remove() : undefined}
          deleteLabel={t('canon.worldLogic.systems.editor.delete.open')}
          deleteTestId="system-editor-delete"
          inline
        />
      </form>
    </>
  )
}
