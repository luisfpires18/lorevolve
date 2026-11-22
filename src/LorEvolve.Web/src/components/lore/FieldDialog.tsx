import { useI18n } from '../../i18n'
import { payloadKey } from '../../lib/drawerGuard'
import { Drawer } from '../Drawer'
import { FieldKind, type FieldKindValue } from '../../lore/fieldKinds'
import type { EntityType, EntityTypeGroup, FieldDefinition } from '../../lore/typeDefinitions'
import type { TypeTree } from '../../lore/typeTree'
import { useFieldDialogState } from '../../lore/useFieldDialogState'
import { fieldDialogActions, type FieldSave } from '../../lore/fieldDialogActions'
import { FieldKindFields } from './FieldKindFields'
import { FieldLinkTarget } from './FieldLinkTarget'
import { FieldMeaningShape } from './FieldMeaningShape'
import { FieldDefaultRequired } from './FieldDefaultRequired'
import { StaleChoice } from '../StaleChoice'

/**
 * One field's settings, new or existing, in the drawer every LorEvolve form uses: focus goes in, Escape and Cancel ask before
 * an edit is lost, a failed save keeps the draft and says why, and focus returns to the button that opened it.
 *
 * Everything the API takes is here - name, kind, options, what a link may point at, a Canon meaning, default text and
 * whether it is required - and an edit sends the field's own order back, so its place is kept. A new link field has no
 * target until the author picks one, "Any Lore type" included: nothing is chosen for them, and nothing from the name.
 * The kind of a field that holds values is shown but cannot change, because the API refuses it.
 *
 * With `save` (a project or template field) the drawer asks only name, kind (from `kinds`), options, image shape and
 * required: no link target, meaning, default text or stale check, and `owner` names the eyebrow.
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
  owner,
  kinds,
  save: saveTo,
}: {
  universeId?: string
  type?: EntityType
  /** The field being edited, as it read when the drawer opened, or null for a new one. */
  field: FieldDefinition | null
  /** The same field as the list reads it now, after any reload; undefined once it is gone. */
  latest?: FieldDefinition
  /** A field's one-line summary, as the list says it. */
  describe?: (field: FieldDefinition) => string
  tree?: TypeTree
  groups?: EntityTypeGroup[]
  onClose: () => void
  onChanged?: () => Promise<void>
  onSaved: (name: string, wasNew: boolean) => Promise<void>
  /** The template or project type the field is on, for the eyebrow, where there is no Lore `type`. */
  owner?: string
  /** The kinds offered, where the place allows fewer than Lore. */
  kinds?: FieldKindValue[]
  /** Saves the field somewhere other than a Lore type; see above. */
  save?: FieldSave
}) {
  const { t, tx } = useI18n()
  // A project field's options are one per line, as its old form had them, so an option may hold a comma.
  const state = useFieldDialogState({ field, lines: !!saveTo })
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

  const { chooseKind, takeSaved, keepMine, save } = fieldDialogActions({
    ...state,
    universeId,
    type,
    field,
    onChanged,
    onSaved,
    saveTo,
    t,
    hasOptions,
    isLink,
    isText,
    isImage,
  })

  return (
    <Drawer
      initialFocus="#field-name"
      testId="field-dialog"
      titleId="field-heading"
      eyebrow={tx('entityTypes.fields.dialogEyebrow', { name: <bdi>{type?.name ?? owner}</bdi> })}
      title={field ? t('entityTypes.fields.editTitle') : t('entityTypes.fields.addTitle')}
      isDirty={isDirty}
      leaveMessage={
        field
          ? t('entityTypes.fields.leaveEdit', { name: field.name })
          : t('entityTypes.fields.leaveNew')
      }
      busy={isSaving}
      onClose={onClose}
      noValidate
      onSubmit={() => void save()}
      message={message}
      messageTestId="field-dialog-error"
      actions={{
        submitLabel: field ? t('entityTypes.fields.saveChanges') : t('entityTypes.fields.addTitle'),
        busyLabel: field ? t('entityTypes.fields.saving') : t('entityTypes.fields.adding'),
        submitTestId: 'save-field',
        cancelTestId: 'cancel-field',
      }}
    >
      {stale && latest && describe ? (
        <StaleChoice
          testId="field"
          boxId="field-dialog-stale"
          loadId="field-use-saved"
          title={t('entityTypes.fields.savedNow')}
          text={tx(
            latest.archivedAt !== null
              ? 'entityTypes.fields.savedNowArchived'
              : 'entityTypes.fields.savedNowSummary',
            { name: <bdi>{latest.name}</bdi>, summary: describe(latest) },
          )}
          loadLabel={t('entityTypes.fields.useSaved')}
          onLoadSaved={() => takeSaved(latest)}
          onKeepMine={latest.archivedAt === null ? () => keepMine(latest) : undefined}
          keepLabel={t('entityTypes.fields.keepMine')}
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
        kinds={kinds}
        lines={!!saveTo}
      />

      {tree && groups ? (
        <FieldLinkTarget
          field={field}
          tree={tree}
          groups={groups}
          isLink={isLink}
          target={target}
          setTarget={setTarget}
          fieldErrors={fieldErrors}
        />
      ) : null}

      <FieldMeaningShape
        kind={kind}
        semantic={semantic}
        setSemantic={setSemantic}
        isImage={isImage}
        imageShape={imageShape}
        setImageShape={setImageShape}
        fieldErrors={fieldErrors}
        meaning={!saveTo}
      />

      <FieldDefaultRequired
        type={type}
        field={field}
        isText={isText && !saveTo}
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
