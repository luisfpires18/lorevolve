import { useEffect, useRef, useState } from 'react'
import { EditConflict } from './EditConflict'
import { MomentPick } from './MomentPick'
import { ScenePicks } from './ScenePicks'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { isChangedElsewhere } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import {
  abilityInputOf,
  appearanceInputOf,
  eraInputOf,
  formInputOf,
  getProgression,
  PROGRESSION_CHANGED,
  saveProgression,
} from '../progression/api'
import type {
  Ability,
  AbilityInput,
  Appearance,
  AppearanceInput,
  EraScene,
  Form,
  FormInput,
  MomentRef,
  Progression,
} from '../progression/types'

type Kind = 'form' | 'ability' | 'appearance'

type Item = Form | Ability | Appearance

function nameOf(item: Item) {
  return 'label' in item ? item.label : item.name
}

function listOf(progression: Progression, kind: Kind): Item[] {
  return kind === 'form'
    ? progression.forms
    : kind === 'ability'
      ? progression.abilities
      : progression.appearances
}

interface ItemDraft {
  name: string
  description: string
  unlockEraId: string
  unlockScene: EraScene[]
  unlockMoment: MomentRef | null
  eraIds: string[]
  scenes: EraScene[]
  formIds: string[]
}

function draftOf(item: Item | null): ItemDraft {
  const unlock = item && 'unlock' in item ? item.unlock : null
  return {
    name: item ? nameOf(item) : '',
    description: (item && ('notes' in item ? item.notes : item.description)) ?? '',
    unlockEraId: unlock?.era?.id ?? '',
    unlockScene: unlock?.scene ? [unlock.scene] : [],
    unlockMoment: unlock?.moment ?? null,
    eraIds: item?.eras.map((era) => era.id) ?? [],
    scenes: item?.scenes ?? [],
    formIds: item && 'forms' in item ? item.forms.map((form) => form.id) : [],
  }
}

function inputOf(draft: ItemDraft, id: string | null): AbilityInput {
  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    unlockEraId: draft.unlockEraId || null,
    unlockSceneId: draft.unlockScene[0]?.id ?? null,
    unlockMomentId: draft.unlockMoment?.id ?? null,
    eraIds: draft.eraIds,
    sceneIds: draft.scenes.map((scene) => scene.id),
    formIds: draft.formIds,
  }
}

/** The parts of a form or ability that show their own error; any other refusal is said in the message above them. */
const SHOWN = [
  'name',
  'description',
  'unlockEraId',
  'unlockSceneId',
  'unlockMomentId',
  'eraIds',
  'sceneIds',
  'formIds',
]

/** The server's limit on what a form or ability is (`ProgressionLimits.DescriptionMaxLength`). */
const DESCRIPTION_MAX = 10000

const WORDS: Record<Kind, { one: string; placeholder: string; list: string }> = {
  form: { one: 'form', placeholder: 'Super Saiyan 3', list: 'forms' },
  ability: { one: 'ability', placeholder: 'Instant Transmission', list: 'abilities' },
  appearance: { one: 'appearance', placeholder: 'Battle armour', list: 'appearances' },
}

/** An appearance's name and description are its label and notes (Issue #43), in its errors too. */
function partOf(kind: Kind, part: string) {
  if (kind !== 'appearance') return part
  return part === 'name' ? 'label' : part === 'description' ? 'notes' : part
}

/**
 * One form or one ability of an entry (Issue #42), in the drawer every LorEvolve form uses: what it is; when it was first unlocked
 * - an era of the entry, a scene, a timeline moment, each optional; the eras it is available in, ticked one by one (a shortcut
 * ticks an era and every later one, and what is saved is still the ticks); the scenes it is used in; and, for an ability, the
 * forms it belongs to. Nothing is filled in from anything else. The save is the whole progression over the version read.
 *
 * An appearance (Issue #43) is the same drawer without a first unlock: its label, notes, eras, forms and scenes. Its pictures
 * are added on the appearance itself, once it is saved.
 */
