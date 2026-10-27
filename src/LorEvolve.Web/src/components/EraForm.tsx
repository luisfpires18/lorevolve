import { useEffect, useId, useRef, useState } from 'react'
import {
  ChronologyPointFields,
  type ChronologyPointDraft,
  type ChronologyPointPart,
} from './ChronologyPointFields'
import { EditConflict } from './EditConflict'
import type { EntityChoice } from './EntityPicker'
import { FieldInput } from './FieldInputs'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { isChangedElsewhere } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import { emptyValue } from '../lore/document'
import { renderFact } from '../lore/facts'
import type { FieldDefinition, FieldValue, FieldValueInput } from '../lore/types'
import {
  eraInputOf,
  getProgression,
  PROGRESSION_CHANGED,
  saveProgression,
} from '../progression/api'
import type { Era, EraFieldInput, EraScene, EraStory, Progression } from '../progression/types'
import { chronologyOf, EMPTY_POINT } from '../stories/sceneDraft'
import { getStory, listStories } from '../stories/api'
import { readingOrder } from '../stories/structure'
import type { StorySummary } from '../stories/types'

type Mode = 'inherit' | 'set' | 'cleared'

interface FieldDraft {
  mode: Mode
  value: FieldValueInput
  /** The entry an existing override links to, named as it was read, so the picker shows it until it is changed. */
  held: EntityChoice | null
}

interface EraDraft {
  name: string
  description: string
  start: ChronologyPointDraft
  end: ChronologyPointDraft
  stories: EraStory[]
  scenes: EraScene[]
  fields: Record<string, FieldDraft>
}

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

