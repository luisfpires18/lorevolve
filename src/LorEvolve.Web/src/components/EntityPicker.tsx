import { useEffect, useId, useRef, useState } from 'react'
import type { Chronology } from '../chronology/types'
import type { EntitySummary } from '../lore/types'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { useEntitySearch } from '../lore/useEntitySearch'
import { listKeyDown, useCloseOnOutside, useKeepListInView } from './entityPickerList'
import { EntityPickerCreate } from './lore/EntityPickerCreate'
import { usePickerQuickCreate } from '../lore/usePickerQuickCreate'
import { Button } from './Button'

/** What a picker hands back: enough to show a name without a second request. */
export interface EntityChoice {
  id: string
  name: string
  /** The entry's type, where a chooser keeps it to tell two of the same name apart. */
  typeName?: string
}

/**
 * Quick Create (Issue #25), which a picker offers only when it is given this: an entry's link fields and its relation's
 * other end, for someone who may create Lore. Every other picker leaves it out and is unchanged.
 */
export interface QuickCreateOptions {
  /** For a required number that is a year in one of the universe's date periods. */
  chronology: Chronology
  /** Said once the new entry exists: what still has to be saved for the choice to be kept. */
  keepHint: string
}

interface EntityPickerProps {
  label: string
  universeId: string
  /** The entity currently chosen, so the field can show its name rather than an id. */
  value: EntityChoice | null
  onChange: (choice: EntityChoice | null) => void
  /** Left out of the results. Normally the entry being edited. */
  excludeId?: string
  /** Only entries whose type is enabled for the Family Tree. */
  familyTreeOnly?: boolean
  /**
   * Only entries of this type or a type nested beneath it, searched for by the API rather than filtered here: a link field
   * limited to one type (Issue #61). Null or left out offers every type.
   */
  entityTypeId?: string | null
  /** Only entries whose type is in this semantic group: a link field limited to a group. */
  entityTypeGroupId?: string | null
  placeholder?: string
  error?: string
  /** Offers Create "..." beside the matches (Issue #25). Left out, the picker only finds entries that exist. */
  quickCreate?: QuickCreateOptions | null
}

/** One entity, or none. Used for a relation's other end and for the timeline filter. */
export function EntityPicker({
  label,
  universeId,
  value,
  onChange,
  excludeId,
  familyTreeOnly = false,
  entityTypeId = null,
  entityTypeGroupId = null,
  placeholder: customPlaceholder,
  error,
  quickCreate = null,
}: EntityPickerProps) {
  const { t, tx } = useI18n()
  const placeholder = customPlaceholder ?? t('entity.picker.placeholder')
  const inputId = useId()
  const listId = useId()
  const noteId = useId()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const { creating, focusAfterCreate, createName, startCreate, finishCreate, note } =
    usePickerQuickCreate({ quickCreate, query, setQuery, setIsOpen, value, onChange })

  const wrapper = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const change = useRef<HTMLButtonElement>(null)
  const focusInput = useRef(false)
  const { results, isSearching, active, setActive } = useEntitySearch(
    universeId,
    query,
    isOpen,
    excludeId ? [excludeId] : [],
    familyTreeOnly,
    entityTypeId,
    entityTypeGroupId,
  )

  useCloseOnOutside(wrapper, isOpen, () => setIsOpen(false))
  useKeepListInView(list, isOpen, results.length)

  // Change removes the button that was pressed, so the focus follows to the search box that replaces it rather than falling
  // to the page.
  useEffect(() => {
    if (focusInput.current && !value) {
      focusInput.current = false
      input.current?.focus()
    }
    if (focusAfterCreate.current && creating === null) {
      const target = focusAfterCreate.current === 'chosen' ? change.current : input.current
      focusAfterCreate.current = null
      target?.focus()
    }
  })

  function choose(item: EntitySummary) {
    onChange({ id: item.id, name: item.name, typeName: item.entityTypeName })
    setIsOpen(false)
    setQuery('')
  }

  return (
    <Field label={label} id={inputId} className="picker" error={error}>
      {(control) => (
        <div ref={wrapper}>
          {value ? (
            <p className="picker__chosen">
              <span className="picker__chosenname">
                <bdi>{value.name}</bdi>
              </span>
              <Button
                tone="secondary"
                size="sm"
                ref={change}
                aria-describedby={note ? noteId : undefined}
                onClick={() => {
                  focusInput.current = true
                  onChange(null)
                  setIsOpen(true)
                }}
                data-testid="picker-clear"
              >
                {t('entity.picker.change')}
              </Button>
            </p>
          ) : (
            <>
              <input
                {...control}
                ref={input}
                className="field__input"
                type="text"
                role="combobox"
                autoComplete="off"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  isOpen && results[active]
                    ? `${listId}-${results[active].id}`
                    : isOpen && startCreate && active === results.length
                      ? `${listId}-create`
                      : undefined
                }
                placeholder={placeholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setIsOpen(true)
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={(event) =>
                  listKeyDown(event, {
                    isOpen,
                    open: () => setIsOpen(true),
                    close: () => setIsOpen(false),
                    results,
                    active,
                    setActive,
                    choose,
                    extra: startCreate,
                  })
                }
                data-testid="picker-input"
              />

              {isOpen ? (
                <ul
                  className="picker__list"
                  id={listId}
                  role="listbox"
                  aria-label={label}
                  ref={list}
                >
                  {results.map((item, index) => (
                    <li key={item.id}>
                      <button
                        id={`${listId}-${item.id}`}
                        className="picker__option"
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(() => index)}
                        onClick={() => choose(item)}
                        data-testid={`picker-option-${item.name}`}
                      >
                        <span className="picker__name">
                          <bdi>{item.name}</bdi>
                        </span>
                        <span className="picker__kind">
                          <bdi>{item.entityTypeName}</bdi>
                        </span>
                      </button>
                    </li>
                  ))}

                  {results.length === 0 ? (
                    <li className="picker__none">
                      {isSearching ? t('entity.picker.looking') : t('entity.picker.none')}
                    </li>
                  ) : null}

                  {startCreate ? (
                    <li>
                      <button
                        id={`${listId}-create`}
                        className="picker__option picker__create"
                        type="button"
                        role="option"
                        aria-selected={active === results.length}
                        onMouseEnter={() => setActive(() => results.length)}
                        onClick={startCreate}
                        data-testid="picker-create"
                      >
                        <span className="picker__name">
                          {tx('entity.picker.create', { name: <bdi>{createName}</bdi> })}
                        </span>
                        <span className="picker__kind">{t('entity.picker.newEntry')}</span>
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </>
          )}

          <EntityPickerCreate
            universeId={universeId}
            quickCreate={quickCreate}
            noteId={noteId}
            note={note}
            creating={creating}
            entityTypeId={entityTypeId}
            entityTypeGroupId={entityTypeGroupId}
            finishCreate={finishCreate}
          />
        </div>
      )}
    </Field>
  )
}
