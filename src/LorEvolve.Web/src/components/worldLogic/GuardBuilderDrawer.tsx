import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { GuardBuilder } from '../GuardBuilder'
import { t } from '../../i18n'
import { sameCondition } from '../../worldLogic/guardSummary'
import type { SystemRuleSummary } from '../../worldLogic/types'
import { m, gb } from '../../worldLogic/machinePanelTypes'
import { textInput } from '../../worldLogic/machineDrawerFields'
import { useGuardDrawerState } from '../../worldLogic/useGuardDrawerState'
import { guardDrawerActions } from '../../worldLogic/guardDrawerActions'
import { useGuardDrawerEffects } from '../../worldLogic/useGuardDrawerEffects'
import { ConflictBar } from '../ConflictBar'
import { FormActions } from '../FormActions'
import { LoadingNote } from '../LoadingNote'
import { FormMessage } from '../FormMessage'

/**
 * The guard builder, opened from a transition (Issue #359): a rule definition's title and its condition, built from
 * blocks. "New guard" creates a rule in the System's scope; "Edit guard" reads the chosen one first. Saving sets it as
 * the transition's guard, which reaches the machine only through the transition's Save and then Save changes.
 *
 * Nothing is sent while a limit or an unfinished part stands, and a save that changes nothing sends nothing. An update
 * sends back the rule's description, exceptions and dependencies exactly as they were read: the builder edits neither.
 */
export function GuardBuilderDrawer({
  universeId,
  projectId,
  ruleId,
  rules,
  onSaved,
  onClose,
}: {
  universeId: string
  projectId: string | null
  ruleId: string | null
  rules: SystemRuleSummary[]
  onSaved: (rule: SystemRuleSummary) => void
  onClose: () => void
}) {
  const state = useGuardDrawerState({ ruleId })
  const {
    dialog,
    titleId,
    conditionId,
    load,
    detail,
    initial,
    title,
    setTitle,
    condition,
    reading,
    problems,
    titleError,
    message,
    conflict,
    saving,
  } = state

  const titleOf = (id: string) => rules.find((rule) => rule.id === id)?.title
  const isDirty = title !== initial.title || !sameCondition(condition, initial.condition)

  const { take, edit, save, keepMine, loadSaved } = guardDrawerActions({
    ...state,
    universeId,
    projectId,
    onSaved,
  })
  useGuardDrawerEffects({ ...state, universeId, ruleId, take })

  return (
    <Drawer
      testId="guard-builder-drawer"
      titleId={titleId}
      title={ruleId ? t(`${gb}.editGuard`) : t(`${gb}.newGuard`)}
      dialogRef={dialog}
      isDirty={isDirty}
      leaveMessage={t(`${gb}.leaveGuard`)}
      onClose={onClose}
      onSubmit={() => void save(detail)}
      noValidate
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={t(`${m}.save`)}
          disabled={load !== 'ready' || saving}
          submitTestId="guard-builder-save"
          onCancel={close}
          cancelTestId="guard-builder-cancel"
        />
      )}
    >
      {conflict ? (
        <ConflictBar
          text={t(`${gb}.conflict`)}
          onKeepMine={() => void keepMine()}
          keepLabel={t(`${m}.keepMine`)}
          onLoadSaved={() => void loadSaved()}
          loadLabel={t(`${m}.loadSaved`)}
          busy={saving}
          size="sm"
          testId="guard"
        />
      ) : null}

      {message ? <FormMessage testId="guard-builder-error">{message}</FormMessage> : null}

      {load === 'loading' ? <LoadingNote>{t(`${gb}.loading`)}</LoadingNote> : null}
      {load === 'error' ? (
        <FormMessage testId="guard-builder-unavailable">{t(`${gb}.loadFailed`)}</FormMessage>
      ) : null}

      {load === 'ready' ? (
        <>
          <Field label={t(`${gb}.fields.title`)} error={titleError}>
            {textInput(title, setTitle, t(`${gb}.placeholders.title`), 'guard-builder-title', true)}
          </Field>
          <div className="drawer__group">
            <h3 className="sectionrule" id={conditionId}>
              {t(`${gb}.condition`)}
            </h3>
            <GuardBuilder
              key={reading}
              condition={condition}
              onChange={edit}
              problems={problems}
              titleOf={titleOf}
              labelledBy={conditionId}
            />
          </div>
        </>
      ) : null}
    </Drawer>
  )
}
