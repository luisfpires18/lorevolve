import { useEffect } from 'react'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { t, useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { Drawer } from './Drawer'
import { Field } from './Field'
import type { FieldValue } from '../lore/types'
import type { FieldDefinition } from '../lore/typeDefinitions'
import type { Era, Progression } from '../progression/types'
import { inputOf } from '../progression/eraDraft'
import { useEraFormState } from '../progression/useEraFormState'
import { eraFormActions } from '../progression/eraFormActions'
import { EraConflict } from './progression/EraConflict'
import { EraNameFields } from './progression/EraNameFields'
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

  const {
    nameInput,
    saveButton,
    base,
    setBase,
    initial,
    draft,
    setDraft,
    fieldErrors,
    message,
    isSaving,
    conflict,
    setConflict,
  } = state

  const isDirty =
    payloadKey(inputOf(draft, null, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, null, reckonsInEras, custom))
  useReturnFocus()

  useEffect(() => {
    nameInput.current?.focus()
  }, [])

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
    <Drawer
      testId="era-form"
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
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <button
            ref={saveButton}
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="save-era"
          >
            {isSaving
              ? era
                ? t('time.eraForm.saving')
                : t('time.eraForm.adding')
              : era
                ? t('time.eraForm.save')
                : t('time.eraForm.add')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-era"
          >
            {t('time.eraForm.cancel')}
          </button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="era-error">
          {message}
        </p>
      ) : null}

      {conflict ? (
        <EraConflict
          universeId={universeId}
          entityId={entityId}
          era={era}
          definitions={definitions}
          setBase={setBase}
          setDraft={setDraft}
          setConflict={setConflict}
          nameInput={nameInput}
          saveButton={saveButton}
        />
      ) : null}

      <EraNameFields
        entityName={entityName}
        draft={draft}
        edit={edit}
        errorOf={errorOf}
        nameInput={nameInput}
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
    </Drawer>
  )
}
