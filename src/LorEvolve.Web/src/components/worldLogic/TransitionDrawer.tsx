import { useId, useRef, useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import { confirmAction } from '../../lib/confirm'
import type { MachineTransition } from '../../worldLogic/machine'
import type { SystemMachineState, SystemRuleSummary } from '../../worldLogic/types'
import { m, gb, type Rules } from '../../worldLogic/machinePanelTypes'
import { textInput } from '../../worldLogic/machineDrawerFields'
import { useDrawerFocus } from '../../worldLogic/useDrawerFocus'
import { DrawerActions } from './DrawerActions'
import { GuardBuilderDrawer } from './GuardBuilderDrawer'

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
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [initial] = useState(() => ({
    fromStateId: transition?.fromStateId ?? states[0]?.id ?? '',
    toStateId: transition?.toStateId ?? states[1]?.id ?? '',
    label: transition?.label ?? '',
    guardRuleId: transition?.guardRuleId ?? '',
  }))
  const [form, setForm] = useState(initial)
  // The guard builder open over this drawer: a new rule, or the chosen one.
  const [building, setBuilding] = useState<{ ruleId: string | null } | null>(null)
  useDrawerFocus(dialog)

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
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

  const stateSelect =
    (key: 'fromStateId' | 'toStateId', testId: string) =>
    (control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => (
      <select
        id={control.id}
        className="field__input field__input--select"
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        aria-invalid={control['aria-invalid']}
        aria-describedby={control['aria-describedby']}
        data-testid={testId}
      >
        {states.map((state) => (
          <option key={state.id} value={state.id}>
            {state.name}
          </option>
        ))}
      </select>
    )

  return (
    <>
      <Drawer
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
        dialogRef={dialog}
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
        actions={(close) => (
          <DrawerActions
            close={close}
            isNew={!transition}
            onDelete={onDelete ? () => void remove() : undefined}
            testId="machine-transition"
          />
        )}
      >
        <Field label={t(`${m}.fields.from`)} error={errors?.fromstateid}>
          {stateSelect('fromStateId', 'machine-transition-from')}
        </Field>
        <Field label={t(`${m}.fields.to`)} error={errors?.tostateid}>
          {stateSelect('toStateId', 'machine-transition-to')}
        </Field>
        <Field label={t(`${m}.fields.label`)} error={errors?.label}>
          {textInput(
            form.label,
            (label) => setForm((current) => ({ ...current, label })),
            t(`${m}.placeholders.label`),
            'machine-transition-label',
          )}
        </Field>
        <Field
          label={t(`${m}.fields.guard`)}
          hint={rules === 'failed' ? t(`${m}.rulesFailed`) : t(`${m}.fields.guardHint`)}
          error={errors?.guardruleid}
        >
          {(control) => (
            <select
              id={control.id}
              className="field__input field__input--select"
              value={form.guardRuleId}
              disabled={rules === 'failed'}
              onChange={(event) =>
                setForm((current) => ({ ...current, guardRuleId: event.target.value }))
              }
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              data-testid="machine-transition-guard"
            >
              <option value="">{t(`${m}.noGuard`)}</option>
              {ruleList.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.title}
                </option>
              ))}
              {unknownGuard ? (
                <option value={form.guardRuleId}>{t(`${m}.unknownGuard`)}</option>
              ) : null}
            </select>
          )}
        </Field>
        <div className="form__actions">
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setBuilding({ ruleId: null })}
            data-testid="machine-transition-new-guard"
          >
            {t(`${gb}.newGuard`)}
          </button>
          <button
            className="button button--secondary button--sm"
            type="button"
            disabled={form.guardRuleId === '' || unknownGuard}
            onClick={() => setBuilding({ ruleId: form.guardRuleId })}
            data-testid="machine-transition-edit-guard"
          >
            {t(`${gb}.editGuard`)}
          </button>
        </div>
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
            setForm((current) => ({ ...current, guardRuleId: rule.id }))
            setBuilding(null)
          }}
          onClose={() => setBuilding(null)}
        />
      ) : null}
    </>
  )
}
