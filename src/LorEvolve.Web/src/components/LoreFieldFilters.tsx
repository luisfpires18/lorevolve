import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { getEntity } from '../lore/api'
import {
  MAX_FIELD_FILTERS,
  encodeFieldFilter,
  filterRule,
  filterableFields,
  opLabel,
  valueLabel,
  type FieldFilter,
} from '../lore/fieldFilters'
import type { EntityType, FieldDefinition } from '../lore/typeDefinitions'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { FieldFilterEditor, type EntryName } from './lore/FieldFilterEditor'

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
  const { t, tx } = useI18n()
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
            {t('lore.filters.limit', { max: MAX_FIELD_FILTERS })}
          </p>
        ) : (
          <ActionMenu
            label={t('lore.filters.add')}
            trigger={
              <>
                <ActionIcon icon={Plus} />
                {t('lore.filters.add')}
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
              aria-label={t('lore.filters.list')}
              data-testid="lore-field-filters"
            >
              {filters.map((filter, index) => {
                const field = type.fields.find((candidate) => candidate.id === filter.fieldId)
                if (!field) return null
                const sentence = t('lore.filters.sentence', {
                  field: field.name,
                  op: opLabel(field, filter.op),
                  value: valueLabel(field, filter.value, names[filter.value]),
                })
                return (
                  <li
                    className="lore__activefilter"
                    key={`${index}-${filter.fieldId}`}
                    data-testid="lore-field-filter"
                  >
                    <span className="lore__activefiltertext">
                      {tx('lore.filters.sentence', {
                        field: <bdi>{field.name}</bdi>,
                        op: opLabel(field, filter.op),
                        value: <bdi>{valueLabel(field, filter.value, names[filter.value])}</bdi>,
                      })}
                    </span>
                    <button
                      className="lore__removefilter"
                      type="button"
                      aria-label={t('lore.filters.removeLabel', { sentence })}
                      title={t('lore.filters.remove')}
                      onClick={() => {
                        const token = encodeFieldFilter(filter)
                        onChange((current) =>
                          current.filter((each) => encodeFieldFilter(each) !== token),
                        )
                      }}
                      data-testid="lore-remove-field-filter"
                    >
                      <X aria-hidden="true" focusable="false" strokeWidth={1.75} />
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
