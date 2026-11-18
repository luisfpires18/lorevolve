import type { Dispatch, SetStateAction } from 'react'
import { ApiError } from '../lib/api'
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
  setFieldErrors,
  setMessage,
  setIsSaving,
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
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>
  setMessage: Dispatch<SetStateAction<string | null>>
  setIsSaving: Dispatch<SetStateAction<boolean>>
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  async function save() {
    setMessage(null)
    setFieldErrors({})
    if (!name.trim()) {
      setFieldErrors({ name: t('entityTypes.page.dialog.nameRequired') })
      return
    }

    setIsSaving(true)
    try {
      await write({
        name: name.trim(),
        icon,
        parentId,
        familyTreeEligible,
        // Only a change is sent: an edit that leaves the groups alone, or a new type in none, says nothing about them.
        groups: (type ? groupsChanged : groupChoices.length > 0) ? groupChoices : undefined,
      })
      await onSaved(name.trim(), parentId)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : type
              ? t('entityTypes.page.dialog.detailsSave')
              : t('entityTypes.page.dialog.detailsCreate'),
        )
      } else {
        setMessage(
          type
            ? t('entityTypes.page.dialog.saveFailed')
            : t('entityTypes.page.dialog.createFailed'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { save }
}
