import { ApiError } from '../lib/api'
import { FIELD_CHANGED_CODE, addField, updateField, type FieldInput } from './fieldsApi'
import { FieldKind, semanticsFor, type FieldKindValue } from './fieldKinds'
import { draftOf, parseTarget, splitOptions, targetChoice } from './fieldDraft'
import type { EntityType, FieldDefinition } from './typeDefinitions'
import type { useFieldDialogState } from './useFieldDialogState'
import type { useI18n } from '../i18n'

/** A field drawer's handlers: choose the kind, take the saved settings or keep the draft, and save. */
export function fieldDialogActions({
  universeId,
  type,
  field,
  onChanged,
  onSaved,
  t,
  base,
  setBase,
  setStale,
  name,
  setName,
  kind,
  setKind,
  isRequired,
  setIsRequired,
  options,
  setOptions,
  semantic,
  setSemantic,
  defaultValue,
  setDefaultValue,
  imageShape,
  setImageShape,
  target,
  setTarget,
  setFieldErrors,
  setMessage,
  setIsSaving,
  hasOptions,
  isLink,
  isText,
  isImage,
}: ReturnType<typeof useFieldDialogState> & {
  universeId: string
  type: EntityType
  field: FieldDefinition | null
  onChanged: () => Promise<void>
  onSaved: (name: string, wasNew: boolean) => Promise<void>
  hasOptions: boolean
  isLink: boolean
  isText: boolean
  isImage: boolean
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  function chooseKind(next: FieldKindValue) {
    setKind(next)
    // A meaning belongs to a shape: switching away from one that can carry it drops it rather than sending a pair the
    // API refuses. A link target belongs to a link field alone.
    setSemantic((current) =>
      current !== null && semanticsFor(next).includes(current) ? current : null,
    )
    if (next !== FieldKind.EntityReference) setTarget(field ? targetChoice(field) : null)
  }

  /** Puts the saved settings in the drawer, the version with them, and drops the draft. */
  function takeSaved(saved: FieldDefinition) {
    const next = draftOf(saved)
    setBase({ draft: next, version: saved.version })
    setName(next.name)
    setKind(next.kind)
    setIsRequired(next.isRequired)
    setOptions(next.options)
    setSemantic(next.semantic)
    setDefaultValue(next.defaultValue)
    setImageShape(next.imageShape)
    setTarget(next.target)
    setStale(false)
    setMessage(null)
    setFieldErrors({})
  }

  /** Keeps the draft and takes the saved version, so the next Save deliberately replaces what is saved now. */
  function keepMine(saved: FieldDefinition) {
    setBase((current) => ({ ...current, version: saved.version }))
    setStale(false)
    setMessage(t('entityTypes.fields.keptMine'))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setStale(false)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = t('entityTypes.fields.nameRequired')
    if (hasOptions && splitOptions(options).length === 0)
      errors.options = t('entityTypes.fields.optionsRequired')
    if (isLink && target === null) errors.target = t('entityTypes.fields.targetRequired')
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const input: FieldInput = {
      name: name.trim(),
      kind,
      // A picture is optional by nature: the API refuses a required Image field.
      isRequired: isImage ? false : isRequired,
      // A new field goes last, and an edit keeps its place: the order is the Sections drawer's (Issue #26).
      displayOrder: null,
      defaultValue: isText ? defaultValue.trim() || null : null,
      options: hasOptions ? splitOptions(options) : null,
      semantic,
      imageShape: isImage ? imageShape : null,
      ...parseTarget(isLink ? target : null),
      ...(field ? { expectedVersion: base.version } : {}),
    }

    setIsSaving(true)
    try {
      if (field) await updateField(universeId, type.id, field.id, input)
      else await addField(universeId, type.id, input)
      await onSaved(input.name, field === null)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_CHANGED_CODE) {
        // Saved by someone else since this opened: nothing was written, the draft stays, and the latest is read so the
        // author can compare and choose.
        setMessage(t('entityTypes.fields.changedMeanwhile'))
        setStale(true)
        await onChanged().catch(() => undefined)
      } else if (error instanceof ApiError) {
        const mapped: Record<string, string> = {}
        for (const [key, text] of Object.entries(error.fieldErrors)) {
          mapped[key === 'targetentitytypeid' || key === 'targetgroupid' ? 'target' : key] = text
        }
        setFieldErrors(mapped)
        setMessage(
          Object.keys(mapped).length === 0
            ? error.message
            : field
              ? t('entityTypes.fields.detailsSave')
              : t('entityTypes.fields.detailsAdd'),
        )
        // Changed elsewhere since this opened (archived, say): the list behind should say so too.
        if (error.status === 409) await onChanged().catch(() => undefined)
      } else {
        setMessage(field ? t('entityTypes.fields.saveFailed') : t('entityTypes.fields.addFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { chooseKind, takeSaved, keepMine, save }
}
