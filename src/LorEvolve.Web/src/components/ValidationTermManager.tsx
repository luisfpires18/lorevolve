import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Quoted } from './NameList'
import { ApiError } from '../lib/api'
import {
  createValidationTerm,
  deleteValidationTerm,
  listValidationTerms,
  renameValidationTerm,
} from '../ruleValidation/api'
import {
  TERM_KIND_LABELS,
  TERM_KIND_ORDER,
  TERM_KIND_PLURALS,
  TERM_KIND_WORDS,
  TERM_NAME_MAX_LENGTH,
  ValidationTermKind,
  type ValidationTerm,
  type ValidationTermKindValue,
} from '../ruleValidation/types'
import { confirmAction } from '../lib/confirm'

function usage(term: ValidationTerm) {
  if (term.ruleCount === 0 && term.momentCount === 0) return 'Not used'
  const parts = [
    term.ruleCount > 0 ? `${term.ruleCount} ${term.ruleCount === 1 ? 'rule' : 'rules'}` : null,
    term.momentCount > 0
      ? `${term.momentCount} ${term.momentCount === 1 ? 'moment' : 'moments'}`
      : null,
  ].filter(Boolean)
  return `Used by ${parts.join(' and ')}`
}

/**
 * The universe's event kinds and methods on the Types screen (ADR 0034): renamed here, deleted here once nothing names them, and
 * added here or straight from a rule or a moment. Not a workspace of its own - a vocabulary for checks, next to the others.
 */
