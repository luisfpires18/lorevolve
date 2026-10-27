import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { getEntity } from '../lore/api'
import {
  MAX_FIELD_FILTERS,
  encodeFieldFilter,
  filterRule,
  filterableFields,
  isCompleteValue,
  opLabel,
  valueLabel,
  type FieldFilter,
  type FieldFilterOp,
} from '../lore/fieldFilters'
import type { EntityType, FieldDefinition } from '../lore/types'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EntityPicker, type EntityChoice } from './EntityPicker'

type EntryName = { name: string; typeName: string }

/**
 * Filtering a type's entries by its own fields (034), inside Lore's filters. It starts from what the author knows - a
 * field's name, from Add field filter - then asks only what that field can be compared by and against. Nothing changes
 * until Apply: an editor half filled in is this component's own, and only a whole filter reaches the address.
 *
 * Applied filters read as sentences ("Age is more than 30"), each with its own remove button. Editing one is removing it
 * and adding it again: fewer moving parts than editing in place, and the editor is a few keys away.
 *
 * Two pieces: the Add button, beside search and status, and below them the filters in force and the open editor. Both are
 * children of the filters' row, so on a phone the Filters button folds them with the rest.
 */
export function LoreFieldFilters({
  universeId,
  type,
  filters,
  onChange,
}: {
  universeId: string
  type: EntityType
  filters: FieldFilter[]
  /** Given a change to the filters, not the result: it is applied to the address as it is when it lands. */
  onChange: (change: (current: FieldFilter[]) => FieldFilter[]) => void
}) {
  const fields = filterableFields(type)
  const [editing, setEditing] = useState<FieldDefinition | null>(null)
  const [names, setNames] = useState<Record<string, EntryName | null>>({})
  const addRef = useRef<HTMLDivElement>(null)

  // A filter from the address names its entry by id only: read the names once each, for the sentence.
  const missing = filters
    .filter((filter) => {
      const field = type.fields.find((candidate) => candidate.id === filter.fieldId)
      return field && filterRule(field)?.control === 'entry' && !(filter.value in names)
    })
    .map((filter) => filter.value)
  const missingKey = [...new Set(missing)].join(',')
  useEffect(() => {
    if (!missingKey) return
    const controller = new AbortController()
    for (const id of missingKey.split(',')) {
      getEntity(universeId, id, controller.signal)
        .then((entity) =>
          setNames((known) => ({
            ...known,
            [id]: { name: entity.name, typeName: entity.entityTypeName },
          })),
        )
        .catch(() => {
          if (!controller.signal.aborted) setNames((known) => ({ ...known, [id]: null }))
        })
    }
    return () => {
      controller.abort()
    }
  }, [universeId, missingKey])

  // The type changed under an open editor: its field is not this type's.
  if (editing && !fields.some((field) => field.id === editing.id)) setEditing(null)

  if (fields.length === 0) return null

  const full = filters.length >= MAX_FIELD_FILTERS

  function close() {
    setEditing(null)
    addRef.current?.querySelector('button')?.focus()
  }

  return (
    <>
      <div className="lore__addfilter" ref={addRef}>
        {full ? (
          <p className="lore__filterlimit" data-testid="lore-field-filter-limit">
            Up to {MAX_FIELD_FILTERS} field filters at once.
          </p>
        ) : (
          <ActionMenu
            label="Add field filter"
            trigger={
              <>
                <ActionIcon icon={Plus} />
                Add field filter
              </>
            }
            triggerClassName="button button--secondary lore__addfiltertrigger"
            triggerTestId="lore-add-field-filter"
            panelTestId="lore-field-filter-menu"
          >
            {fields.map((field) => (
              <button
                key={field.id}
                className="actionmenu__item"
                type="button"
                onClick={() => setEditing(field)}
                data-testid="lore-field-filter-option"
              >
                <bdi>{field.name}</bdi>
              </button>
            ))}
          </ActionMenu>
        )}
      </div>

      {filters.length > 0 || editing ? (
        <div className="lore__fieldfilters">
          {filters.length > 0 ? (
            <ul
              className="lore__activefilters"
              aria-label="Field filters"
              data-testid="lore-field-filters"
            >
              {filters.map((filter, index) => {
                const field = type.fields.find((candidate) => candidate.id === filter.fieldId)
                if (!field) return null
                const sentence = `${field.name} ${opLabel(field, filter.op)} ${valueLabel(field, filter.value, names[filter.value])}`
                return (
                  <li
                    className="lore__activefilter"
                    key={`${index}-${filter.fieldId}`}
                    data-testid="lore-field-filter"
                  >
                    <span className="lore__activefiltertext">
                      <bdi>{field.name}</bdi> {opLabel(field, filter.op)}{' '}
                      <bdi>{valueLabel(field, filter.value, names[filter.value])}</bdi>
                    </span>
                    <button
                      className="lore__removefilter"
                      type="button"
                      aria-label={`Remove filter: ${sentence}`}
                      title="Remove filter"
                      onClick={() => {
                        const token = encodeFieldFilter(filter)
                        onChange((current) =>
                          current.filter((each) => encodeFieldFilter(each) !== token),
                        )
                      }}
                      data-testid="lore-remove-field-filter"
                    >
                      <X aria-hidden="true" focusable="false" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {editing ? (
            <FieldFilterEditor
              key={editing.id}
              universeId={universeId}
              field={editing}
              onApply={(filter, entry) => {
                if (entry) setNames((known) => ({ ...known, [filter.value]: entry }))
                onChange((current) => [...current, filter])
                close()
              }}
              onCancel={close}
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** One field's comparison and value, then Apply. Apply waits until the value is whole. */
function FieldFilterEditor({
  universeId,
  field,
  onApply,
  onCancel,
}: {
  universeId: string
  field: FieldDefinition
  onApply: (filter: FieldFilter, entry: EntryName | null) => void
  onCancel: () => void
}) {
  const rule = filterRule(field)!
  const [op, setOp] = useState<FieldFilterOp>(rule.ops[0].op)
  const [value, setValue] = useState('')
  const [entry, setEntry] = useState<EntityChoice | null>(null)
  const nameId = useId()
  const opId = useId()
  const valueId = useId()
  const form = useRef<HTMLFormElement>(null)

  // Opened from the menu: the value has the focus, the comparison already set to the likeliest one.
  useEffect(() => {
    form.current
      ?.querySelector<HTMLElement>('.lore__fieldeditorvalue input, .lore__fieldeditorvalue select')
      ?.focus()
  }, [])

  const chosen = rule.control === 'entry' ? (entry?.id ?? '') : value
  const complete = isCompleteValue(field, chosen)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!complete) return
    onApply(
      { fieldId: field.id, op, value: rule.control === 'text' ? value.trim() : chosen },
      entry ? { name: entry.name, typeName: entry.typeName ?? '' } : null,
    )
  }

  return (
    <form
      className="lore__fieldeditor"
      ref={form}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !(event.target as HTMLElement).closest('.picker')) onCancel()
      }}
      aria-labelledby={nameId}
      data-testid="lore-field-filter-editor"
    >
      <span className="lore__fieldeditorname" id={nameId}>
        <bdi>{field.name}</bdi>
      </span>

      {rule.ops.length > 1 ? (
        <>
          <label className="visually-hidden" htmlFor={opId}>
            {field.name}: how to compare
          </label>
          <select
            id={opId}
            className="field__input lore__fieldeditorop"
            value={op}
            onChange={(event) => setOp(event.target.value as FieldFilterOp)}
            data-testid="lore-field-filter-op"
          >
            {rule.ops.map((entry) => (
              <option key={entry.op} value={entry.op}>
                {entry.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="lore__fieldeditorop lore__fieldeditorop--fixed">{rule.ops[0].label}</span>
      )}

      <div className="lore__fieldeditorvalue">
        {rule.control === 'entry' ? (
          <EntityPicker
            label={`${field.name}: entry`}
            universeId={universeId}
            value={entry}
            onChange={setEntry}
            entityTypeId={field.targetEntityTypeId}
            entityTypeGroupId={field.targetGroupId}
            placeholder="Search for an entry"
          />
        ) : (
          <>
            <label className="visually-hidden" htmlFor={valueId}>
              {field.name}: value
            </label>
            {rule.control === 'text' ? (
              <input
                id={valueId}
                className="field__input"
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                data-testid="lore-field-filter-value"
              />
            ) : rule.control === 'number' ? (
              <input
                id={valueId}
                className="field__input"
                type="number"
                step="any"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                data-testid="lore-field-filter-value"
              />
            ) : (
              <select
                id={valueId}
                className="field__input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                data-testid="lore-field-filter-value"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {rule.control === 'yesNo' ? (
                  <>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </>
                ) : (
                  [...field.options]
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.value}
                      </option>
                    ))
                )}
              </select>
            )}
          </>
        )}
      </div>

      <div className="lore__fieldeditoractions">
        <button
          className="button button--sm"
          type="submit"
          disabled={!complete}
          data-testid="lore-field-filter-apply"
        >
          Apply
        </button>
        <button
          className="button button--text button--sm"
          type="button"
          onClick={onCancel}
          data-testid="lore-field-filter-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
