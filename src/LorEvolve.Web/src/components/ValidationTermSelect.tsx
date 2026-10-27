import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '../lib/api'
import { createValidationTerm } from '../ruleValidation/api'
import {
  TERM_KIND_WORDS,
  TERM_NAME_MAX_LENGTH,
  type ValidationTerm,
  type ValidationTermKindValue,
} from '../ruleValidation/types'

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
  const selectId = useId()
  const hintId = useId()
  const errorId = useId()
  const nameId = useId()
  const nameErrorId = useId()

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
      setNameError(`Give the ${word} a name.`)
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
          : `The ${word} could not be added. Try again.`,
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

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="field termselect">
      <label className="field__label" htmlFor={selectId}>
        {label}
      </label>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      <div className="termselect__row">
        <select
          id={selectId}
          ref={select}
          className="field__input field__input--select termselect__select"
          value={value}
          disabled={terms === null && !missing}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          data-testid={testId}
        >
          <option value="">{terms === null ? 'Reading…' : emptyLabel}</option>
          {missing ? <option value={value}>{selectedName ?? 'The chosen one'}</option> : null}
          {options.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        {!isAdding ? (
          <button
            ref={newButton}
            className="button button--secondary"
            type="button"
            onClick={open}
            data-testid={`${testId}-new`}
          >
            New {word}
          </button>
        ) : null}
      </div>

      {isAdding ? (
        <div className="termselect__new" data-testid={`${testId}-adding`}>
          <label className="field__label" htmlFor={nameId}>
            Name of the new {word}
          </label>
          <div className="termselect__row">
            <input
              id={nameId}
              ref={nameInput}
              className="field__input termselect__name"
              type="text"
              dir="auto"
              autoComplete="off"
              maxLength={TERM_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={onNameKeyDown}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              data-testid={`${testId}-name`}
            />
            <button
              className="button"
              type="button"
              disabled={isCreating}
              onClick={() => void create()}
              data-testid={`${testId}-add`}
            >
              {isCreating ? 'Adding…' : `Add ${word}`}
            </button>
            <button className="button button--secondary" type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
          {nameError ? (
            <p className="field__error" id={nameErrorId} role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