export function ValidationTermManager({ universeId }: { universeId: string }) {
  const access = useUniverseAccess()
  const headingId = useId()
  const newNameErrorId = useId()

  const [terms, setTerms] = useState<ValidationTerm[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{
    id: string
    text: string
    error: string | null
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<ValidationTermKindValue>(ValidationTermKind.EventKind)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listValidationTerms(universeId, controller.signal)
      .then(setTerms)
      .catch(() => {
        if (!controller.signal.aborted) setMessage('The event kinds and methods could not be read.')
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

  async function refresh() {
    setTerms(await listValidationTerms(universeId))
  }

  async function saveRename() {
    if (!renaming || busyId) return
    const text = renaming.text.trim()
    setBusyId(renaming.id)
    try {
      await renameValidationTerm(universeId, renaming.id, text)
      setRenaming(null)
      await refresh()
    } catch (error: unknown) {
      setRenaming(
        (current) =>
          current && {
            ...current,
            error:
              error instanceof ApiError
                ? (error.fieldErrors.name ?? error.message)
                : 'That name could not be saved.',
          },
      )
    } finally {
      setBusyId(null)
    }
  }

  async function remove(term: ValidationTerm) {
    setMessage(null)
    const deleted = await confirmAction({
      title: (
        <>
          Delete the {TERM_KIND_WORDS[term.kind]} “<bdi>{term.name}</bdi>”?
        </>
      ),
      message: 'Nothing names it.',
      confirmLabel: 'Delete',
      busyLabel: 'Deleting…',
      variant: 'destructive',
      failure: 'That could not be deleted.',
      action: async () => {
        try {
          await deleteValidationTerm(universeId, term.id)
        } catch (error: unknown) {
          await refresh().catch(() => undefined)
          throw error
        }
      },
    })
    if (deleted) await refresh()
  }

  async function add() {
    const name = newName.trim()
    if (name === '') {
      setNewError(`Give the ${TERM_KIND_WORDS[newKind]} a name.`)
      return
    }
    setNewError(null)
    try {
      await createValidationTerm(universeId, newKind, name)
      setNewName('')
      await refresh()
    } catch (error: unknown) {
      setNewError(
        error instanceof ApiError
          ? (error.fieldErrors.name ?? error.message)
          : 'That could not be added.',
      )
    }
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setRenaming(null)
    }
  }

  return (
    <section className="reltypes terms" aria-labelledby={headingId} data-testid="validation-terms">
      <div className="relations__head">
        <h2 className="settings__heading" id={headingId}>
          Event kinds and methods
        </h2>
      </div>

      <p className="settings__note">
        What World Rule checks and moments point at. Two moments share a method only when they name
        the same one here, never because their words match. Renaming one changes no match.
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="terms-error">
          {message}
        </p>
      ) : null}

      {terms === null && !message ? (
        <p className="notice" role="status">
          Reading the event kinds and methods…
        </p>
      ) : null}

      {terms
        ? TERM_KIND_ORDER.map((kind) => {
            const group = terms.filter((term) => term.kind === kind)
            const groupId = `${headingId}-${kind}`

            return (
              <div className="terms__group" key={kind}>
                <h3 className="terms__kind" id={groupId}>
                  {TERM_KIND_PLURALS[kind]}
                </h3>
                {group.length === 0 ? (
                  <p className="relations__quiet">None yet.</p>
                ) : (
                  <ul className="types__list" aria-labelledby={groupId}>
                    {group.map((term) =>
                      renaming?.id === term.id ? (
                        <li className="types__row" key={term.id}>
                          <div className="terms__rename">
                            <label className="field__label" htmlFor={`${groupId}-rename`}>
                              Rename <Quoted text={term.name} />
                            </label>
                            <div className="termselect__row">
                              <input
                                id={`${groupId}-rename`}
                                className="field__input termselect__name"
                                type="text"
                                dir="auto"
                                autoFocus
                                maxLength={TERM_NAME_MAX_LENGTH}
                                value={renaming.text}
                                onChange={(event) =>
                                  setRenaming({
                                    ...renaming,
                                    text: event.target.value,
                                    error: null,
                                  })
                                }
                                onKeyDown={onRenameKeyDown}
                                aria-invalid={renaming.error ? true : undefined}
                                aria-describedby={
                                  renaming.error ? `${groupId}-rename-error` : undefined
                                }
                                data-testid={`rename-term-input-${term.name}`}
                              />
                              <button
                                className="button"
                                type="button"
                                disabled={busyId === term.id}
                                onClick={() => void saveRename()}
                                data-testid={`save-term-${term.name}`}
                              >
                                Save name
                              </button>
                              <button
                                className="button button--secondary button--sm"
                                type="button"
                                onClick={() => setRenaming(null)}
                              >
                                Cancel
                              </button>
                            </div>
                            {renaming.error ? (
                              <p
                                className="field__error"
                                id={`${groupId}-rename-error`}
                                role="alert"
                              >
                                {renaming.error}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ) : (
                        <li className="types__row" key={term.id} data-term-name={term.name}>
                          <div className="types__head">
                            <span className="types__name">
                              <bdi>{term.name}</bdi>
                            </span>
                            <span className="types__count">{usage(term)}</span>
                            {access.editContent ? (
                              <button
                                className="button button--secondary button--sm"
                                type="button"
                                aria-label={`Rename ${term.name}`}
                                onClick={() =>
                                  setRenaming({ id: term.id, text: term.name, error: null })
                                }
                                data-testid={`rename-term-${term.name}`}
                              >
                                Rename
                              </button>
                            ) : null}
                            {access.editContent &&
                            term.ruleCount === 0 &&
                            term.momentCount === 0 ? (
                              <button
                                className="button button--secondary button--sm"
                                type="button"
                                aria-label={`Delete ${term.name}`}
                                disabled={busyId === term.id}
                                onClick={() => void remove(term)}
                                data-testid={`delete-term-${term.name}`}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            )
          })
        : null}

      {access.editContent ? (
        <div className="types__new terms__new">
          <div className="field">
            <label className="field__label" htmlFor={`${headingId}-new-kind`}>
              Event kind or method
            </label>
            <select
              id={`${headingId}-new-kind`}
              className="field__input field__input--select"
              value={newKind}
              onChange={(event) =>
                setNewKind(Number(event.target.value) as ValidationTermKindValue)
              }
              data-testid="new-term-kind"
            >
              {TERM_KIND_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {TERM_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${headingId}-new-name`}>
              Name
            </label>
            <input
              id={`${headingId}-new-name`}
              className="field__input"
              type="text"
              dir="auto"
              maxLength={TERM_NAME_MAX_LENGTH}
              placeholder={
                newKind === ValidationTermKind.EventKind
                  ? 'Coronation, Resurrection…'
                  : 'By the Salt Crown…'
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
              aria-invalid={newError ? true : undefined}
              aria-describedby={newError ? newNameErrorId : undefined}
              data-testid="new-term-name"
            />
            {newError ? (
              <p className="field__error" id={newNameErrorId} role="alert">
                {newError}
              </p>
            ) : null}
          </div>
          <button
            className="button"
            type="button"
            onClick={() => void add()}
            data-testid="add-term"
          >
            Add {TERM_KIND_WORDS[newKind]}
          </button>
        </div>
      ) : null}
    </section>
  )
}
