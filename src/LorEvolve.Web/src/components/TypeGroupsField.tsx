import { useId, useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { ActionIcon } from './ActionIcon'
import type { EntityTypeGroup } from '../lore/types'

/** One group a type is in, as the editor holds it: an existing group by id, or a new one by name, created on Save. */
export type GroupChoice = { id: string } | { name: string }

const NEW_GROUP = '__new'

/**
 * A type's semantic groups (Issue #36), inside the type editor. Optional and small: no group is the default, one is the
 * ordinary case, and another is a quiet "Add another group" away.
 *
 * Choosing and creating only change the editor's draft: the type's Save sends the whole set, so a new group exists only if
 * that save succeeds, and Cancel leaves nothing behind. Renaming, reordering and deleting a group change it for every type
 * in it, so they are on the Groups tab of Types, not here.
 */
export function TypeGroupsField({
  groups,
  value,
  onChange,
}: {
  /** Every group of the universe, as last read. */
  groups: EntityTypeGroup[]
  value: GroupChoice[]
  onChange: (next: GroupChoice[]) => void
}) {
  const { t } = useI18n()
  const ids = useId()
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  const byId = new Map(groups.map((group) => [group.id, group]))
  const chosenIds = new Set(value.flatMap((choice) => ('id' in choice ? [choice.id] : [])))
  const available = groups.filter((group) => !chosenIds.has(group.id))
  const showPicker = value.length === 0 || adding

  function labelOf(choice: GroupChoice) {
    return 'id' in choice
      ? (byId.get(choice.id)?.name ?? t('entityTypes.groupsField.unavailable'))
      : choice.name
  }

  function choose(selected: string) {
    if (selected === NEW_GROUP) {
      setCreating(true)
      setNewError(null)
      return
    }
    if (selected) {
      onChange([...value, { id: selected }])
      setAdding(false)
    }
  }

  function addNew() {
    const name = newName.trim()
    if (!name) {
      setNewError(t('entityTypes.groupsField.nameRequired'))
      return
    }
    // A group already called that is chosen rather than made twice.
    const existing = groups.find((group) => group.name === name)
    if (existing) {
      if (!chosenIds.has(existing.id)) onChange([...value, { id: existing.id }])
    } else if (!value.some((choice) => 'name' in choice && choice.name === name)) {
      onChange([...value, { name }])
    }
    setNewName('')
    setNewError(null)
    setCreating(false)
    setAdding(false)
  }

  function onNewKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the group; it must not submit the type's form around it.
    if (event.key === 'Enter') {
      event.preventDefault()
      addNew()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setCreating(false)
      setNewName('')
      setNewError(null)
    }
  }

  return (
    <section className="drawer__group" aria-labelledby={`${ids}-heading`} data-testid="type-groups">
      <h3 className="sectionrule sectionrule--accent" id={`${ids}-heading`}>
        {t('entityTypes.groupsField.heading')}
      </h3>
      <p className="field__hint typegroups__lede">{t('entityTypes.groupsField.lede')}</p>

      {value.length > 0 ? (
        <ul className="typegroups__chosen" aria-label={t('entityTypes.groupsField.chosenLabel')}>
          {value.map((choice) => {
            const label = labelOf(choice)
            const key = 'id' in choice ? choice.id : `new:${choice.name}`
            return (
              <li
                className="token"
                key={key}
                data-testid="type-group-chosen"
                data-group-name={label}
              >
                <bdi>{label}</bdi>
                {'name' in choice ? (
                  <span className="typegroups__new">{t('entityTypes.groupsField.new')}</span>
                ) : null}
                <button
                  className="token__remove"
                  type="button"
                  aria-label={t('entityTypes.groupsField.remove', { name: label })}
                  onClick={() => onChange(value.filter((other) => other !== choice))}
                  data-testid={`type-group-remove-${label}`}
                >
                  &times;
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {showPicker && !creating ? (
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-add`}>
            {value.length === 0
              ? t('entityTypes.groupsField.group')
              : t('entityTypes.groupsField.anotherGroup')}
          </label>
          <select
            id={`${ids}-add`}
            className="field__input field__input--select"
            value=""
            onChange={(event) => choose(event.target.value)}
            data-testid="type-group-add"
          >
            <option value="">
              {value.length === 0
                ? t('entityTypes.groupsField.none')
                : t('entityTypes.groupsField.chooseGroup')}
            </option>
            {available.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={NEW_GROUP}>{t('entityTypes.groupsField.newGroupOption')}</option>
          </select>
        </div>
      ) : null}

      {!showPicker && !creating ? (
        <button
          className="button button--text button--sm typegroups__another"
          type="button"
          onClick={() => setAdding(true)}
          data-testid="type-group-another"
        >
          <ActionIcon icon={Plus} />
          {t('entityTypes.groupsField.addAnother')}
        </button>
      ) : null}

      {creating ? (
        <div className="field" data-testid="type-group-new">
          <label className="field__label" htmlFor={`${ids}-new`}>
            {t('entityTypes.groupsField.newName')}
          </label>
          <div className="typegroups__newrow">
            <input
              id={`${ids}-new`}
              className="field__input"
              dir="auto"
              value={newName}
              autoFocus
              placeholder={t('entityTypes.groupsField.namePlaceholder')}
              aria-invalid={newError ? true : undefined}
              aria-describedby={`${ids}-new-hint`}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={onNewKey}
              data-testid="type-group-new-name"
            />
            <button
              className="button button--secondary button--sm"
              type="button"
              onClick={addNew}
              data-testid="type-group-new-add"
            >
              {t('entityTypes.groupsField.add')}
            </button>
            <button
              className="button button--text button--sm"
              type="button"
              onClick={() => {
                setCreating(false)
                setNewName('')
                setNewError(null)
              }}
            >
              {t('entityTypes.groupsField.cancel')}
            </button>
          </div>
          <p className="field__hint" id={`${ids}-new-hint`}>
            {t('entityTypes.groupsField.createdHint')}
          </p>
          {newError ? <p className="field__error">{newError}</p> : null}
        </div>
      ) : null}

      <p className="field__hint" data-testid="type-groups-elsewhere">
        {t('entityTypes.groupsField.elsewhere')}
      </p>
    </section>
  )
}
