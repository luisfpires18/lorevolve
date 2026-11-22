import type { useFormSave } from '../lib/useFormSave'
import type { DialogType, TypeDialogValues } from '../components/TypeDialog'
import type { GroupChoice } from '../components/TypeGroupsField'
import type { useI18n } from '../i18n'

/** The type drawer's save: checks the name, writes the type through the caller, and shows a refusal. */
export function typeDialogSave({
  type,
  write,
  onSaved,
  t,
  name,
  parentId,
  icon,
  familyTreeEligible,
  groupChoices,
  groupsChanged,
  form,
}: {
  type: DialogType | null
  write: (values: TypeDialogValues) => Promise<unknown>
  onSaved: (name: string, parentId: string | null) => Promise<void>
  name: string
  parentId: string | null
  icon: string | null
  familyTreeEligible: boolean
  groupChoices: GroupChoice[]
  groupsChanged: boolean
  form: ReturnType<typeof useFormSave>
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  async function save() {
    form.setMessage(null)
    form.setFieldErrors({})
    if (!name.trim()) {
      form.setFieldErrors({ name: t('entityTypes.page.dialog.nameRequired') })
      return
    }

    await form.save(async () => {
      await write({
        name: name.trim(),
        icon,
        parentId,
        familyTreeEligible,
        // Only a change is sent: an edit that leaves the groups alone, or a new type in none, says nothing about them.
        groups: (type ? groupsChanged : groupChoices.length > 0) ? groupChoices : undefined,
      })
      await onSaved(name.trim(), parentId)
    })
  }

  return { save }
}
