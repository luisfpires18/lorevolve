import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { FIELD_LAYOUT_CHANGED_CODE, saveFieldLayout } from '../lore/api'
import type { EntityType } from '../lore/types'

/** A section as the drawer edits it: `key` is its id, or a stand-in until a new one is saved. */
interface DraftSection {
  key: string
  id: string | null
  name: string
  startsCollapsed: boolean
}

/**
 * The type's layout as the drawer edits it. `placed` is every field, archived ones included, by the key of its section ('' for
 * none): an archived field is not shown here, but is sent where it is, so a restore after this save still finds its section.
 * `order` is every field's id in the type's order; a group's fields are the ones placed in it, in this order.
 */
function layoutOf(type: EntityType) {
  const all = [...type.fields, ...(type.archivedFields ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  )
  return {
    order: all.map((field) => field.id),
    sections: type.fieldSections.map((section): DraftSection => ({
      key: section.id,
      id: section.id,
      name: section.name,
      startsCollapsed: section.startsCollapsed,
    })),
    placed: Object.fromEntries(
      [...type.fields, ...(type.archivedFields ?? [])].map((field) => [
        field.id,
        field.sectionId ?? '',
      ]),
    ) as Record<string, string>,
  }
}

/**
 * A type's field sections (Issue #26) in the drawer every Lorex form uses: name, order, fold and remove sections, put each
 * field in one or in none, and order the fields within each. Saved at once, over the layout version it opened on; a layout someone saved since is refused, and
 * the author chooses between theirs and the saved one. Nothing here touches a field: its settings, values and version stay.
 */
export function FieldSectionsDialog({
  universeId,
  type,
  onClose,
  onChanged,
  onSaved,
}: {
  universeId: string
  /** The type as the list reads it now: after a refused save, the saved layout to compare with. */
  type: EntityType
  onClose: () => void
  onChanged: () => Promise<void>
  onSaved: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const added = useRef(0)
  const [base, setBase] = useState(() => ({
    layout: layoutOf(type),
    version: type.fieldLayoutVersion,
  }))
  const [sections, setSections] = useState(base.layout.sections)
  const [placed, setPlaced] = useState(base.layout.placed)
  const [order, setOrder] = useState(base.layout.order)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // The section name to focus once the render that shows it is on screen: a new one, or the first one refused.
  const focusKey = useRef<string | null>(null)

  const isDirty = payloadKey({ sections, placed, order }) !== payloadKey(base.layout)
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    `Your changes to the sections of “${type.name}” have not been saved. Leave without saving them?`,
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    if (focusKey.current === null) return
    document.getElementById(`section-name-${focusKey.current}`)?.focus()
    focusKey.current = null
  })

  function patch(key: string, part: Partial<DraftSection>) {
    setSections((current) =>
      current.map((section) => (section.key === key ? { ...section, ...part } : section)),
    )
  }

  function move(index: number, step: number) {
    setSections((current) => {
      const next = [...current]
      const [moving] = next.splice(index, 1)
      next.splice(index + step, 0, moving)
      return next
    })
  }

  /** Puts a field in another section, or none, last there. */
  function place(fieldId: string, key: string) {
    setPlaced((current) => ({ ...current, [fieldId]: key }))
    setOrder((current) => [...current.filter((id) => id !== fieldId), fieldId])
  }

  /** Swaps a field with the one shown before or after it in its own group. */
  function shift(fieldId: string, step: number) {
    setOrder((current) => {
      const shown = current.filter((id) => active.has(id) && placed[id] === placed[fieldId])
      const neighbour = shown[shown.indexOf(fieldId) + step]
      if (!neighbour) return current
      return current.map((id) => (id === fieldId ? neighbour : id === neighbour ? fieldId : id))
    })
  }

  function add() {
    added.current += 1
    const key = `new-${added.current}`
    setSections((current) => [...current, { key, id: null, name: '', startsCollapsed: false }])
    focusKey.current = key
  }

  /** Takes a section out of the draft; its fields go back among the ungrouped ones, as the save will say. */
  function remove(key: string) {
    setSections((current) => current.filter((section) => section.key !== key))
    setPlaced((current) =>
      Object.fromEntries(
        Object.entries(current).map(([fieldId, at]) => [fieldId, at === key ? '' : at]),
      ),
    )
  }

  function takeSaved() {
    const layout = layoutOf(type)
    setBase({ layout, version: type.fieldLayoutVersion })
    setSections(layout.sections)
    setPlaced(layout.placed)
    setOrder(layout.order)
    setErrors({})
    setMessage(null)
    setStale(false)
  }

  function keepMine() {
    setBase((current) => ({ ...current, version: type.fieldLayoutVersion }))
    setStale(false)
    setMessage('Your changes are kept. Saving now replaces the saved sections with these.')
  }

  async function save() {
    setMessage(null)
    setStale(false)
    const found: Record<string, string> = {}
    const names = new Set<string>()
    for (const section of sections) {
      const name = section.name.trim().toLowerCase()
      if (!name) found[section.key] = 'Give the section a name.'
      else if (names.has(name)) found[section.key] = 'Another section already has this name.'
      names.add(name)
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      focusKey.current = sections.find((section) => found[section.key])!.key
      return
    }

    setIsSaving(true)
    try {
      await saveFieldLayout(
        universeId,
        type.id,
        sections.map((section) => ({
          id: section.id,
          name: section.name.trim(),
          startsCollapsed: section.startsCollapsed,
          fieldIds: order.filter((fieldId) => placed[fieldId] === section.key),
        })),
        order.filter((fieldId) => placed[fieldId] === ''),
        base.version,
      )
      await onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_LAYOUT_CHANGED_CODE) {
        setMessage(
          'Someone changed these sections after you opened them. Nothing was saved, and your changes are still here.',
        )
        setStale(true)
        await onChanged().catch(() => undefined)
      } else if (error instanceof ApiError) {
        // A section's name refused by the API, under that section; anything else in one line.
        const mapped: Record<string, string> = {}
        for (const [key, text] of Object.entries(error.fieldErrors)) {
          const at = /^sections\[(\d+)\]\.name$/.exec(key)
          if (at && sections[Number(at[1])]) mapped[sections[Number(at[1])].key] = text
        }
        setErrors(mapped)
        setMessage(error.message)
      } else {
        setMessage('These sections could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const sectionLabel = (section: DraftSection, index: number) =>
    section.name.trim() || `Section ${index + 1}`

  // The active fields, as the drawer shows them: grouped like the form - no section first, then each section - in order.
  const active = new Map(type.fields.map((field) => [field.id, field]))
  const groups = [
    { key: '', label: 'No section' },
    ...sections.map((section, index) => ({
      key: section.key,
      label: sectionLabel(section, index),
    })),
  ]
    .map((group) => ({
      ...group,
      fields: order
        .filter((id) => active.has(id) && (placed[id] ?? '') === group.key)
        .map((id) => active.get(id)!),
    }))
    .filter((group) => group.fields.length > 0)

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="sections-heading"
      {...dialogProps}
      data-testid="sections-dialog"
    >
      <form
        className="drawer__panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            <bdi>{type.name}</bdi> fields
          </p>
          <h2 className="drawer__title" id="sections-heading">
            Sections
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="sections-dialog-error">
              {message}
            </p>
          ) : null}

          {stale ? (
            <div className="callout callout--warning" data-testid="sections-dialog-stale">
              <p className="callout__title">Saved now</p>
              <p className="fieldconflict__saved">
                {type.fieldSections.length === 0
                  ? 'No sections.'
                  : type.fieldSections.map((section) => section.name).join(', ')}
              </p>
              <p className="types__blockedlinks">
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  onClick={takeSaved}
                  data-testid="sections-use-saved"
                >
                  Use the saved sections
                </button>
                <button
                  className="button button--text button--sm"
                  type="button"
                  onClick={keepMine}
                  data-testid="sections-keep-mine"
                >
                  Keep my changes
                </button>
              </p>
            </div>
          ) : null}

          <p className="field__hint">
            Sections and order arrange this type&rsquo;s fields in forms and on entries. Fields in
            no section come first. Nothing about a field or its values changes.
          </p>

          <section className="drawer__group" aria-labelledby="sections-list">
            <h3 className="sectionrule sectionrule--accent" id="sections-list">
              Sections
            </h3>
            {sections.length === 0 ? (
              <p className="settings__note">No sections. Every field shows in one list.</p>
            ) : (
              <ol className="sectionlist">
                {sections.map((section, index) => (
                  <li
                    className="sectionlist__row"
                    key={section.key}
                    data-testid={`section-row-${index}`}
                  >
                    <Field
                      label="Section name"
                      name={`section-name-${section.key}`}
                      dir="auto"
                      value={section.name}
                      onChange={(event) => patch(section.key, { name: event.target.value })}
                      error={errors[section.key]}
                      data-testid={`section-name-${index}`}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={section.startsCollapsed}
                        onChange={(event) =>
                          patch(section.key, { startsCollapsed: event.target.checked })
                        }
                        data-testid={`section-collapsed-${index}`}
                      />
                      <span>Starts collapsed</span>
                    </label>
                    <span className="sectionlist__actions">
                      <button
                        className="iconbutton"
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${sectionLabel(section, index)} up`}
                        title="Move up"
                        data-testid={`section-up-${index}`}
                      >
                        <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                      </button>
                      <button
                        className="iconbutton"
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === sections.length - 1}
                        aria-label={`Move ${sectionLabel(section, index)} down`}
                        title="Move down"
                        data-testid={`section-down-${index}`}
                      >
                        <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                      </button>
                      <button
                        className="button button--text button--sm fieldlist__delete"
                        type="button"
                        onClick={() => remove(section.key)}
                        aria-label={`Remove ${sectionLabel(section, index)}`}
                        data-testid={`section-remove-${index}`}
                      >
                        <ActionIcon icon={Trash2} />
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <button
              className="button button--secondary button--sm sectionlist__add"
              type="button"
              onClick={add}
              data-testid="add-section"
            >
              <ActionIcon icon={Plus} />
              Add section
            </button>
          </section>

          {type.fields.length > 0 ? (
            <section className="drawer__group" aria-labelledby="sections-fields">
              <h3 className="sectionrule sectionrule--accent" id="sections-fields">
                Fields
              </h3>
              {groups.map((group) => (
                <div className="sectionfields__group" key={group.key || 'none'}>
                  <p className="sectionfields__label">
                    <bdi>{group.label}</bdi>
                  </p>
                  <ol
                    className="sectionfields"
                    aria-label={`Fields in ${group.label}`}
                    data-testid={`fields-in-${group.label}`}
                  >
                    {group.fields.map((field, index) => (
                      <li className="sectionfields__row" key={field.id}>
                        <label
                          className="sectionfields__name"
                          htmlFor={`field-section-${field.id}`}
                        >
                          <bdi>{field.name}</bdi>
                        </label>
                        <select
                          id={`field-section-${field.id}`}
                          className="field__input field__input--select"
                          value={placed[field.id] ?? ''}
                          onChange={(event) => place(field.id, event.target.value)}
                          data-testid={`place-${field.name}`}
                        >
                          <option value="">No section</option>
                          {sections.map((section, at) => (
                            <option key={section.key} value={section.key}>
                              {sectionLabel(section, at)}
                            </option>
                          ))}
                        </select>
                        <span className="sectionlist__actions">
                          <button
                            className="iconbutton"
                            type="button"
                            onClick={() => shift(field.id, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${field.name} up`}
                            title="Move up"
                            data-testid={`field-up-${field.name}`}
                          >
                            <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                          </button>
                          <button
                            className="iconbutton"
                            type="button"
                            onClick={() => shift(field.id, 1)}
                            disabled={index === group.fields.length - 1}
                            aria-label={`Move ${field.name} down`}
                            title="Move down"
                            data-testid={`field-down-${field.name}`}
                          >
                            <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-sections">
            {isSaving ? 'Saving…' : 'Save sections'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-sections"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
