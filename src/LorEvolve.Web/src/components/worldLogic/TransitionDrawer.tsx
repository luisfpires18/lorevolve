import { useId, useState } from 'react'
import { useDraftForm } from '../../lib/useDraftForm'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import { confirmAction } from '../../lib/confirm'
import type { MachineTransition } from '../../worldLogic/machine'
import {
  MACHINE_TEXT_MAX_LENGTH,
  type SystemMachineState,
  type SystemRuleSummary,
} from '../../worldLogic/types'
import { m, gb, type Rules } from '../../worldLogic/machinePanelTypes'
import { FormActions } from '../FormActions'
import { GuardBuilderDrawer } from './GuardBuilderDrawer'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

export function TransitionDrawer({
  transition,
  states,
  rules,
  universeId,
  projectId,
  onRuleSaved,
  errors,
  onApply,
  onDelete,
  onClose,
}: {
  transition: MachineTransition | null
  states: SystemMachineState[]
  rules: Rules
  universeId: string
  projectId: string | null
  onRuleSaved: (rule: SystemRuleSummary) => void
  errors?: Record<string, string>
  onApply: (values: Omit<MachineTransition, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const {
    draft: form,
    edit,
    isDirty,
  } = useDraftForm(() => ({
    fromStateId: transition?.fromStateId ?? states[0]?.id ?? '',
    toStateId: transition?.toStateId ?? states[1]?.id ?? '',
    label: transition?.label ?? '',
    guardRuleId: transition?.guardRuleId ?? '',
  }))
  // The guard builder open over this drawer: a new rule, or the chosen one.
  const [building, setBuilding] = useState<{ ruleId: string | null } | null>(null)

  const ruleList = Array.isArray(rules) ? rules : []
  const unknownGuard =
    form.guardRuleId !== '' && !ruleList.some((rule) => rule.id === form.guardRuleId)

  async function remove() {
    if (!onDelete) return
    const confirmed = await confirmAction({
      title: t(`${m}.deleteTransition.title`),
      message: t(`${m}.deleteTransition.message`),
      confirmLabel: t(`${m}.deleteTransition.confirm`),
      variant: 'destructive',
    })
    if (confirmed) onDelete()
  }

  const stateOptions = states.map((state) => (
    <option key={state.id} value={state.id}>
      {state.name}
    </option>
  ))

  return (
    <>
      <Drawer
        initialFocus="input, select"
        testId="machine-transition-drawer"
        titleId={titleId}
        title={
          transition
            ? transition.label.trim() ||
              t(`${m}.transitionName`, {
                from: states.find((state) => state.id === transition.fromStateId)?.name ?? '',
                to: states.find((state) => state.id === transition.toStateId)?.name ?? '',
              })
            : t(`${m}.newTransition`)
        }
        isDirty={isDirty}
        leaveMessage={t(`${m}.leaveGuard`)}
        onClose={onClose}
        onSubmit={() =>
          onApply({
            fromStateId: form.fromStateId,
            toStateId: form.toStateId,
            label: form.label,
            guardRuleId: form.guardRuleId === '' ? null : form.guardRuleId,
          })
        }
        noValidate
        actions={{
          submitLabel: !transition ? t(`${m}.add`) : t(`${m}.save`),
          submitTestId: 'machine-transition-apply',
          cancelTestId: 'machine-transition-cancel',
          onDelete: onDelete ? () => void remove() : undefined,
          deleteLabel: t(`${m}.delete`),
          deleteTestId: 'machine-transition-delete',
        }}
      >
        <Field
          as="select"
          label={t(`${m}.fields.from`)}
          error={errors?.fromstateid}
          value={form.fromStateId}
          onChange={(event) => edit({ fromStateId: event.target.value })}
          data-testid="machine-transition-from"
        >
          {stateOptions}
        </Field>
        <Field
          as="select"
          label={t(`${m}.fields.to`)}
          error={errors?.tostateid}
          value={form.toStateId}
          onChange={(event) => edit({ toStateId: event.target.value })}
          data-testid="machine-transition-to"
        >
          {stateOptions}
        </Field>
        <Field
          name={null}
          label={t(`${m}.fields.label`)}
          error={errors?.label}
          type="text"
          dir="auto"
          value={form.label}
          maxLength={MACHINE_TEXT_MAX_LENGTH}
          onChange={(event) => edit({ label: event.target.value })}
          data-testid="machine-transition-label"
        />
        <Field
          as="select"
          label={t(`${m}.fields.guard`)}
          hint={rules === 'failed' ? t(`${m}.rulesFailed`) : t(`${m}.fields.guardHint`)}
          error={errors?.guardruleid}
          value={form.guardRuleId}
          disabled={rules === 'failed'}
          onChange={(event) => edit({ guardRuleId: event.target.value })}
          data-testid="machine-transition-guard"
        >
          <option value="">{t(`${m}.noGuard`)}</option>
          {ruleList.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.title}
            </option>
          ))}
          {unknownGuard ? <option value={form.guardRuleId}>{t(`${m}.unknownGuard`)}</option> : null}
        </Field>
        <FormActions inline>
          <NewButton
            tone="secondary"
            size="sm"
            onClick={() => setBuilding({ ruleId: null })}
            data-testid="machine-transition-new-guard"
          >
            {t(`${gb}.newGuard`)}
          </NewButton>
          <Button
            tone="secondary"
            size="sm"
            disabled={form.guardRuleId === '' || unknownGuard}
            onClick={() => setBuilding({ ruleId: form.guardRuleId })}
            data-testid="machine-transition-edit-guard"
          >
            {t(`${gb}.editGuard`)}
          </Button>
        </FormActions>
      </Drawer>
      {/* A sibling, not a child: a form inside the transition's form would submit both. */}
      {building ? (
        <GuardBuilderDrawer
          universeId={universeId}
          projectId={projectId}
          ruleId={building.ruleId}
          rules={ruleList}
          onSaved={(rule) => {
            onRuleSaved(rule)
            edit({ guardRuleId: rule.id })
            setBuilding(null)
          }}
          onClose={() => setBuilding(null)}
        />
      ) : null}
    </>
  )
}
