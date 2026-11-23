import { useId, useRef, useState } from 'react'
import { useDraftForm } from '../../lib/useDraftForm'
import { Drawer } from '../Drawer'
import { CheckField } from '../CheckField'
import { Field } from '../Field'
import { t } from '../../i18n'
import { confirmAction } from '../../lib/confirm'
import type { Point } from '../../worldLogic/machine'
import { MACHINE_TEXT_MAX_LENGTH, type SystemMachineState } from '../../worldLogic/types'
import { m } from '../../worldLogic/machinePanelTypes'
import { errorOf } from '../../worldLogic/machineDrawerFields'

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
  const {
    draft: form,
    edit,
    isDirty,
  } = useDraftForm(() => ({
    name: state?.name ?? '',
    value: state?.value ?? '',
    x: String(state?.x ?? place?.x ?? 0),
    y: String(state?.y ?? place?.y ?? 0),
    initial: state?.initial ?? isFirst,
  }))
  const [local, setLocal] = useState<Record<string, string>>({})

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
      actions={{
        submitLabel: !state ? t(`${m}.add`) : t(`${m}.save`),
        submitTestId: 'machine-state-apply',
        cancelTestId: 'machine-state-cancel',
        onDelete: onDelete ? () => void remove() : undefined,
        deleteLabel: t(`${m}.delete`),
        deleteTestId: 'machine-state-delete',
      }}
    >
      <Field
        name={null}
        label={t(`${m}.fields.name`)}
        error={errorOf(local, errors, 'name')}
        type="text"
        dir="auto"
        value={form.name}
        maxLength={MACHINE_TEXT_MAX_LENGTH}
        onChange={(event) => edit({ name: event.target.value })}
        aria-required
        data-testid="machine-state-name"
      />
      <Field
        name={null}
        label={t(`${m}.fields.value`)}
        hint={t(`${m}.fields.valueHint`)}
        error={errorOf(local, errors, 'value')}
        type="text"
        dir="auto"
        value={form.value}
        maxLength={MACHINE_TEXT_MAX_LENGTH}
        onChange={(event) => edit({ value: event.target.value })}
        aria-required
        data-testid="machine-state-value"
      />
      <Field
        name="machine-state-x"
        label={t(`${m}.fields.x`)}
        type="number"
        step="1"
        inputMode="numeric"
        value={form.x}
        onChange={(event) => edit({ x: event.target.value })}
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
        onChange={(event) => edit({ y: event.target.value })}
        error={errors?.y}
        data-testid="machine-state-y"
      />
      <CheckField
        className="field--flow"
        label={t(`${m}.fields.initial`)}
        checked={form.initial}
        onChange={(initial) => edit({ initial })}
        testId="machine-state-initial"
      />
    </Drawer>
  )
}
