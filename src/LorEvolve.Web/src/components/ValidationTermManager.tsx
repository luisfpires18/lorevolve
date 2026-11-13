import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Quoted } from './NameList'
import { t, tn, useI18n } from '../i18n'
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
  if (term.ruleCount === 0 && term.momentCount === 0) return t('canon.terms.notUsed')
  const rules = tn('canon.terms.rules', term.ruleCount, { n: term.ruleCount })
  const moments = tn('canon.terms.moments', term.momentCount, { n: term.momentCount })
  if (term.momentCount === 0) return t('canon.terms.usedByRules', { rules })
  if (term.ruleCount === 0) return t('canon.terms.usedByMoments', { moments })
  return t('canon.terms.usedByBoth', { rules, moments })
}

/**
 * The universe's event kinds and methods on the Types screen (ADR 0034): renamed here, deleted here once nothing names them, and
 * added here or straight from a rule or a moment. Not a workspace of its own - a vocabulary for checks, next to the others.
 */
export function ValidationTermManager({ universeId }: { universeId: string }) {
  const { tx } = useI18n()
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
        if (!controller.signal.aborted) setMessage(t('canon.terms.readFailed'))
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
                : t('canon.terms.renameFailed'),
          },
      )
    } finally {
      setBusyId(null)
    }
  }

  async function remove(term: ValidationTerm) {
    setMessage(null)
    const deleted = await confirmAction({
      title: tx('canon.terms.delete.title', {
        word: TERM_KIND_WORDS[term.kind],
        name: <bdi>{term.name}</bdi>,
      }),
      message: t('canon.terms.delete.message'),
      confirmLabel: t('canon.terms.delete.confirm'),
      busyLabel: t('canon.terms.delete.busy'),
      variant: 'destructive',
      failure: t('canon.terms.delete.failed'),
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
      setNewError(t('canon.terms.nameRequired', { word: TERM_KIND_WORDS[newKind] }))
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
          : t('canon.terms.addFailed'),
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
          {t('canon.terms.heading')}
        </h2>
      </div>

      <p className="settings__note">{t('canon.terms.note')}</p>

      {message ? (
        <p className="form__message" role="alert" data-testid="terms-error">
          {message}
        </p>
      ) : null}

      {terms === null && !message ? (
        <p className="notice" role="status">
          {t('canon.terms.reading')}
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
                  <p className="relations__quiet">{t('canon.terms.none')}</p>
                ) : (
                  <ul className="types__list" aria-labelledby={groupId}>
                    {group.map((term) =>
                      renaming?.id === term.id ? (
                        <li className="types__row" key={term.id}>
                          <div className="terms__rename">
                            <label className="field__label" htmlFor={`${groupId}-rename`}>
                              {tx('canon.terms.renameLabel', { name: <Quoted text={term.name} /> })}
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
                                {t('canon.terms.saveName')}
                              </button>
                              <button
                                className="button button--secondary button--sm"
                                type="button"
                                onClick={() => setRenaming(null)}
                              >
                                {t('canon.terms.cancel')}
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
                                aria-label={t('canon.terms.renameAria', { name: term.name })}
                                onClick={() =>
                                  setRenaming({ id: term.id, text: term.name, error: null })
                                }
                                data-testid={`rename-term-${term.name}`}
                              >
                                {t('canon.terms.rename')}
                              </button>
                            ) : null}
                            {access.editContent &&
                            term.ruleCount === 0 &&
                            term.momentCount === 0 ? (
                              <button
                                className="button button--secondary button--sm"
                                type="button"
                                aria-label={t('canon.terms.deleteAria', { name: term.name })}
                                disabled={busyId === term.id}
                                onClick={() => void remove(term)}
                                data-testid={`delete-term-${term.name}`}
                              >
                                {t('canon.terms.deleteButton')}
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
              {t('canon.terms.newKind')}
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
              {t('canon.terms.newName')}
            </label>
            <input
              id={`${headingId}-new-name`}
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
            {t('canon.terms.add', { word: TERM_KIND_WORDS[newKind] })}
          </button>
        </div>
      ) : null}
    </section>
  )
}
