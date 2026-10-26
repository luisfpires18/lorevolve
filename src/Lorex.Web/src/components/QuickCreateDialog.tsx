import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { emptyValue } from '../lore/document'
import { createEntity, listEntities, listEntityTypeGroups, listEntityTypes } from '../lore/api'
import { branchIds, buildTypeTree } from '../lore/typeTree'
import {
  CanonStatus,
  type EntitySummary,
  type EntityType,
  type FieldValueInput,
} from '../lore/types'
import type { EntityChoice } from './EntityPicker'
import { Field } from './Field'
import { FieldInput } from './FieldInputs'

interface Props {
  universeId: string
  /** What was typed in the picker: the new entry's name to start from. */
  initialName: string
  /** The picker's own limit, exactly as it searches: one type and its nested types, one semantic group, or neither. */
  entityTypeId: string | null
  entityTypeGroupId: string | null
  chronology: Chronology
  /** The entry exists: the server's answer, never a lookup by name. */
  onCreated: (choice: EntityChoice) => void
  /** An entry that was already there, picked instead of making a second. */
  onChooseExisting: (choice: EntityChoice) => void
  onCancel: () => void
}

type Types = { kind: 'loading' } | { kind: 'ready'; eligible: EntityType[] } | { kind: 'error' }

const SIMILAR_LIMIT = 5

/** Two names that a person would take for the same one: the same letters, or one the start of the other. */
function looksLike(a: string, b: string) {
  const x = a.trim().toLocaleLowerCase()
  const y = b.trim().toLocaleLowerCase()
  return x !== '' && y !== '' && (x === y || x.startsWith(y) || y.startsWith(x))
}

/**
 * Quick Create (Issue #25): a missing entry made from the picker that needed it, without leaving the form the picker is
 * in. Create now, enrich later - only the name, the type when there is a choice, and the type's active required fields.
 *
 * It is an ordinary create: the same `createEntity` the full form posts, so the server checks the type, the fields, the
 * links and the access exactly as it does there, and the entry is a normal Idea from the moment it exists. Nothing here
 * saves the form underneath. The types offered are the picker's own limit as it is now: the type and the types nested
 * beneath it, the members of the group, or every type. Its own link fields search existing entries only, so a create
 * never opens another create.
 */
