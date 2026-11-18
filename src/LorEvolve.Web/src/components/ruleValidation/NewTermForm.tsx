import { Field } from '../Field'
import { t } from '../../i18n'
import {
  TERM_KIND_LABELS,
  TERM_KIND_ORDER,
  TERM_KIND_WORDS,
  TERM_NAME_MAX_LENGTH,
  ValidationTermKind,
  type ValidationTermKindValue,
} from '../../ruleValidation/types'
import type { useTermManagerState } from '../../ruleValidation/useTermManagerState'
import type { termManagerActions } from '../../ruleValidation/termManagerActions'

/** The new term's kind, its name and Add. */
export function NewTermForm({
  headingId,
  newKind,
  setNewKind,
  newName,
  setNewName,
  newError,
  setNewError,
  add,
}: Pick<
  ReturnType<typeof useTermManagerState>,
  'newKind' | 'setNewKind' | 'newName' | 'setNewName' | 'newError' | 'setNewError'
> &
  Pick<ReturnType<typeof termManagerActions>, 'add'> & {
    headingId: string
  }) {
  return (
    <div className="types__new terms__new">
      <Field label={t('canon.terms.newKind')} id={`${headingId}-new-kind`}>
        {(control) => (
          <select
            id={control.id}
            className="field__input field__input--select"
            value={newKind}
            onChange={(event) => setNewKind(Number(event.target.value) as ValidationTermKindValue)}
            data-testid="new-term-kind"
          >
            {TERM_KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {TERM_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label={t('canon.terms.newName')}
        id={`${headingId}-new-name`}
        error={newError ? <span role="alert">{newError}</span> : undefined}
      >
        {(control) => (
          <input
            id={control.id}
            className="field__input"
            type="text"
            dir="auto"
            maxLength={TERM_NAME_MAX_LENGTH}
            placeholder={
              newKind === ValidationTermKind.EventKind
                ? t('canon.terms.placeholderEventKind')
                : t('canon.terms.placeholderMethod')
            }
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value)
              setNewError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void add()
              }
            }}
            aria-invalid={control['aria-invalid']}
            aria-describedby={control['aria-describedby']}
            data-testid="new-term-name"
          />
        )}
      </Field>
      <button className="button" type="button" onClick={() => void add()} data-testid="add-term">
        {t('canon.terms.add', { word: TERM_KIND_WORDS[newKind] })}
      </button>
    </div>
  )
}
