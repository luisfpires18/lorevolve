import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useLeaveGuard } from '../lib/leaveGuard'
import { WorldRuleValidationKind } from '../ruleValidation/types'
import { WORLD_RULE_DESCRIPTION_MAX_LENGTH, type WorldRuleDetail } from '../worldRules/types'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'
import { useWorldRuleState } from '../worldRules/useWorldRuleState'
import { useWorldRuleReads } from '../worldRules/useWorldRuleReads'
import { worldRuleActions } from '../worldRules/worldRuleActions'
import { useSaveShortcut } from '../lib/useSaveShortcut'
import { sameFields } from '../worldRules/ruleDraft'
import { WorldRuleHead } from './worldRules/WorldRuleHead'
import { ConflictBar } from './ConflictBar'
import { WorldRuleForm } from './worldRules/WorldRuleForm'
import { LoadError } from './LoadError'
import { Announce } from './Announce'
import { LoadingNote } from './LoadingNote'
import { FormMessage } from './FormMessage'

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
  const { tx } = useI18n()
  const headingId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const statusId = useId()

  const isNew = ruleId === null

  const state = useWorldRuleState({ isNew, announceOnOpen })
  const {
    load,
    stored,
    draft,
    isSaving,
    saves,
    failure,
    fieldErrors,
    conflict,
    announcement,
    titleInput,
  } = state
  useWorldRuleReads({ ...state, universeId, ruleId })

  const isReady = load.kind === 'ready'
  const isDirty =
    isReady &&
    (isNew
      ? draft.title !== '' ||
        draft.description !== '' ||
        draft.check.kind !== WorldRuleValidationKind.None
      : !sameFields(draft, stored))
  const isTooLong = draft.description.length > WORLD_RULE_DESCRIPTION_MAX_LENGTH

  const name = draft.title.trim() || stored.title || t('canon.editor.thisRule')
  useLeaveGuard(isDirty ? t('canon.editor.unsaved', { name }) : null)

  const { edit, editCheck, save, reread, loadSavedVersion, remove } = worldRuleActions({
    ...state,
    universeId,
    ruleId,
    onCreated,
    onDeleted,
    tx,
    isDirty,
    isTooLong,
  })
  // Ctrl+S and Cmd+S save the rule.
  useSaveShortcut(() => void save(stored.updatedAt))

  if (load.kind === 'loading') {
    return <LoadingNote testId="world-rule-loading">{t('canon.editor.opening')}</LoadingNote>
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="world-rule-missing"
        title={t('canon.editor.missing.title')}
        hint={tx('canon.editor.missing.hint', {
          trash: <Link to={trashPath}>{t('canon.editor.missing.openTrash')}</Link>,
          rules: <Link to={listPath}>{t('canon.editor.missing.rules')}</Link>,
        })}
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <LoadError
        message={load.message}
        onRetry={reread}
        retryLabel={t('canon.editor.retry')}
        testId="world-rule-load-error"
      />
    )
  }

  return (
    <article className="rule" aria-labelledby={headingId} data-testid="world-rule-editor">
      <WorldRuleHead
        listPath={listPath}
        headingId={headingId}
        isNew={isNew}
        stored={stored}
        isSaving={isSaving}
        remove={remove}
      />

      {conflict ? (
        <ConflictBar
          text={t('canon.editor.conflict')}
          onKeepMine={() => void save(conflict.updatedAt)}
          keepLabel={t('canon.editor.keepMine')}
          onLoadSaved={() => void loadSavedVersion()}
          loadLabel={t('canon.editor.loadSaved')}
          busy={isSaving}
          testId="world-rule"
        />
      ) : null}

      {failure ? (
        <FormMessage className="rule__failure" testId="world-rule-error">
          {failure}
        </FormMessage>
      ) : null}

      <WorldRuleForm
        universeId={universeId}
        isNew={isNew}
        titleId={titleId}
        descriptionId={descriptionId}
        statusId={statusId}
        stored={stored}
        draft={draft}
        fieldErrors={fieldErrors}
        isDirty={isDirty}
        isTooLong={isTooLong}
        isSaving={isSaving}
        saves={saves}
        titleInput={titleInput}
        edit={edit}
        editCheck={editCheck}
        save={save}
      />

      <Announce testId="world-rule-announcer">{announcement}</Announce>
    </article>
  )
}
