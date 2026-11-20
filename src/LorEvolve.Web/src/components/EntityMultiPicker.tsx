import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { EntitySummary } from '../lore/types'
import { Field } from './Field'
import { useI18n } from '../i18n'
import type { EntityChoice } from './EntityPicker'
import { useEntitySearch } from '../lore/useEntitySearch'
import { listKeyDown, useCloseOnOutside, useKeepListInView } from './entityPickerList'
import { Token } from './Token'

interface EntityMultiPickerProps {
  label: string
  hint?: string
  universeId: string
  /** Everyone and everything already taking part, in the order they were added. */
  value: EntityChoice[]
  onChange: (choices: EntityChoice[]) => void
  placeholder?: string
  error?: string
}

/**
 * Several entities at once, on the same search. Chosen ones sit as tokens in the field
 * and drop out of the results, so nothing can be added twice.
 */
export function EntityMultiPicker({
  label,
  hint,
  universeId,
  value,
  onChange,
  placeholder: customPlaceholder,
  error,
}: EntityMultiPickerProps) {
  const { t } = useI18n()
  const placeholder = customPlaceholder ?? t('entity.multiPicker.placeholder')
  const inputId = useId()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const wrapper = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const { results, isSearching, active, setActive } = useEntitySearch(
    universeId,
    query,
    isOpen,
    value.map((choice) => choice.id),
  )

  useCloseOnOutside(wrapper, isOpen, () => setIsOpen(false))
  useKeepListInView(list, isOpen, results.length)

  function choose(item: EntitySummary) {
    onChange([...value, { id: item.id, name: item.name }])
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Backspace on an empty field takes the last one back off, as it does for tags.
    if (event.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1))
      return
    }

    listKeyDown(event, {
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      results,
      active,
      setActive,
      choose,
    })
  }

  return (
    <Field label={label} id={inputId} className="picker" hint={hint} error={error}>
      {(control) => (
        <div ref={wrapper}>
          <div className="tokens" data-testid="participants">
            {value.map((choice) => (
              <Token
                key={choice.id}
                removeLabel={t('entity.multiPicker.remove', { name: choice.name })}
                onRemove={() => onChange(value.filter((candidate) => candidate.id !== choice.id))}
                removeTestId={`participant-remove-${choice.name}`}
              >
                <bdi>{choice.name}</bdi>
              </Token>
            ))}
            <input
              {...control}
              className="tokens__input"
              type="text"
              role="combobox"
              autoComplete="off"
              aria-expanded={isOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                isOpen && results[active] ? `${listId}-${results[active].id}` : undefined
              }
              placeholder={value.length === 0 ? placeholder : ''}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={onKeyDown}
              data-testid="participant-input"
            />
          </div>

          {isOpen ? (
            <ul className="picker__list" id={listId} role="listbox" aria-label={label} ref={list}>
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
                    data-testid={`participant-option-${item.name}`}
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
                  {isSearching ? t('entity.multiPicker.looking') : t('entity.multiPicker.none')}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </Field>
  )
}