export function QuickCreateDialog({
  universeId,
  initialName,
  entityTypeId,
  entityTypeGroupId,
  chronology,
  onCreated,
  onChooseExisting,
  onCancel,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nameId = useId()
  const headingId = useId()
  const typeId = useId()
  const [types, setTypes] = useState<Types>({ kind: 'loading' })
  const [name, setName] = useState(initialName.trim())
  const [chosenTypeId, setChosenTypeId] = useState<string>('')
  const [values, setValues] = useState<Record<string, FieldValueInput>>({})
  const [similar, setSimilar] = useState<EntitySummary[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // A create on its way. Read synchronously, so a second press, Escape or a press on the backdrop in the same instant as
  // Create is still refused: the request is out and its answer decides what happens next, not the author.
  const sending = useRef(false)
  // Gone - closed by leaving the page while a create was out. Its late answer then chooses nothing.
  const gone = useRef(false)
  const messageRef = useRef<HTMLParagraphElement>(null)

  // A type taken because it was the only one is not a change the author made.
  const takenTypeId =
    types.kind === 'ready' && types.eligible.length === 1 ? types.eligible[0].id : ''
  const isDirty =
    payloadKey({ name: name.trim(), chosenTypeId, values }) !==
    payloadKey({ name: initialName.trim(), chosenTypeId: takenTypeId, values: {} })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    'This new entry has not been created. Leave without creating it?',
    onCancel,
  )

  // While a create is out there is nothing to close: Cancel is disabled with the rest of the form, and Escape and the
  // backdrop are swallowed here before the drawer guard sees them.
  const guardedProps = {
    onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
      if (sending.current && event.key === 'Escape') event.preventDefault()
      else dialogProps.onKeyDown(event)
    },
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      if (sending.current) event.preventDefault()
      else dialogProps.onCancel(event)
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      if (!sending.current) dialogProps.onClick(event)
    },
  }

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById(nameId)?.focus()
  }, [nameId])

  // Set again on every mount: development's double mount runs the cleanup once in between.
  useEffect(() => {
    gone.current = false
    return () => {
      gone.current = true
    }
  }, [])

  // A refusal or a failure takes the focus to what it says, since the button that was pressed was disabled under it.
  useEffect(() => {
    if (message) messageRef.current?.focus()
  }, [message])

  // The types as they are now, read when the form opens: a group's members today, never its name.
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listEntityTypes(universeId, controller.signal),
      entityTypeGroupId ? listEntityTypeGroups(universeId, controller.signal) : null,
    ])
      .then(([all, groups]) => {
        const tree = buildTypeTree(all)
        const target = entityTypeId ? tree.byId.get(entityTypeId) : undefined
        // A type limit takes its nested types too (Issue #61): the type and its branch, in the hierarchy's order.
        const members = entityTypeId
          ? target
            ? branchIds(target)
            : new Set<string>()
          : entityTypeGroupId
            ? new Set(groups?.find((group) => group.id === entityTypeGroupId)?.typeIds ?? [])
            : null
        const eligible = (entityTypeId ? tree.ordered.map((node) => node.type) : all).filter(
          (type) => !members || members.has(type.id),
        )
        setTypes({ kind: 'ready', eligible })
        // One type to choose from is no choice: it is taken, never asked again.
        if (eligible.length === 1) setChosenTypeId(eligible[0].id)
      })
      .catch(() => {
        if (!controller.signal.aborted) setTypes({ kind: 'error' })
      })
    return () => controller.abort()
  }, [universeId, entityTypeId, entityTypeGroupId])

  // Entries already here under a name like this one, among those the picker would offer. Advice only: a second entry of
  // the same name is allowed, and what this shows can change before Create is pressed.
  useEffect(() => {
    const search = name.trim()
    if (!search) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universeId,
        {
          search,
          entityTypeId,
          includeDescendants: true,
          entityTypeGroupId,
          canonStatus: null,
          tag: null,
          page: 1,
        },
        controller.signal,
      )
        .then((page) =>
          setSimilar(
            page.items.filter((item) => looksLike(item.name, search)).slice(0, SIMILAR_LIMIT),
          ),
        )
        .catch(() => {
          /* Advice that could not be read is simply not given. */
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, name, entityTypeId, entityTypeGroupId])

  // Cleared name, no advice: what was found for an earlier name is not shown for none.
  const shownSimilar = name.trim() ? similar : []
  const eligible = types.kind === 'ready' ? types.eligible : []
  const chosenType = eligible.find((type) => type.id === chosenTypeId) ?? null
  // Only what the type requires, from its active fields: an archived field is in no form.
  const required = chosenType?.fields.filter((definition) => definition.isRequired) ?? []

  async function create() {
    if (sending.current) return
    if (!chosenType) {
      setFieldErrors({ entitytypeid: 'Choose what kind of entry this is.' })
      setMessage(null)
      return
    }

    sending.current = true
    setIsSaving(true)
    setMessage(null)
    setFieldErrors({})

    try {
      const created = await createEntity(universeId, {
        entityTypeId: chosenType.id,
        name: name.trim(),
        summary: null,
        canonStatus: CanonStatus.Idea,
        aliases: [],
        tags: [],
        // Every active field, as the full form sends them: what was filled in here, the rest at its default.
        fields: chosenType.fields.map(
          (definition) => values[definition.id] ?? emptyValue(definition),
        ),
      })
      // Exactly the entry the server made, from its answer. Nothing is chosen for a form that has already gone.
      if (!gone.current)
        onCreated({ id: created.id, name: created.name, typeName: created.entityTypeName })
    } catch (error: unknown) {
      sending.current = false
      if (gone.current) return
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be created.',
        )
      } else {
        setMessage('The entry couldn’t be created. Check your connection and try again.')
      }
    } finally {
      if (!gone.current) setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer quickcreate"
      ref={dialog}
      aria-labelledby={headingId}
      {...guardedProps}
      data-testid="quick-create-dialog"
    >
      <form
        className="drawer__panel"
        aria-busy={isSaving}
        onSubmit={(event) => {
          event.preventDefault()
          // The form it opened from is not a form element, but the event still travels up React's tree to it.
          event.stopPropagation()
          void create()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">Quick create</p>
          <h2 className="drawer__title" id={headingId}>
            New entry
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p
              className="form__message"
              role="alert"
              tabIndex={-1}
              ref={messageRef}
              data-testid="quick-create-error"
            >
              {message}
            </p>
          ) : null}

          <p className="quickcreate__pending" role="status" data-testid="quick-create-pending">
            {isSaving ? 'Creating the entry. This can’t be closed until LoreX answers.' : null}
          </p>

          {/* Everything the create was sent with stays as it was sent until the answer comes. */}
          <fieldset className="quickcreate__inputs" disabled={isSaving}>
            <p className="quickcreate__note">
              It’s saved as soon as you create it. Add its article and other details later from its
              own page.
            </p>

            <Field
              label="Name"
              name={nameId}
              dir="auto"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              data-testid="quick-create-name"
            />

            {shownSimilar.length > 0 ? (
              <div
                className="callout callout--warning quickcreate__similar"
                data-testid="quick-create-similar"
              >
                <p className="callout__title">Something with this name is already here</p>
                <p>
                  Choose it instead, or create a new entry anyway. Two entries can share a name.
                </p>
                <ul className="quickcreate__matches">
                  {shownSimilar.map((item) => (
                    <li key={item.id}>
                      <span className="quickcreate__match">
                        <bdi>{item.name}</bdi>{' '}
                        <span className="picker__kind">
                          <bdi>{item.entityTypeName}</bdi>
                        </span>
                      </span>
                      <button
                        className="button button--secondary button--sm"
                        type="button"
                        onClick={() =>
                          onChooseExisting({
                            id: item.id,
                            name: item.name,
                            typeName: item.entityTypeName,
                          })
                        }
                        aria-label={`Use ${item.name}, ${item.entityTypeName}`}
                        data-testid={`quick-create-use-${item.name}`}
                      >
                        Use this one
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {types.kind === 'loading' ? (
              <p className="field__hint" role="status">
                Reading the types…
              </p>
            ) : types.kind === 'error' ? (
              <p className="form__message" role="alert">
                The types couldn’t be read. Close this and try again.
              </p>
            ) : eligible.length === 0 ? (
              <p className="form__message" role="alert" data-testid="quick-create-no-types">
                No type can be created here. This field only takes entries of a type that no longer
                exists, or of a group with no types in it. Change that under Types.
              </p>
            ) : eligible.length === 1 ? (
              <p className="quickcreate__type" data-testid="quick-create-type">
                <span className="field__label">Type</span> <bdi>{eligible[0].name}</bdi>
              </p>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor={typeId}>
                  Type
                </label>
                <select
                  id={typeId}
                  className="field__input field__input--select"
                  value={chosenTypeId}
                  onChange={(event) => {
                    setChosenTypeId(event.target.value)
                    setFieldErrors({})
                  }}
                  aria-invalid={fieldErrors.entitytypeid ? true : undefined}
                  data-testid="quick-create-type-select"
                >
                  <option value="">Choose a type</option>
                  {eligible.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.entitytypeid ? (
                  <p className="field__error">{fieldErrors.entitytypeid}</p>
                ) : null}
              </div>
            )}

            {required.length > 0 ? (
              <div className="quickcreate__fields" data-testid="quick-create-fields">
                {required.map((definition) => (
                  <div key={definition.id}>
                    {/* No quick create in here: a link field picks an existing entry. */}
                    <FieldInput
                      definition={definition}
                      value={values[definition.id] ?? emptyValue(definition)}
                      universeId={universeId}
                      chronology={chronology}
                      onChange={(next) =>
                        setValues((current) => ({ ...current, [definition.id]: next }))
                      }
                    />
                    {fieldErrors[definition.id] ? (
                      <p className="field__error">{fieldErrors[definition.id]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </fieldset>
        </div>

        <footer className="drawer__actions">
          <button
            className="button"
            type="submit"
            disabled={isSaving || eligible.length === 0}
            data-testid="quick-create-submit"
          >
            {isSaving ? 'Creating' : 'Create'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            disabled={isSaving}
            data-testid="quick-create-cancel"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
