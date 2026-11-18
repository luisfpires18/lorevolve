import { useEffect } from 'react'
import { useI18n } from '../../i18n'
import { payloadKey } from '../../lib/drawerGuard'
import { useReturnFocus } from '../../lib/returnFocus'
import { Drawer } from '../Drawer'
import { FieldKind } from '../../lore/fieldKinds'
import type { EntityType, EntityTypeGroup, FieldDefinition } from '../../lore/typeDefinitions'
import type { TypeTree } from '../../lore/typeTree'
import { useFieldDialogState } from '../../lore/useFieldDialogState'
import { fieldDialogActions } from '../../lore/fieldDialogActions'
import { FieldStaleNotice } from './FieldStaleNotice'
import { FieldKindFields } from './FieldKindFields'
import { FieldLinkTarget } from './FieldLinkTarget'
import { FieldMeaningShape } from './FieldMeaningShape'
import { FieldDefaultRequired } from './FieldDefaultRequired'

/**
 * One field's settings, new or existing, in the drawer every LorEvolve form uses: focus goes in, Escape and Cancel ask before
 * an edit is lost, a failed save keeps the draft and says why, and focus returns to the button that opened it.
 *
 * Everything the API takes is here - name, kind, options, what a link may point at, a Canon meaning, default text and
 * whether it is required - and an edit sends the field's own order back, so its place is kept. A new link field has no
 * target until the author picks one, "Any Lore type" included: nothing is chosen for them, and nothing from the name.
 * The kind of a field that holds values is shown but cannot change, because the API refuses it.
 */
export function FieldDialog({
  universeId,
  type,
  field,
  latest,
  describe,
  tree,
  groups,
  onClose,
  onChanged,
  onSaved,
}: {
  universeId: string
  type: EntityType
  /** The field being edited, as it read when the drawer opened, or null for a new one. */
  field: FieldDefinition | null
  /** The same field as the list reads it now, after any reload; undefined once it is gone. */
  latest: FieldDefinition | undefined
  /** A field's one-line summary, as the list says it. */
  describe: (field: FieldDefinition) => string
  tree: TypeTree
  groups: EntityTypeGroup[]
  onClose: () => void
  onChanged: () => Promise<void>
  onSaved: (name: string, wasNew: boolean) => Promise<void>
}) {
  const { t, tx } = useI18n()
  const state = useFieldDialogState({ field })
  const {
    initial,
    stale,
    name,
    setName,
    kind,
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
    fieldErrors,
    message,
    isSaving,
  } = state

  const hasOptions = kind === FieldKind.Select || kind === FieldKind.MultiSelect
  const isLink = kind === FieldKind.EntityReference
  const isText = kind === FieldKind.ShortText || kind === FieldKind.LongText
  const isImage = kind === FieldKind.Image

  const draft = {
    name: name.trim(),
    kind,
    isRequired,
    options,
    semantic,
    defaultValue,
    imageShape,
    target,
  }
  const isDirty = payloadKey(draft) !== payloadKey({ ...initial, name: initial.name.trim() })
  useReturnFocus()

  useEffect(() => {
    document.getElementById('field-name')?.focus()
  }, [])

  const { chooseKind, takeSaved, keepMine, save } = fieldDialogActions({
    ...state,
    universeId,
    type,
    field,
    onChanged,
    onSaved,
    t,
    hasOptions,
    isLink,
    isText,
    isImage,
  })

  return (
    <Drawer
      testId="field-dialog"
      titleId="field-heading"
      eyebrow={tx('entityTypes.fields.dialogEyebrow', { name: <bdi>{type.name}</bdi> })}
      title={field ? t('entityTypes.fields.editTitle') : t('entityTypes.fields.addTitle')}
      isDirty={isDirty}
      leaveMessage={
        field
          ? t('entityTypes.fields.leaveEdit', { name: field.name })
          : t('entityTypes.fields.leaveNew')
      }
      onClose={onClose}
      noValidate
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <button className="button" type="submit" disabled={isSaving} data-testid="save-field">
            {field
              ? isSaving
                ? t('entityTypes.fields.saving')
                : t('entityTypes.fields.saveChanges')
              : isSaving
                ? t('entityTypes.fields.adding')
                : t('entityTypes.fields.addTitle')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-field"
          >
            {t('entityTypes.fields.cancel')}
          </button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="field-dialog-error">
          {message}
        </p>
      ) : null}

      {stale && latest ? (
        <FieldStaleNotice
          latest={latest}
          describe={describe}
          takeSaved={takeSaved}
          keepMine={keepMine}
        />
      ) : null}

      <FieldKindFields
        field={field}
        latest={latest}
        name={name}
        setName={setName}
        kind={kind}
        chooseKind={chooseKind}
        hasOptions={hasOptions}
        options={options}
        setOptions={setOptions}
        fieldErrors={fieldErrors}
      />

      <FieldLinkTarget
        field={field}
        tree={tree}
        groups={groups}
        isLink={isLink}
        target={target}
        setTarget={setTarget}
        fieldErrors={fieldErrors}
      />

      <FieldMeaningShape
        kind={kind}
        semantic={semantic}
        setSemantic={setSemantic}
        isImage={isImage}
        imageShape={imageShape}
        setImageShape={setImageShape}
        fieldErrors={fieldErrors}
      />

      <FieldDefaultRequired
        type={type}
        field={field}
        isText={isText}
        isImage={isImage}
        defaultValue={defaultValue}
        setDefaultValue={setDefaultValue}
        isRequired={isRequired}
        setIsRequired={setIsRequired}
        fieldErrors={fieldErrors}
      />
    </Drawer>
  )
}