export function ProgressionItemForm({
  universeId,
  entityId,
  entityName,
  progression,
  kind,
  item,
  onClose,
  onSaved,
}: {
  universeId: string
  entityId: string
  entityName: string
  progression: Progression
  kind: Kind
  item: Item | null
  onClose: () => void
  onSaved: (progression: Progression) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const words = WORDS[kind]
  const [base, setBase] = useState(progression)
  const [initial, setInitial] = useState(() => draftOf(item))
  const [draft, setDraft] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  const isDirty = payloadKey(inputOf(draft, null)) !== payloadKey(inputOf(initial, null))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    item
      ? `“${nameOf(item)}” has unsaved changes. Leave without saving them?`
      : `This new ${words.one} has not been saved. Leave without saving it?`,
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    nameInput.current?.focus()
  }, [])

  const list = listOf(base, kind)
  const index = item ? list.findIndex((one) => one.id === item.id) : -1
  const key = `${words.list}[${index === -1 ? list.length : index}]`
  const errorOf = (part: string) => fieldErrors[`${key}.${partOf(kind, part)}`.toLowerCase()]
  const isLook = kind === 'appearance'

  function edit(change: Partial<ItemDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function toggle(list: string[], id: string, on: boolean) {
    return on ? [...new Set([...list, id])] : list.filter((one) => one !== id)
  }

  /** Ticks the era chosen as the first unlock and every era after it in the author's order - explicit ticks, saved as such. */
  function fromUnlockOn() {
    const at = base.eras.findIndex((era) => era.id === draft.unlockEraId)
    if (at === -1) return
    edit({ eraIds: [...new Set([...draft.eraIds, ...base.eras.slice(at).map((era) => era.id)])] })
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const mine = inputOf(draft, item?.id ?? null)
    const forms: FormInput[] = base.forms.map((form) => formInputOf(form))
    const abilities: AbilityInput[] = base.abilities.map((ability) => abilityInputOf(ability))
    const appearances: AppearanceInput[] = base.appearances.map((one) => appearanceInputOf(one))

    if (kind === 'appearance') {
      const look: AppearanceInput = {
        id: mine.id,
        label: mine.name,
        notes: mine.description,
        eraIds: mine.eraIds,
        formIds: mine.formIds,
        sceneIds: mine.sceneIds,
      }
      const at = appearances.findIndex((one) => one.id === item?.id)
      if (at === -1) appearances.push(look)
      else appearances[at] = look
    } else if (kind === 'form') {
      // A form carries no forms of its own.
      const { formIds: _forms, ...form } = mine
      const at = forms.findIndex((one) => one.id === item?.id)
      if (at === -1) forms.push(form)
      else forms[at] = form
    } else {
      const at = abilities.findIndex((one) => one.id === item?.id)
      if (at === -1) abilities.push(mine)
      else abilities[at] = mine
    }

    try {
      onSaved(
        await saveProgression(universeId, entityId, {
          eras: base.eras.map(eraInputOf),
          expectedVersion: base.version,
          forms,
          abilities,
          appearances,
        }),
      )
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        // A refusal no field below shows - this one removed meanwhile, say - is said here in its own words.
        const unshown = Object.entries(error.fieldErrors).find(
          ([name]) => !SHOWN.some((part) => name === `${key}.${partOf(kind, part)}`.toLowerCase()),
        )
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : (unshown?.[1] ?? `Some details need a change before this ${words.one} can be saved.`),
        )
      } else {
        setMessage(`That ${words.one} could not be saved.`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const heading = item ? nameOf(item) : `New ${words.one}`
  const unlockAt = base.eras.findIndex((era) => era.id === draft.unlockEraId)

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="item-heading"
      {...dialogProps}
      data-testid={`${kind}-form`}
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
            {item ? `A ${words.one} of ${entityName}` : `New ${words.one} of ${entityName}`}
          </p>
          <h2 className="drawer__title" id="item-heading">
            {heading}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid={`${kind}-error`}>
              {message}
            </p>
          ) : null}

          {conflict ? (
            <EditConflict
              what="eras"
              read={() => getProgression(universeId, entityId)}
              renderLatest={(latest) => (
                <ul className="namelist">
                  {listOf(latest, kind).map((one) => (
                    <li key={one.id}>{nameOf(one)}</li>
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
                const reread = listOf(latest, kind).find((one) => one.id === item?.id) ?? null
                setDraft(draftOf(reread))
                setInitial(draftOf(reread))
                setConflict(false)
                requestAnimationFrame(() => nameInput.current?.focus())
              }}
              testId={`${kind}-conflict`}
            />
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="item-name">
              {isLook ? 'Label' : 'Name'}
            </label>
            <input
              id="item-name"
              ref={nameInput}
              className="field__input"
              dir="auto"
              placeholder={words.placeholder}
              value={draft.name}
              onChange={(event) => edit({ name: event.target.value })}
              aria-invalid={errorOf('name') ? true : undefined}
              aria-describedby={errorOf('name') ? 'item-name-error' : undefined}
              data-testid={`${kind}-name-input`}
            />
            {errorOf('name') ? (
              <p className="field__error" id="item-name-error">
                {errorOf('name')}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="item-description">
              {isLook ? 'Notes' : 'What it is'}
            </label>
            <p className="field__hint">
              {kind === 'form'
                ? 'How it changes them: abilities, looks, strength. A form changes no detail of the entry.'
                : kind === 'ability'
                  ? 'What it does, and what it costs.'
                  : 'What it looks like, what it is made of, who made it.'}
            </p>
            <textarea
              id="item-description"
              className="field__input field__input--area"
              rows={4}
              dir="auto"
              maxLength={DESCRIPTION_MAX}
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
              aria-invalid={errorOf('description') ? true : undefined}
              aria-describedby={errorOf('description') ? 'item-description-error' : undefined}
              data-testid={`${kind}-description-input`}
            />
            {errorOf('description') ? (
              <p className="field__error" id="item-description-error">
                {errorOf('description')}
              </p>
            ) : null}
          </div>

          {isLook ? null : (
            <fieldset className="itemunlock" data-testid={`${kind}-unlock`}>
              <legend className="field__label">First unlocked</legend>
              <p className="field__hint">Each is optional. Say only what you know.</p>

              <div className="field">
                <label className="field__label" htmlFor="item-unlock-era">
                  In the era
                </label>
                <select
                  id="item-unlock-era"
                  className="field__input field__input--select"
                  value={draft.unlockEraId}
                  onChange={(event) => edit({ unlockEraId: event.target.value })}
                  aria-invalid={errorOf('unlockEraId') ? true : undefined}
                  data-testid={`${kind}-unlock-era`}
                >
                  <option value="">{base.eras.length === 0 ? 'No eras yet' : 'Not said'}</option>
                  {base.eras.map((era) => (
                    <option key={era.id} value={era.id}>
                      {era.name}
                    </option>
                  ))}
                </select>
                {errorOf('unlockEraId') ? (
                  <p className="field__error">{errorOf('unlockEraId')}</p>
                ) : null}
              </div>

              <ScenePicks
                universeId={universeId}
                label="In the scene"
                value={draft.unlockScene}
                onChange={(unlockScene) => edit({ unlockScene })}
                single
                error={errorOf('unlockSceneId')}
                testId={`${kind}-unlock-scene`}
              />

              <MomentPick
                universeId={universeId}
                label="At the timeline moment"
                value={draft.unlockMoment}
                onChange={(unlockMoment) => edit({ unlockMoment })}
                error={errorOf('unlockMomentId')}
                testId={`${kind}-unlock-moment`}
              />
            </fieldset>
          )}

          {base.eras.length > 0 ? (
            <fieldset className="itemeras" data-testid={`${kind}-eras`}>
              <legend className="field__label">{isLook ? 'Eras' : 'Available in'}</legend>
              <p className="field__hint">
                {isLook
                  ? 'Tick every era it belongs to. Nothing is assumed from the order of eras.'
                  : 'Tick every era it can be used in. Nothing is assumed from the order of eras or from when it was first unlocked.'}
              </p>
              {base.eras.map((era) => (
                <label className="check" key={era.id}>
                  <input
                    type="checkbox"
                    checked={draft.eraIds.includes(era.id)}
                    onChange={(event) =>
                      edit({ eraIds: toggle(draft.eraIds, era.id, event.target.checked) })
                    }
                    data-testid={`${kind}-era-${era.name}`}
                  />
                  {era.name}
                </label>
              ))}
              {!isLook && unlockAt !== -1 ? (
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={fromUnlockOn}
                  data-testid={`${kind}-eras-from-unlock`}
                >
                  Tick {base.eras[unlockAt].name} and every later era
                </button>
              ) : null}
              {errorOf('eraIds') ? <p className="field__error">{errorOf('eraIds')}</p> : null}
            </fieldset>
          ) : null}

          <ScenePicks
            universeId={universeId}
            label={isLook ? 'Seen in scenes' : 'Used in scenes'}
            hint={
              isLook
                ? 'Scenes where it is worn or seen.'
                : 'Scenes where it is used or active. Being available and being used are kept apart.'
            }
            value={draft.scenes}
            onChange={(scenes) => edit({ scenes })}
            error={errorOf('sceneIds')}
            testId={`${kind}-scenes`}
          />

          {kind !== 'form' && base.forms.length > 0 ? (
            <fieldset className="itemeras" data-testid={`${kind}-forms`}>
              <legend className="field__label">
                {isLook ? 'A look of forms' : 'Belongs to forms'}
              </legend>
              <p className="field__hint">None, one or several.</p>
              {base.forms.map((form) => (
                <label className="check" key={form.id}>
                  <input
                    type="checkbox"
                    checked={draft.formIds.includes(form.id)}
                    onChange={(event) =>
                      edit({ formIds: toggle(draft.formIds, form.id, event.target.checked) })
                    }
                    data-testid={`${kind}-form-${form.name}`}
                  />
                  {form.name}
                </label>
              ))}
              {errorOf('formIds') ? <p className="field__error">{errorOf('formIds')}</p> : null}
            </fieldset>
          ) : null}
        </div>

        <footer className="drawer__actions">
          <button
            ref={saveButton}
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid={`save-${kind}`}
          >
            {isSaving ? 'Saving' : item ? `Save ${words.one}` : `Add ${words.one}`}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
