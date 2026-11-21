import { useId } from 'react'
import { useDraftForm } from '../../lib/useDraftForm'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { MachineDoc } from '../../worldLogic/machine'
import { m } from '../../worldLogic/machinePanelTypes'
import { textInput } from '../../worldLogic/machineDrawerFields'
import { FormActions } from '../FormActions'
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
      actions={(close) => (
        <FormActions
          submitLabel={t(`${m}.save`)}
          submitTestId="machine-binding-apply"
          onCancel={close}
          cancelTestId="machine-binding-cancel"
        />
      )}
    >
      <Field label={t(`${m}.fields.subjectType`)} error={errors?.subjecttype}>
        {textInput(
          form.subjectType,
          (subjectType) => edit({ subjectType }),
          t(`${m}.placeholders.subjectType`),
          'machine-binding-subject-type',
        )}
      </Field>
      <Field label={t(`${m}.fields.attribute`)} error={errors?.attribute}>
        {textInput(
          form.attribute,
          (attribute) => edit({ attribute }),
          t(`${m}.placeholders.attribute`),
          'machine-binding-attribute',
        )}
      </Field>
    </Drawer>
  )
}
