import { useEffect, useId, useRef, useState } from 'react'
import { SaveAction } from './SaveAction'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { WorldRuleCheckSection } from './WorldRuleCheckSection'
import {
  CHECK_ERROR_KEYS,
  NO_CHECK,
  checkDraftFrom,
  checkInput,
  sameCheck,
  type CheckDraft,
} from '../ruleValidation/checkDraft'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { WorldRuleCheck, WorldRuleValidation } from '../ruleValidation/types'
import { WorldRuleValidationKind } from '../ruleValidation/types'
import {
  createWorldRule,
  deleteWorldRule,
  getWorldRule,
  saveWorldRule,
  WORLD_RULE_CHANGED,
} from '../worldRules/api'
import {
  WORLD_RULE_DESCRIPTION_MAX_LENGTH,
  WORLD_RULE_TITLE_MAX_LENGTH,
  type WorldRuleDetail,
} from '../worldRules/types'
import { EmptyState } from './EmptyState'
import { confirmAction } from '../lib/confirm'

type LoadState =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error'; message: string }

/** What an author edits. */
interface Fields {
  title: string
  description: string
  check: CheckDraft
}

/** The rule as the API last confirmed it: what "unsaved" is measured against, what the next save names, and what its check finds. */
interface Stored extends Fields {
  updatedAt: string | null
  validation: WorldRuleValidation | null
  found: WorldRuleCheck | null
}

const EMPTY_STORED: Stored = {
  title: '',
  description: '',
  check: NO_CHECK,
  updatedAt: null,
  validation: null,
  found: null,
}

const count = new Intl.NumberFormat('en')

function sameFields(a: Fields, b: Fields) {
  return a.title === b.title && a.description === b.description && sameCheck(a.check, b.check)
}

function fieldsOf(stored: Stored): Fields {
  return { title: stored.title, description: stored.description, check: stored.check }
}

function storedFrom(rule: WorldRuleDetail): Stored {
  return {
    title: rule.title,
    description: rule.description,
    check: checkDraftFrom(rule.validation),
    updatedAt: rule.updatedAt,
    validation: rule.validation,
    found: rule.check,
  }
}

/** The stored moment a stale save's refusal reports, when it carries one. */
function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

interface WorldRuleEditorProps {
  universeId: string
  /** The rule being edited, or null for a new one. */
  ruleId: string | null
  /** Where the universe's World Rules list is, for the way back. */
  listPath: string
  /** Where the universe's Trash is, for a rule that is not here. */
  trashPath: string
  /** Said once, to assistive technology, when the editor opens - a rule just created, say. */
  announceOnOpen?: string | null
  onCreated: (rule: WorldRuleDetail) => void
  onDeleted: (rule: { id: string; title: string }) => void
}

/**
 * One world rule: a title, an optional plain-text description, and an optional check against the timeline. The same short form
 * for a new rule and a saved one.
 *
 * A rule's words mean nothing to LorEvolve (ADR 0033): nothing is read out of them. Only a check the author sets part by part is ever
 * counted, and what the saved check finds is shown beside it in words - including that it could not count everything (ADR 0034).
 *
 * Saving is explicit: Save, or Ctrl+S / Cmd+S. A rule is unsaved until the API confirms it, so a failed save changes nothing
 * on screen. A save over a rule saved from another tab or device since this one opened is refused, and the author chooses:
 * keep this version, or load that one. While anything is unsaved, following a link, signing out, the browser's Back and
 * Forward and leaving the page all ask first. It is a short form, so no recovery copy is kept on the device (ADR 0029).
 */
