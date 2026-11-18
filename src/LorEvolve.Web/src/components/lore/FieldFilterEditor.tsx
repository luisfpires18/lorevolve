import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n'
import {
  filterRule,
  isCompleteValue,
  type FieldFilter,
  type FieldFilterOp,
} from '../../lore/fieldFilters'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { EntityPicker, type EntityChoice } from '../EntityPicker'

export type EntryName = { name: string; typeName: string }

/** One field's comparison and value, then Apply. Apply waits until the value is whole. */
export function FieldFilterEditor({
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
  const { t } = useI18n()
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
            {t('lore.filters.howToCompare', { field: field.name })}
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
            label={t('lore.filters.entryLabel', { field: field.name })}
            universeId={universeId}
            value={entry}
            onChange={setEntry}
            entityTypeId={field.targetEntityTypeId}
            entityTypeGroupId={field.targetGroupId}
            placeholder={t('lore.filters.entryPlaceholder')}
          />
        ) : (
          <>
            <label className="visually-hidden" htmlFor={valueId}>
              {t('lore.filters.valueLabel', { field: field.name })}
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
                  {t('lore.filters.choose')}
                </option>
                {rule.control === 'yesNo' ? (
                  <>
                    <option value="true">{t('lore.filters.yesOption')}</option>
                    <option value="false">{t('lore.filters.noOption')}</option>
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
          {t('lore.filters.apply')}
        </button>
        <button
          className="button button--text button--sm"
          type="button"
          onClick={onCancel}
          data-testid="lore-field-filter-cancel"
        >
          {t('lore.filters.cancel')}
        </button>
      </div>
    </form>
  )
}
