import { useId, useRef, useState } from 'react'
import { Drawer } from '../Drawer'
import { CheckField } from '../CheckField'
import { Field } from '../Field'
import { t } from '../../i18n'
import { confirmAction } from '../../lib/confirm'
import type { Point } from '../../worldLogic/machine'
import type { SystemMachineState } from '../../worldLogic/types'
import { m } from '../../worldLogic/machinePanelTypes'
import { errorOf, textInput } from '../../worldLogic/machineDrawerFields'
import { FormActions } from '../FormActions'

export function StateDrawer({
  state,
  place,
  isFirst,
  errors,
  onApply,
  onDelete,
  onClose,
}: {
  state: SystemMachineState | null
  place: Point | null
  isFirst: boolean
  errors?: Record<string, string>
  onApply: (values: Omit<SystemMachineState, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [initial] = useState(() => ({
    name: state?.name ?? '',
    value: state?.value ?? '',
    x: String(state?.x ?? place?.x ?? 0),
    y: String(state?.y ?? place?.y ?? 0),
    initial: state?.initial ?? isFirst,
  }))
  const [form, setForm] = useState(initial)
  const [local, setLocal] = useState<Record<string, string>>({})

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const number = (text: string) => (Number.isFinite(Number(text)) ? Number(text) : 0)

  function apply() {
    const missing: Record<string, string> = {}
    if (form.name.trim() === '') missing.name = t(`${m}.nameRequired`)
    if (form.value.trim() === '') missing.value = t(`${m}.valueRequired`)
    setLocal(missing)
    if (Object.keys(missing).length > 0) {
      dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    onApply({
      name: form.name,
      value: form.value,
      x: number(form.x),
      y: number(form.y),
      initial: form.initial,
    })
  }

  async function remove() {
    if (!state || !onDelete) return
    const confirmed = await confirmAction({
      title: t(`${m}.deleteState.title`, { name: state.name }),
      message: t(`${m}.deleteState.message`),
      confirmLabel: t(`${m}.deleteState.confirm`),
      variant: 'destructive',
    })
    if (confirmed) onDelete()
  }

  return (
    <Drawer
      initialFocus="input, select"
      testId="machine-state-drawer"
      titleId={titleId}
      title={state ? state.name : t(`${m}.newState`)}
      dialogRef={dialog}
      isDirty={isDirty}
      leaveMessage={t(`${m}.leaveGuard`)}
      onClose={onClose}
      onSubmit={apply}
      noValidate
      actions={(close) => (
        <FormActions
          submitLabel={!state ? t(`${m}.add`) : t(`${m}.save`)}
          submitTestId="machine-state-apply"
          onCancel={close}
          cancelTestId="machine-state-cancel"
          onDelete={onDelete ? () => void remove() : undefined}
          deleteLabel={t(`${m}.delete`)}
          deleteTestId="machine-state-delete"
        />
      )}
    >
      <Field label={t(`${m}.fields.name`)} error={errorOf(local, errors, 'name')}>
        {textInput(
          form.name,
          (name) => setForm((current) => ({ ...current, name })),
          t(`${m}.placeholders.name`),
          'machine-state-name',
          true,
        )}
      </Field>
      <Field
        label={t(`${m}.fields.value`)}
        hint={t(`${m}.fields.valueHint`)}
        error={errorOf(local, errors, 'value')}
      >
        {textInput(
          form.value,
          (value) => setForm((current) => ({ ...current, value })),
          t(`${m}.placeholders.value`),
          'machine-state-value',
          true,
        )}
      </Field>
      <Field
        name="machine-state-x"
        label={t(`${m}.fields.x`)}
        type="number"
        step="1"
        inputMode="numeric"
        value={form.x}
        onChange={(event) => setForm((current) => ({ ...current, x: event.target.value }))}
        error={errors?.x}
        data-testid="machine-state-x"
      />
      <Field
        name="machine-state-y"
        label={t(`${m}.fields.y`)}
        type="number"
        step="1"
        inputMode="numeric"
        value={form.y}
        onChange={(event) => setForm((current) => ({ ...current, y: event.target.value }))}
        error={errors?.y}
        data-testid="machine-state-y"
      />
      <CheckField
        className="field--flow"
        label={t(`${m}.fields.initial`)}
        checked={form.initial}
        onChange={(initial) => setForm((current) => ({ ...current, initial }))}
        testId="machine-state-initial"
      />
    </Drawer>
  )
}