export function WorldRuleEditor({
  universeId,
  ruleId,
  listPath,
  trashPath,
  announceOnOpen = null,
  onCreated,
  onDeleted,
}: WorldRuleEditorProps) {
  const headingId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const statusId = useId()
  const countId = useId()

  const isNew = ruleId === null

  const [load, setLoad] = useState<LoadState>(isNew ? { kind: 'ready' } : { kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>(EMPTY_STORED)
  const [draft, setDraft] = useState<Fields>(fieldsOf(EMPTY_STORED))
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [announcement, setAnnouncement] = useState(announceOnOpen ?? '')
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const shortcut = useRef<() => void>(() => {})

  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()

    getWorldRule(universeId, ruleId, controller.signal)
      .then((rule) => {
        const next = storedFrom(rule)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: 'This rule could not be opened.' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [isNew, universeId, ruleId, reads])

  // A new rule starts in its title.
  useEffect(() => {
    if (isNew) titleInput.current?.focus()
  }, [isNew])

  const isReady = load.kind === 'ready'
  const isDirty =
    isReady &&
    (isNew
      ? draft.title !== '' ||
        draft.description !== '' ||
        draft.check.kind !== WorldRuleValidationKind.None
      : !sameFields(draft, stored))
  const isTooLong = draft.description.length > WORLD_RULE_DESCRIPTION_MAX_LENGTH

  const name = draft.title.trim() || stored.title || 'This rule'
  useLeaveGuard(isDirty ? `“${name}” has unsaved changes. Leave without saving them?` : null)

  function edit(change: Partial<Omit<Fields, 'check'>>) {
    setDraft((current) => ({ ...current, ...change }))
    const changed = Object.keys(change)
    if (changed.some((field) => fieldErrors[field])) {
      setFieldErrors((current) => {
        const next = { ...current }
        for (const field of changed) delete next[field]
        return next
      })
    }
  }

  function editCheck(change: Partial<CheckDraft>) {
    setDraft((current) => ({ ...current, check: { ...current.check, ...change } }))
    if (Object.values(CHECK_ERROR_KEYS).some((key) => fieldErrors[key])) {
      setFieldErrors((current) => {
        const next = { ...current }
        for (const key of Object.values(CHECK_ERROR_KEYS)) delete next[key]
        return next
      })
    }
  }

  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong) return

    if (draft.title.trim() === '') {
      setFailure(null)
      setFieldErrors({ title: 'Give the rule a title, so you can find it again.' })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(null)

    const input = {
      title: sent.title.trim(),
      description: sent.description,
      expectedUpdatedAt,
      validation: checkInput(sent.check),
    }

    try {
      if (isNew) {
        onCreated(await createWorldRule(universeId, input))
        return
      }

      const saved = await saveWorldRule(universeId, ruleId, input)
      const next = storedFrom(saved)
      setStored(next)
      // What was sent is now saved - its title trimmed. Anything typed while the save was in flight is still unsaved, and
      // stays.
      setDraft((current) => (sameFields(current, sent) ? fieldsOf(next) : current))
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === WORLD_RULE_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This rule is no longer here, so it could not be saved. It may have been moved to the Trash in another window. Your writing is still here: copy it before you leave.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Something needs a change before this rule can be saved.',
        )
      } else {
        setFailure('The rule could not be saved. Your writing is still here. Try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: 'Replace this rule with the version saved elsewhere?',
        message: 'What you changed here since your last save will be lost.',
        confirmLabel: 'Use the saved version',
        cancelLabel: 'Keep my changes',
        variant: 'destructive',
      }))
    ) {
      return
    }
    reread()
    setAnnouncement('The saved version of the rule is loaded.')
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const trashed = await confirmAction({
      title: (
        <>
          Move “<bdi>{title}</bdi>” to the Trash?
        </>
      ),
      message: isDirty
        ? 'Your unsaved changes will be lost. The rule as last saved goes to the Trash, where you can restore it.'
        : 'You can restore it from the Trash.',
      confirmLabel: 'Move to Trash',
      busyLabel: 'Moving…',
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? 'This rule is no longer here. It may already be in the Trash.'
          : 'The rule could not be moved to the Trash. Try again.',
      action: () => deleteWorldRule(universeId, ruleId),
    })
    if (trashed) onDeleted({ id: ruleId, title })
  }

  if (load.kind === 'loading') {
    return (
      <p className="notice" role="status" data-testid="world-rule-loading">
        Opening the rule…
      </p>
    )
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="world-rule-missing"
        title="This rule is not here."
        hint={
          <>
            It may be in the Trash, or it is not a rule of this universe.{' '}
            <Link to={trashPath}>Open the Trash</Link>, or go back to{' '}
            <Link to={listPath}>World Rules</Link>.
          </>
        }
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="world-rule-load-error">
        <p>{load.message}</p>
        <button className="button button--secondary" type="button" onClick={reread}>
          Try again
        </button>
      </div>
    )
  }

  const nearLimit = draft.description.length > WORLD_RULE_DESCRIPTION_MAX_LENGTH * 0.9
  const titleErrorId = `${titleId}-error`
  const descriptionHintId = `${descriptionId}-hint`
  const descriptionErrorId = `${descriptionId}-error`

  return (
    <article className="rule" aria-labelledby={headingId} data-testid="world-rule-editor">
      <header className="rule__head">
        <Link className="rule__back" to={listPath} data-testid="world-rule-back">
          World Rules
        </Link>
        <div className="doc__titlerow">
          <h1 className="rule__heading" id={headingId} data-testid="world-rule-heading">
            {isNew ? 'New rule' : <bdi>{stored.title}</bdi>}
          </h1>
          {!isNew ? (
            <ActionMenu
              label={`More actions for ${stored.title}`}
              triggerTestId="world-rule-actions"
            >
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={isSaving}
                onClick={() => void remove()}
                data-testid="world-rule-delete"
              >
                <ActionIcon icon={Trash2} />
                Delete rule
              </button>
            </ActionMenu>
          ) : null}
        </div>
        <p className="rule__lede">
          A rule of how this world works, in your own words. LorEvolve never reads them, and saving
          changes nothing else in the universe; only a timeline check you set below is ever counted.
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              Last saved <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>
              .
            </>
          ) : null}
        </p>
      </header>

      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="world-rule-conflict">
          <p className="manuscript__conflicttext">
            This rule was saved in another tab or on another device after you opened it here.
            Nothing was overwritten, and your version below is not saved.
          </p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={() => void save(conflict.updatedAt)}
              data-testid="world-rule-keep-mine"
            >
              Save mine over it
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={loadSavedVersion}
              data-testid="world-rule-load-saved"
            >
              Load the saved version
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message rule__failure" role="alert" data-testid="world-rule-error">
          {failure}
        </p>
      ) : null}

      <form
        className="rule__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save(stored.updatedAt)
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={titleId}>
            Title
          </label>
          <input
            id={titleId}
            ref={titleInput}
            className="field__input field__input--title"
            type="text"
            dir="auto"
            value={draft.title}
            maxLength={WORLD_RULE_TITLE_MAX_LENGTH}
            placeholder="Teleportation cannot cross the Veil"
            onChange={(event) => edit({ title: event.target.value })}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? titleErrorId : undefined}
            aria-required="true"
            data-testid="world-rule-title"
          />
          {fieldErrors.title ? (
            <p className="field__error" id={titleErrorId} data-testid="world-rule-title-error">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={descriptionId}>
            Description
          </label>
          <p className="field__hint" id={descriptionHintId}>
            Optional. Plain text, kept exactly as you write it.
          </p>
          <textarea
            id={descriptionId}
            className="field__input field__input--area rule__description"
            rows={8}
            dir="auto"
            value={draft.description}
            placeholder="What the rule says, where it holds, and what it does not cover."
            spellCheck
            onChange={(event) => edit({ description: event.target.value })}
            aria-invalid={isTooLong || fieldErrors.description ? true : undefined}
            aria-describedby={[
              descriptionHintId,
              nearLimit ? countId : null,
              fieldErrors.description ? descriptionErrorId : null,
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="world-rule-description"
          />
          {nearLimit ? (
            <p
              className={isTooLong ? 'field__error' : 'field__hint rule__count'}
              id={countId}
              data-testid="world-rule-description-count"
            >
              {isTooLong ? 'Too long to save: ' : null}
              {count.format(draft.description.length)} of{' '}
              {count.format(WORLD_RULE_DESCRIPTION_MAX_LENGTH)} characters.
            </p>
          ) : null}
          {fieldErrors.description ? (
            <p className="field__error" id={descriptionErrorId}>
              {fieldErrors.description}
            </p>
          ) : null}
        </div>

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
              label={isNew ? 'Create rule' : 'Save changes'}
              isDirty={isDirty}
              isSaving={isSaving}
              isBlocked={isTooLong}
              saves={saves}
              restingStatus={stored.updatedAt === null ? 'Not saved yet' : 'Saved'}
              statusId={statusId}
              statusTestId="world-rule-status"
              testId="world-rule-save"
              keyShortcuts="Control+S Meta+S"
            />
          </div>
        </div>
      </form>

      <p className="visually-hidden" role="status" data-testid="world-rule-announcer">
        {announcement}
      </p>
    </article>
  )
}
