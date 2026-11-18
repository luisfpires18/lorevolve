import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { GuardBuilder } from '../GuardBuilder'
import { t } from '../../i18n'
import { useReturnFocus } from '../../lib/returnFocus'
import { sameCondition } from '../../worldLogic/guardSummary'
import type { SystemRuleSummary } from '../../worldLogic/types'
import { m, gb } from '../../worldLogic/machinePanelTypes'
import { textInput } from '../../worldLogic/machineDrawerFields'
import { useGuardDrawerState } from '../../worldLogic/useGuardDrawerState'
import { guardDrawerActions } from '../../worldLogic/guardDrawerActions'
import { useGuardDrawerEffects } from '../../worldLogic/useGuardDrawerEffects'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

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
  useReturnFocus()

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
          cancelLabel={t(`${m}.cancel`)}
          cancelTestId="guard-builder-cancel"
        />
      )}
    >
      {conflict ? (
        <div className="callout callout--warning" role="alert" data-testid="guard-conflict">
          <p className="callout__title">{t(`${gb}.conflict`)}</p>
          <div className="manuscript__conflictactions">
            <Button
              tone="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void keepMine()}
              data-testid="guard-keep-mine"
            >
              {t(`${m}.keepMine`)}
            </Button>
            <Button
              tone="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void loadSaved()}
              data-testid="guard-load-saved"
            >
              {t(`${m}.loadSaved`)}
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="guard-builder-error">
          {message}
        </p>
      ) : null}

      {load === 'loading' ? (
        <p className="notice" role="status">
          {t(`${gb}.loading`)}
        </p>
      ) : null}
      {load === 'error' ? (
        <p className="form__message" role="alert" data-testid="guard-builder-unavailable">
          {t(`${gb}.loadFailed`)}
        </p>
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
