import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { EntitySummary } from '../lore/types'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { useEntitySearch } from '../lore/useEntitySearch'
import { listKeyDown, useCloseOnOutside, useKeepListInView } from './entityPickerList'
import { PickerOptions } from './PickerOptions'
import { QuickCreateDialog } from './QuickCreateDialog'
import { QuietNote } from './QuietNote'
import { Token } from './Token'
import { usePickerQuickCreate } from '../lore/usePickerQuickCreate'
import { Button } from './Button'
import type { EntityPickerProps } from './entityPickerTypes'

export type { EntityChoice, QuickCreateOptions } from './entityPickerTypes'

/** One entity, or none; with `multiple`, several. Used for a relation's other end, the timeline filter and a scene's cast. */
export function EntityPicker({
  label,
  requiredMark,
  hint,
  universeId,
  excludeId,
  familyTreeOnly = false,
  entityTypeId = null,
  entityTypeGroupId = null,
  placeholder: customPlaceholder,
  error,
  quickCreate: offered = null,
  ...pick
}: EntityPickerProps) {
  const { t, tx } = useI18n()
  const multiple = pick.multiple === true
  const quickCreate = multiple ? null : offered
  // The several-entities picker keeps its own words and test ids (`participant-*`).
  const words = multiple ? 'entity.multiPicker' : 'entity.picker'
  const prefix = multiple ? 'participant' : 'picker'
  const placeholder = customPlaceholder ?? t(`${words}.placeholder`)
  const inputId = useId()
  const listId = useId()
  const noteId = useId()
  // `pick` is a union, so what each mode needs is read once: `chosen` is the single choice, `chosenMany` the list.
  const chosen = pick.multiple ? null : pick.value
  const chosenMany = pick.multiple ? pick.value : []

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const { creating, focusAfterCreate, createName, startCreate, finishCreate, note } =
    usePickerQuickCreate({
      quickCreate,
      query,
      setQuery,
      setIsOpen,
      value: chosen,
      onChange: (choice) => {
        if (!pick.multiple) pick.onChange(choice)
      },
    })

  const wrapper = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const change = useRef<HTMLButtonElement>(null)
  const focusInput = useRef(false)
  const { results, isSearching, active, setActive } = useEntitySearch(
    universeId,
    query,
    isOpen,
    [...(excludeId ? [excludeId] : []), ...chosenMany.map((choice) => choice.id)],
    familyTreeOnly,
    entityTypeId,
    entityTypeGroupId,
  )

  useCloseOnOutside(wrapper, isOpen, () => setIsOpen(false))
  useKeepListInView(list, isOpen, results.length)

  // Change removes the button that was pressed, so the focus follows to the search box that replaces it rather than falling
  // to the page.
  useEffect(() => {
    if (focusInput.current && !chosen) {
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
    if (pick.multiple) {
      pick.onChange([...pick.value, { id: item.id, name: item.name }])
    } else {
      pick.onChange({ id: item.id, name: item.name, typeName: item.entityTypeName })
      setIsOpen(false)
    }
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Backspace on an empty field takes the last one back off, as it does for tags.
    if (pick.multiple && event.key === 'Backspace' && query === '' && pick.value.length > 0) {
      pick.onChange(pick.value.slice(0, -1))
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
      extra: startCreate,
    })
  }

  return (
    <Field
      label={label}
      requiredMark={requiredMark}
      id={inputId}
      className="picker"
      hint={hint}
      error={error}
    >
      {(control) => {
        const search = (
          <input
            {...control}
            ref={input}
            className={multiple ? 'tokens__input' : 'field__input'}
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
            placeholder={chosenMany.length === 0 ? placeholder : ''}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={onKeyDown}
            data-testid={`${prefix}-input`}
          />
        )
        const options = isOpen ? (
          <PickerOptions
            id={listId}
            label={label}
            listRef={list}
            results={results}
            active={active}
            setActive={setActive}
            onChoose={choose}
            testPrefix={prefix}
            emptyText={isSearching ? t(`${words}.looking`) : t(`${words}.none`)}
            startCreate={startCreate}
            createName={createName}
          />
        ) : null

        return (
          <div ref={wrapper}>
            {pick.multiple ? (
              <>
                <div className="tokens" data-testid="participants">
                  {pick.value.map((choice) => (
                    <Token
                      key={choice.id}
                      removeLabel={t('entity.multiPicker.remove', { name: choice.name })}
                      onRemove={() =>
                        pick.onChange(pick.value.filter((other) => other.id !== choice.id))
                      }
                      removeTestId={`participant-remove-${choice.name}`}
                    >
                      <bdi>{choice.name}</bdi>
                    </Token>
                  ))}
                  {search}
                </div>
                {options}
              </>
            ) : chosen ? (
              <p className="picker__chosen">
                <span className="picker__chosenname">
                  <bdi>{chosen.name}</bdi>
                </span>
                <Button
                  tone="secondary"
                  size="sm"
                  ref={change}
                  aria-describedby={note ? noteId : undefined}
                  onClick={() => {
                    focusInput.current = true
                    pick.onChange(null)
                    setIsOpen(true)
                  }}
                  data-testid="picker-clear"
                >
                  {t('entity.picker.change')}
                </Button>
              </p>
            ) : (
              <>
                {search}
                {options}
              </>
            )}

            {quickCreate ? (
              // Announced as it appears: the entry exists now, the choice does not until the form it sits in is saved.
              <QuietNote
                className="picker__created"
                size="ui"
                wrap
                testId="picker-created"
                id={noteId}
                role="status"
              >
                {note
                  ? tx('entity.picker.created', {
                      name: <bdi>{note.name}</bdi>,
                      hint: quickCreate.keepHint,
                      link: (
                        <a
                          href={`/app/universes/${universeId}/lore/${note.id}`}
                          target="_blank"
                          rel="noopener"
                          data-testid="picker-created-open"
                        >
                          {t('entity.picker.openFull')}
                        </a>
                      ),
                    })
                  : null}
              </QuietNote>
            ) : null}

            {creating !== null && quickCreate ? (
              <QuickCreateDialog
                universeId={universeId}
                initialName={creating}
                entityTypeId={entityTypeId}
                entityTypeGroupId={entityTypeGroupId}
                chronology={quickCreate.chronology}
                onCreated={(choice) => finishCreate(choice, true)}
                onChooseExisting={(choice) => finishCreate(choice, false)}
                onCancel={() => finishCreate(null, false)}
              />
            ) : null}
          </div>
        )
      }}
    </Field>
  )
}
