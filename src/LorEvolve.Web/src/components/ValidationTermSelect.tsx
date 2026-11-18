import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { createValidationTerm } from '../ruleValidation/api'
import { Field } from './Field'
import {
  TERM_KIND_WORDS,
  TERM_NAME_MAX_LENGTH,
  type ValidationTerm,
  type ValidationTermKindValue,
} from '../ruleValidation/types'
import { FormActions } from './FormActions'
import { NewButton } from './NewButton'

interface ValidationTermSelectProps {
  universeId: string
  kind: ValidationTermKindValue
  label: string
  hint?: string
  /** The universe's terms, or null while they are being read. */
  terms: ValidationTerm[] | null
  /** The chosen term's id, or `''` for none. */
  value: string
  /** The chosen term's name as last saved, shown if the list does not hold it. */
  selectedName?: string | null
  /** What choosing nothing reads as. */
  emptyLabel: string
  onChange: (termId: string) => void
  onCreated: (term: ValidationTerm) => void
  error?: string
  testId: string
}

/**
 * Chooses one event kind or one method of the universe by id - never by typing a name that is then matched - and adds a new one
 * in place without leaving the form. The new term is chosen as soon as it exists, and the focus goes back to the list.
 */
export function ValidationTermSelect({
  universeId,
  kind,
  label,
  hint,
  terms,
  value,
  selectedName = null,
  emptyLabel,
  onChange,
  onCreated,
  error,
  testId,
}: ValidationTermSelectProps) {
  const { t } = useI18n()
  const selectId = useId()
  const nameId = useId()

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const select = useRef<HTMLSelectElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'name' | 'select' | 'new' | null>(null)

  const word = TERM_KIND_WORDS[kind]
  const options = (terms ?? []).filter((term) => term.kind === kind)
  const missing = value !== '' && !options.some((term) => term.id === value)

  // Focus moves once the element it belongs to has rendered.
  useEffect(() => {
    const target = focusNext.current
    focusNext.current = null
    if (target === 'name') nameInput.current?.focus()
    else if (target === 'select') select.current?.focus()
    else if (target === 'new') newButton.current?.focus()
  })

  function open() {
    setIsAdding(true)
    setNameError(null)
    focusNext.current = 'name'
  }

  function cancel() {
    setIsAdding(false)
    setName('')
    setNameError(null)
    focusNext.current = 'new'
  }

  async function create() {
    if (isCreating) return
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameError(t('canon.termSelect.nameRequired', { word }))
      nameInput.current?.focus()
      return
    }

    setIsCreating(true)
    setNameError(null)
    try {
      const term = await createValidationTerm(universeId, kind, trimmed)
      onCreated(term)
      onChange(term.id)
      setName('')
      setIsAdding(false)
      focusNext.current = 'select'
    } catch (failure: unknown) {
      setNameError(
        failure instanceof ApiError
          ? (failure.fieldErrors.name ?? failure.message)
          : t('canon.termSelect.addFailed', { word }),
      )
      nameInput.current?.focus()
    } finally {
      setIsCreating(false)
    }
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the term rather than submitting the form around it; Escape closes this, not the drawer.
    if (event.key === 'Enter') {
      event.preventDefault()
      void create()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }

  return (
    <Field label={label} hint={hint} error={error} id={selectId} className="termselect">
      {(control) => (
        <>
          <div className="termselect__row">
            <select
              id={selectId}
              ref={select}
              className="field__input field__input--select termselect__select"
              value={value}
              disabled={terms === null && !missing}
              onChange={(event) => onChange(event.target.value)}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              data-testid={testId}
            >
              <option value="">
                {terms === null ? t('canon.termSelect.reading') : emptyLabel}
              </option>
              {missing ? (
                <option value={value}>{selectedName ?? t('canon.termSelect.chosen')}</option>
              ) : null}
              {options.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
            {!isAdding ? (
              <NewButton
                tone="secondary"
                ref={newButton}
                onClick={open}
                data-testid={`${testId}-new`}
              >
                {t('canon.termSelect.new', { word })}
              </NewButton>
            ) : null}
          </div>

          {isAdding ? (
            <Field
              label={t('canon.termSelect.nameOf', { word })}
              id={nameId}
              className="termselect__new"
              data-testid={`${testId}-adding`}
              error={nameError ? <span role="alert">{nameError}</span> : undefined}
            >
              {(nameControl) => (
                <>
                  <div className="termselect__row">
                    <input
                      id={nameControl.id}
                      ref={nameInput}
                      className="field__input termselect__name"
                      type="text"
                      dir="auto"
                      autoComplete="off"
                      maxLength={TERM_NAME_MAX_LENGTH}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={onNameKeyDown}
                      aria-invalid={nameControl['aria-invalid']}
                      aria-describedby={nameControl['aria-describedby']}
                      data-testid={`${testId}-name`}
                    />
                    <FormActions
                      submitLabel={t('canon.termSelect.add', { word })}
                      busy={isCreating}
                      busyLabel={t('canon.termSelect.adding')}
                      onSubmit={() => void create()}
                      submitTestId={`${testId}-add`}
                      onCancel={cancel}
                    />
                  </div>
                </>
              )}
            </Field>
          ) : null}
        </>
      )}
    </Field>
  )
}
