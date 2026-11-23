import { useId } from 'react'
import { useDraftForm } from '../../lib/useDraftForm'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { MachineDoc } from '../../worldLogic/machine'
import { m } from '../../worldLogic/machinePanelTypes'
import { MACHINE_TEXT_MAX_LENGTH } from '../../worldLogic/types'
import { QuietNote } from '../QuietNote'

export function BindingDrawer({
  binding,
  errors,
  onApply,
  onClose,
}: {
  binding: MachineDoc['binding']
  errors?: Record<string, string>
  onApply: (binding: MachineDoc['binding']) => void
  onClose: () => void
}) {
  const titleId = useId()
  const { draft: form, edit, isDirty } = useDraftForm(() => binding)

  return (
    <Drawer
      initialFocus="input, select"
      testId="machine-binding-drawer"
      titleId={titleId}
      title={t(`${m}.binding`)}
      context={
        <QuietNote size="ui" wrap className="drawer__context">
          {t(`${m}.fields.bindingHint`)}
        </QuietNote>
      }
      isDirty={isDirty}
      leaveMessage={t(`${m}.leaveGuard`)}
      onClose={onClose}
      onSubmit={() => onApply(form)}
      noValidate
      actions={{
        submitLabel: t(`${m}.save`),
        submitTestId: 'machine-binding-apply',
        cancelTestId: 'machine-binding-cancel',
      }}
    >
      <Field
        name={null}
        label={t(`${m}.fields.subjectType`)}
        error={errors?.subjecttype}
        type="text"
        dir="auto"
        value={form.subjectType}
        maxLength={MACHINE_TEXT_MAX_LENGTH}
        onChange={(event) => edit({ subjectType: event.target.value })}
        data-testid="machine-binding-subject-type"
      />
      <Field
        name={null}
        label={t(`${m}.fields.attribute`)}
        error={errors?.attribute}
        type="text"
        dir="auto"
        value={form.attribute}
        maxLength={MACHINE_TEXT_MAX_LENGTH}
        onChange={(event) => edit({ attribute: event.target.value })}
        data-testid="machine-binding-attribute"
      />
    </Drawer>
  )
}
