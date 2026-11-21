import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { t, useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { Field } from './Field'
import type { FieldValue } from '../lore/types'
import type { FieldDefinition } from '../lore/typeDefinitions'
import type { Era, Progression } from '../progression/types'
import { draftOf, inputOf } from '../progression/eraDraft'
import { useEraFormState } from '../progression/useEraFormState'
import { eraFormActions } from '../progression/eraFormActions'
import { ProgressionDrawer } from './progression/ProgressionDrawer'
import { NameNoteFields } from './NameNoteFields'
import { EraPoint } from './progression/EraPoint'
import { EraFieldRow } from './progression/EraFieldRow'
import { EraStories } from './progression/EraStories'

interface EraFormProps {
  universeId: string
  entityId: string
  entityName: string
  /** The entry's type's active fields, in order: what an era may set. */
  definitions: FieldDefinition[]
  /** The entry's own values, shown beside each field as what the era inherits. */
  entryFields: FieldValue[]
  chronology: Chronology
  progression: Progression
  /** The era being changed, or null for a new one - which goes last. */
  era: Era | null
  onClose: () => void
  onSaved: (progression: Progression) => void
}

/**
 * One era of one entry, in the drawer every LorEvolve form uses (Issue #41): its name, what happens to the entry then, when it is
 * on the universe's own chronology, the stories and scenes it covers, and - field by field - whether the era inherits the
 * entry's value, sets its own, or has none at all. Inheriting is the default and says what it inherits.
 *
 * The save is the whole progression with this era changed, over the version the page read: every other era goes back as it
 * was read. A save refused because the eras changed elsewhere keeps the form as typed (ADR 0043).
 */
export function EraForm({
  universeId,
  entityId,
  entityName,
  definitions,
  entryFields,
  chronology,
  progression,
  era,
  onClose,
  onSaved,
}: EraFormProps) {
  useI18n()
  const state = useEraFormState({ progression, era, definitions })
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const { nameInput, base, initial, draft, fieldErrors } = state

  const isDirty =
    payloadKey(inputOf(draft, null, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, null, reckonsInEras, custom))

  const index = era ? base.eras.findIndex((one) => one.id === era.id) : -1
  const key = `eras[${index === -1 ? base.eras.length : index}]`
  const errorOf = (part: string) => fieldErrors[`${key}.${part}`.toLowerCase()]

  const { edit, editField, save } = eraFormActions({
    ...state,
    universeId,
    entityId,
    definitions,
    era,
    onSaved,
    reckonsInEras,
    custom,
  })

  return (
    <ProgressionDrawer
      name="era"
      universeId={universeId}
      entityId={entityId}
      state={state}
      titleId="era-heading"
      eyebrow={
        era
          ? t('time.eraForm.eyebrowEdit', { name: entityName })
          : t('time.eraForm.eyebrowNew', { name: entityName })
      }
      title={era ? era.name : t('time.eraForm.newStage')}
      isDirty={isDirty}
      leaveMessage={
        era ? t('time.eraForm.leaveGuardEdit', { name: era.name }) : t('time.eraForm.leaveGuardNew')
      }
      submitLabel={era ? t('time.eraForm.save') : t('time.eraForm.add')}
      busyLabel={era ? t('time.eraForm.saving') : t('time.eraForm.adding')}
      cancelTestId="cancel-era"
      conflict={{
        what: t('time.eraForm.conflictWhat'),
        names: (latest) => latest.eras,
        draftFrom: (latest) =>
          draftOf(latest.eras.find((one) => one.id === era?.id) ?? null, definitions),
      }}
      onClose={onClose}
      onSave={() => void save()}
    >
      <NameNoteFields
        idPrefix="era"
        labels={{ name: t('time.eraForm.name'), note: t('time.eraForm.happens') }}
        placeholder={t('time.eraForm.namePlaceholder')}
        hint={t('time.eraForm.happensHint', { name: entityName })}
        value={{ name: draft.name, note: draft.description }}
        onChange={(part, value) => edit(part === 'name' ? { name: value } : { description: value })}
        errors={{ name: errorOf('name'), note: errorOf('description') }}
        testIds={{ name: 'era-name-input', note: 'era-description-input' }}
        nameRef={nameInput}
      />

      <Field
        group="fieldset"
        className="scenechron"
        label={t('time.eraForm.when')}
        hint={t('time.eraForm.whenHint')}
      >
        <EraPoint
          label={t('time.eraForm.from')}
          prefix="era-start"
          errorKey={`${key}.start`}
          chronology={chronology}
          value={draft.start}
          fieldErrors={fieldErrors}
          onChange={(start) => edit({ start })}
        />
        <EraPoint
          label={t('time.eraForm.to')}
          prefix="era-end"
          errorKey={`${key}.end`}
          chronology={chronology}
          value={draft.end}
          fieldErrors={fieldErrors}
          onChange={(end) => edit({ end })}
        />
      </Field>

      <EraStories
        universeId={universeId}
        stories={draft.stories}
        scenes={draft.scenes}
        onChange={(stories, scenes) => edit({ stories, scenes })}
        storyError={errorOf('storyIds')}
        sceneError={errorOf('sceneIds')}
      />

      {definitions.length > 0 ? (
        <Field
          group="fieldset"
          className="erafields"
          label={t('time.eraForm.details')}
          hint={t('time.eraForm.detailsHint', { name: entityName })}
          data-testid="era-fields"
        >
          {definitions.map((definition) => (
            <EraFieldRow
              key={definition.id}
              definition={definition}
              field={draft.fields[definition.id]}
              inherited={
                entryFields.find((value) => value.fieldDefinitionId === definition.id) ?? null
              }
              universeId={universeId}
              entityId={entityId}
              chronology={chronology}
              error={errorOf(`fields.${definition.id}`)}
              onChange={(change) => editField(definition.id, change)}
            />
          ))}
        </Field>
      ) : null}
    </ProgressionDrawer>
  )
}