function text(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function pointDraft(value: ChronologyValue | null): ChronologyPointDraft {
  return value
    ? {
        eraId: value.eraId ?? '',
        year: text(value.year),
        month: value.monthId ?? text(value.month),
        day: text(value.day),
      }
    : EMPTY_POINT
}

function draftOf(era: Era | null, definitions: FieldDefinition[]): EraDraft {
  const overrides = new Map((era?.fields ?? []).map((field) => [field.fieldDefinitionId, field]))

  return {
    name: era?.name ?? '',
    description: era?.description ?? '',
    start: pointDraft(era?.start ?? null),
    end: pointDraft(era?.end ?? null),
    stories: era?.stories ?? [],
    scenes: era?.scenes ?? [],
    fields: Object.fromEntries(
      definitions.map((definition) => {
        const override = overrides.get(definition.id)
        const value: FieldValueInput = override
          ? {
              fieldDefinitionId: definition.id,
              text: override.text,
              number: override.number,
              boolean: override.boolean,
              date: override.date,
              optionIds: override.optionIds,
              referencedEntityId: override.referencedEntityId,
              eraId: override.eraId,
            }
          : emptyValue(definition)
        return [
          definition.id,
          {
            mode: override ? (override.cleared ? 'cleared' : 'set') : 'inherit',
            value,
            held: override?.referencedEntityId
              ? {
                  id: override.referencedEntityId,
                  name: override.referencedEntityIsTrashed
                    ? `${override.referencedEntityName ?? 'Unavailable'} (in Trash)`
                    : (override.referencedEntityName ?? 'Unavailable'),
                }
              : null,
          },
        ]
      }),
    ),
  }
}

function inputOf(draft: EraDraft, id: string | null, reckonsInEras: boolean, custom: boolean) {
  const fields: EraFieldInput[] = Object.values(draft.fields)
    .filter((field) => field.mode !== 'inherit')
    .map((field) =>
      field.mode === 'cleared'
        ? {
            fieldDefinitionId: field.value.fieldDefinitionId,
            cleared: true,
            text: null,
            number: null,
            boolean: null,
            date: null,
            optionIds: null,
            referencedEntityId: null,
            eraId: null,
          }
        : { ...field.value, cleared: false },
    )

  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    start: chronologyOf(draft.start, reckonsInEras, custom),
    end: chronologyOf(draft.end, reckonsInEras, custom),
    storyIds: draft.stories.map((story) => story.id),
    sceneIds: draft.scenes.map((scene) => scene.id),
    fields,
  }
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
  const dialog = useRef<HTMLDialogElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const [base, setBase] = useState(progression)
  const [initial] = useState(() => draftOf(era, definitions))
  const [draft, setDraft] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  const isDirty =
    payloadKey(inputOf(draft, null, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, null, reckonsInEras, custom))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    era
      ? `“${era.name}” has unsaved changes. Leave without saving them?`
      : 'This new era has not been saved. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    nameInput.current?.focus()
  }, [])

  const index = era ? base.eras.findIndex((one) => one.id === era.id) : -1
  const key = `eras[${index === -1 ? base.eras.length : index}]`
  const errorOf = (part: string) => fieldErrors[`${key}.${part}`.toLowerCase()]

  function edit(change: Partial<EraDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function editField(id: string, change: Partial<FieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: { ...current.fields, [id]: { ...current.fields[id], ...change } },
    }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const shown = new Set(definitions.map((definition) => definition.id))
    const typed = inputOf(draft, era?.id ?? null, reckonsInEras, custom)
    // An override of a field this form does not show - the type's fields could not be read, say - goes back exactly as it
    // was read: what the form cannot show, it never clears.
    const kept = era
      ? eraInputOf(era).fields.filter((field) => !shown.has(field.fieldDefinitionId))
      : []
    const mine = { ...typed, fields: [...kept, ...typed.fields] }
    const eras = base.eras.map((one) => (one.id === era?.id ? mine : eraInputOf(one)))

    try {
      const saved = await saveProgression(universeId, entityId, {
        eras: era && eras.some((one) => one.id === era.id) ? eras : [...eras, mine],
        expectedVersion: base.version,
      })
      onSaved(saved)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this era can be saved.',
        )
      } else {
        setMessage('That era could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="era-heading"
      {...dialogProps}
      data-testid="era-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            {era ? `An era of ${entityName}` : `New era of ${entityName}`}
          </p>
          <h2 className="drawer__title" id="era-heading">
            {era ? era.name : 'New era'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="era-error">
              {message}
            </p>
          ) : null}

          {conflict ? (
            <EditConflict
              what="eras"
              read={() => getProgression(universeId, entityId)}
              renderLatest={(latest) => (
                <ul className="namelist">
                  {latest.eras.map((one) => (
                    <li key={one.id}>{one.name}</li>
                  ))}
                </ul>
              )}
              onKeepMine={(latest) => {
                setBase(latest)
                setConflict(false)
                requestAnimationFrame(() => saveButton.current?.focus())
              }}
              onUseLatest={(latest) => {
                setBase(latest)
                const reread = latest.eras.find((one) => one.id === era?.id) ?? null
                setDraft(draftOf(reread, definitions))
                setConflict(false)
                requestAnimationFrame(() => nameInput.current?.focus())
              }}
              testId="era-conflict"
            />
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="era-name">
              Name
            </label>
            <input
              id="era-name"
              ref={nameInput}
              className="field__input"
              dir="auto"
              placeholder="The Frieza Saga"
              value={draft.name}
              onChange={(event) => edit({ name: event.target.value })}
              aria-invalid={errorOf('name') ? true : undefined}
              aria-describedby={errorOf('name') ? 'era-name-error' : undefined}
              data-testid="era-name-input"
            />
            {errorOf('name') ? (
              <p className="field__error" id="era-name-error">
                {errorOf('name')}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="era-description">
              What happens then
            </label>
            <p className="field__hint">
              Who {entityName} is in this era, and what changes for them.
            </p>
            <textarea
              id="era-description"
              className="field__input field__input--area"
              rows={4}
              dir="auto"
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
              aria-invalid={errorOf('description') ? true : undefined}
              aria-describedby={errorOf('description') ? 'era-description-error' : undefined}
              data-testid="era-description-input"
            />
            {errorOf('description') ? (
              <p className="field__error" id="era-description-error">
                {errorOf('description')}
              </p>
            ) : null}
          </div>

          <fieldset className="scenechron">
            <legend className="field__label">When in the world</legend>
            <p className="field__hint">
              Optional, and either end may be left open. A year on its own covers the whole year.
            </p>
            <EraPoint
              label="From"
              prefix="era-start"
              errorKey={`${key}.start`}
              chronology={chronology}
              value={draft.start}
              fieldErrors={fieldErrors}
              onChange={(start) => edit({ start })}
            />
            <EraPoint
              label="To"
              prefix="era-end"
              errorKey={`${key}.end`}
              chronology={chronology}
              value={draft.end}
              fieldErrors={fieldErrors}
              onChange={(end) => edit({ end })}
            />
          </fieldset>

          <EraStories
            universeId={universeId}
            stories={draft.stories}
            scenes={draft.scenes}
            onChange={(stories, scenes) => edit({ stories, scenes })}
            storyError={errorOf('storyIds')}
            sceneError={errorOf('sceneIds')}
          />

          {definitions.length > 0 ? (
            <fieldset className="erafields" data-testid="era-fields">
              <legend className="field__label">Details in this era</legend>
              <p className="field__hint">
                A detail this era doesn&rsquo;t set reads from {entityName}&rsquo;s main profile. No
                other era is consulted.
              </p>
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
            </fieldset>
          ) : null}
        </div>

        <footer className="drawer__actions">
          <button
            ref={saveButton}
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="save-era"
          >
            {isSaving ? 'Saving' : era ? 'Save era' : 'Add era'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-era"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function EraPoint({
  label,
  prefix,
  errorKey,
  chronology,
  value,
  fieldErrors,
  onChange,
}: {
  label: string
  prefix: string
  errorKey: string
  chronology: Chronology
  value: ChronologyPointDraft
  fieldErrors: Record<string, string>
  onChange: (next: ChronologyPointDraft) => void
}) {
  const error = (part: string) => fieldErrors[`${errorKey}.${part}`.toLowerCase()]

  return (
    <fieldset className="erapoint" data-testid={prefix}>
      <legend className="erapoint__label">{label}</legend>
      <ChronologyPointFields
        chronology={chronology}
        ids={{
          eraId: `${prefix}-eraId`,
          year: `${prefix}-year`,
          month: `${prefix}-month`,
          day: `${prefix}-day`,
        }}
        eraLabel={`${label}: date period`}
        yearLabel={`${label}: year`}
        value={value}
        onChange={(part: ChronologyPointPart, next: string) => onChange({ ...value, [part]: next })}
        errors={{
          eraId: error('eraId'),
          year: error('year'),
          month: error('month'),
          day: error('day'),
        }}
      />
    </fieldset>
  )
}

const MODE_LABELS: Record<Mode, string> = {
  inherit: 'From the main profile',
  set: 'Set for this era',
  cleared: 'None in this era',
}

function EraFieldRow({
  definition,
  field,
  inherited,
  universeId,
  entityId,
  chronology,
  error,
  onChange,
}: {
  definition: FieldDefinition
  field: FieldDraft
  inherited: FieldValue | null
  universeId: string
  entityId: string
  chronology: Chronology
  error?: string
  onChange: (change: Partial<FieldDraft>) => void
}) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="erafield" data-testid={`era-field-${definition.name}`}>
      <div className="erafield__head">
        <label className="erafield__name" htmlFor={id}>
          {definition.name}
        </label>
        <select
          id={id}
          className="field__input field__input--select erafield__mode"
          value={field.mode}
          onChange={(event) => onChange({ mode: event.target.value as Mode })}
          aria-label={`${definition.name} in this era`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={`era-field-mode-${definition.name}`}
        >
          {(['inherit', 'set', 'cleared'] as Mode[])
            .filter((mode) => mode !== 'cleared' || !definition.isRequired)
            .map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
        </select>
      </div>

      {field.mode === 'inherit' ? (
        <p className="erafield__inherited">
          {inherited ? renderFact(inherited, chronology) : 'Not set on the main profile'}
        </p>
      ) : field.mode === 'set' ? (
        <FieldInput
          definition={definition}
          value={field.value}
          universeId={universeId}
          excludeId={entityId}
          heldReference={field.held}
          chronology={chronology}
          onChange={(value) => onChange({ value })}
        />
      ) : (
        <p className="erafield__inherited">Left empty in this era.</p>
      )}

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The stories an era covers, and scenes of those stories: each chosen one as a token with Remove, the universe's other live
 * stories to add, and the chosen stories' scenes in reading order. A story or scene in the Trash stays chosen and says so; it
 * is never offered.
 */
function EraStories({
  universeId,
  stories,
  scenes,
  onChange,
  storyError,
  sceneError,
}: {
  universeId: string
  stories: EraStory[]
  scenes: EraScene[]
  onChange: (stories: EraStory[], scenes: EraScene[]) => void
  storyError?: string
  sceneError?: string
}) {
  const storySelect = useId()
  const sceneSelect = useId()
  const [available, setAvailable] = useState<StorySummary[] | null>(null)
  const [storyScenes, setStoryScenes] = useState<Record<string, EraScene[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setAvailable)
      .catch(() => {
        if (!controller.signal.aborted) setAvailable([])
      })
    return () => controller.abort()
  }, [universeId])

  const storyKey = stories.map((story) => story.id).join(',')

  useEffect(() => {
    const controller = new AbortController()
    for (const story of stories) {
      if (story.isTrashed || storyScenes[story.id]) continue
      getStory(universeId, story.id, controller.signal)
        .then((detail) =>
          setStoryScenes((current) => ({
            ...current,
            [story.id]: readingOrder(detail.chapters, detail.scenes).map((scene) => ({
              id: scene.id,
              storyId: detail.id,
              title: scene.title,
              storyTitle: detail.title,
              isTrashed: false,
            })),
          })),
        )
        .catch(() => undefined)
    }
    return () => controller.abort()
    // Read again only when the chosen stories change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId, storyKey])

  const chosenStories = new Set(stories.map((story) => story.id))
  const chosenScenes = new Set(scenes.map((scene) => scene.id))
  const offeredStories = (available ?? []).filter((story) => !chosenStories.has(story.id))
  const offeredScenes = stories.flatMap((story) =>
    (storyScenes[story.id] ?? []).filter((scene) => !chosenScenes.has(scene.id)),
  )

  return (
    <>
      <div className="field storylinks" data-testid="era-stories">
        <label className="field__label" htmlFor={storySelect}>
          Stories
        </label>
        <p className="field__hint">The stories this era covers, if any.</p>
        {stories.length > 0 ? (
          <ul className="storylinks__list">
            {stories.map((story) => (
              <li className="token" key={story.id} data-testid="era-story">
                <bdi>{story.title}</bdi>
                {story.isTrashed ? <span className="token__note"> (in Trash)</span> : null}
                <button
                  type="button"
                  className="token__remove"
                  aria-label={`Remove ${story.title}`}
                  onClick={() =>
                    onChange(
                      stories.filter((one) => one.id !== story.id),
                      scenes.filter((scene) => scene.storyId !== story.id),
                    )
                  }
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <select
          id={storySelect}
          className="field__input field__input--select"
          value=""
          disabled={available === null || offeredStories.length === 0}
          onChange={(event) => {
            const story = offeredStories.find((one) => one.id === event.target.value)
            if (story)
              onChange([...stories, { id: story.id, title: story.title, isTrashed: false }], scenes)
          }}
          aria-invalid={storyError ? true : undefined}
          aria-describedby={storyError ? `${storySelect}-error` : undefined}
          data-testid="era-story-add"
        >
          <option value="">
            {available === null
              ? 'Reading stories…'
              : available.length === 0
                ? 'No stories yet'
                : offeredStories.length === 0
                  ? 'Every story is chosen'
                  : 'Add a story…'}
          </option>
          {offeredStories.map((story) => (
            <option key={story.id} value={story.id}>
              {story.title}
            </option>
          ))}
        </select>
        {storyError ? (
          <p className="field__error" id={`${storySelect}-error`}>
            {storyError}
          </p>
        ) : null}
      </div>

      {stories.length > 0 ? (
        <div className="field storylinks" data-testid="era-scenes">
          <label className="field__label" htmlFor={sceneSelect}>
            Scenes
          </label>
          <p className="field__hint">
            Scenes of those stories that fall in this era, if you want to name them.
          </p>
          {scenes.length > 0 ? (
            <ul className="storylinks__list">
              {scenes.map((scene) => (
                <li className="token" key={scene.id} data-testid="era-scene">
                  <bdi>{scene.title}</bdi>
                  {scene.isTrashed ? <span className="token__note"> (in Trash)</span> : null}
                  <button
                    type="button"
                    className="token__remove"
                    aria-label={`Remove ${scene.title}`}
                    onClick={() =>
                      onChange(
                        stories,
                        scenes.filter((one) => one.id !== scene.id),
                      )
                    }
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <select
            id={sceneSelect}
            className="field__input field__input--select"
            value=""
            disabled={offeredScenes.length === 0}
            onChange={(event) => {
              const scene = offeredScenes.find((one) => one.id === event.target.value)
              if (scene) onChange(stories, [...scenes, scene])
            }}
            aria-invalid={sceneError ? true : undefined}
            aria-describedby={sceneError ? `${sceneSelect}-error` : undefined}
            data-testid="era-scene-add"
          >
            <option value="">
              {offeredScenes.length === 0 ? 'No more scenes to add' : 'Add a scene…'}
            </option>
            {stories.map((story) => {
              const options = (storyScenes[story.id] ?? []).filter(
                (scene) => !chosenScenes.has(scene.id),
              )
              return options.length === 0 ? null : (
                <optgroup key={story.id} label={story.title}>
                  {options.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.title}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
          {sceneError ? (
            <p className="field__error" id={`${sceneSelect}-error`}>
              {sceneError}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
