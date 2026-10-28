import { useId, useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ApiError } from '../lib/api'
import { deleteEntityTypeGroup, renameEntityTypeGroup } from '../lore/api'
import type { EntityType, EntityTypeGroup } from '../lore/types'
import { confirmAction } from '../lib/confirm'

/** One group a type is in, as the editor holds it: an existing group by id, or a new one by name, created on Save. */
export type GroupChoice = { id: string } | { name: string }

const NEW_GROUP = '__new'

/**
 * A type's semantic groups (Issue #36), inside the type editor. Optional and small: no group is the default, one is the
 * ordinary case, and another is a quiet "Add another group" away.
 *
 * Choosing and creating only change the editor's draft: the type's Save sends the whole set, so a new group exists only if
 * that save succeeds, and Cancel leaves nothing behind. Renaming and deleting a group are different - they change the group
 * for every type in it - so they act at once, behind "Rename or delete groups", and say who else is affected.
 */
export function TypeGroupsField({
  universeId,
  groups,
  types,
  value,
  onChange,
  onGroupsChanged,
}: {
  universeId: string
  /** Every group of the universe, as last read. */
  groups: EntityTypeGroup[]
  /** Every type of the universe, to name a group's members. */
  types: EntityType[]
  value: GroupChoice[]
  onChange: (next: GroupChoice[]) => void
  /** After a rename or delete: read the groups again. */
  onGroupsChanged: () => Promise<void>
}) {
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
    return 'id' in choice ? (byId.get(choice.id)?.name ?? 'Unavailable group') : choice.name
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
      setNewError('Give the group a name.')
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
        Groups
      </h3>
      <p className="field__hint typegroups__lede">
        Optional. A group gathers types that are the same kind of thing, such as Runes, so a link
        field or a Lore filter can use them together. Each type keeps its own fields.
      </p>

      {value.length > 0 ? (
        <ul className="typegroups__chosen" aria-label="Groups this type is in">
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
                {'name' in choice ? <span className="typegroups__new">new</span> : null}
                <button
                  className="token__remove"
                  type="button"
                  aria-label={`Remove from ${label}`}
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
            {value.length === 0 ? 'Group' : 'Another group'}
          </label>
          <select
            id={`${ids}-add`}
            className="field__input field__input--select"
            value=""
            onChange={(event) => choose(event.target.value)}
            data-testid="type-group-add"
          >
            <option value="">{value.length === 0 ? 'None' : 'Choose a group'}</option>
            {available.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={NEW_GROUP}>New group…</option>
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
          Add another group
        </button>
      ) : null}

      {creating ? (
        <div className="field" data-testid="type-group-new">
          <label className="field__label" htmlFor={`${ids}-new`}>
            New group name
          </label>
          <div className="typegroups__newrow">
            <input
              id={`${ids}-new`}
              className="field__input"
              dir="auto"
              value={newName}
              autoFocus
              placeholder="Insert a group name"
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
              Add
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
              Cancel
            </button>
          </div>
          <p className="field__hint" id={`${ids}-new-hint`}>
            Created when you save this type, with this type in it.
          </p>
          {newError ? <p className="field__error">{newError}</p> : null}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <ManageGroups
          universeId={universeId}
          groups={groups}
          types={types}
          onDeleted={(groupId) =>
            onChange(value.filter((choice) => !('id' in choice) || choice.id !== groupId))
          }
          onGroupsChanged={onGroupsChanged}
        />
      ) : null}
    </section>
  )
}

/**
 * Renaming and deleting groups, folded away: neither is everyday work, and both change the group for every type in it, so
 * each says which types that is. A delete a link field depends on is refused by the API, which names the fields.
 */
function ManageGroups({
  universeId,
  groups,
  types,
  onDeleted,
  onGroupsChanged,
}: {
  universeId: string
  groups: EntityTypeGroup[]
  types: EntityType[]
  onDeleted: (groupId: string) => void
  onGroupsChanged: () => Promise<void>
}) {
  const ids = useId()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{
    groupId: string
    text: string
    fields: string[]
  } | null>(null)
  const typeName = new Map(types.map((type) => [type.id, type.name]))

  function membersOf(group: EntityTypeGroup) {
    return group.typeIds.map((id) => typeName.get(id)).filter((name): name is string => !!name)
  }

  function usedBy(group: EntityTypeGroup) {
    const names = membersOf(group)
    if (names.length === 0) return 'No type is in it.'
    if (names.length === 1) return `Used by ${names[0]}.`
    return `Used by ${names.length} types: ${names.join(', ')}.`
  }

  async function rename(group: EntityTypeGroup) {
    const name = draft.trim()
    if (!name || busy) return
    if (name === group.name) {
      setRenaming(null)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await renameEntityTypeGroup(universeId, group.id, name)
      setRenaming(null)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: group.id,
        text:
          error instanceof ApiError
            ? (error.fieldErrors.name ?? error.message)
            : 'That group could not be renamed.',
        fields: [],
      })
    } finally {
      setBusy(false)
    }
  }

  async function remove(group: EntityTypeGroup) {
    if (busy) return
    const names = membersOf(group)
    const effect =
      names.length === 0
        ? 'No type is in it.'
        : `${names.join(', ')} will no longer be in it. The types, their fields and their entries stay as they are.`
    if (
      !(await confirmAction({
        title: (
          <>
            Delete the group “<bdi>{group.name}</bdi>”?
          </>
        ),
        message: `${effect} This cannot be undone.`,
        confirmLabel: 'Delete group',
        variant: 'destructive',
      }))
    ) {
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await deleteEntityTypeGroup(universeId, group.id)
      onDeleted(group.id)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: group.id,
        text: error instanceof ApiError ? error.message : 'That group could not be deleted.',
        fields: fieldsOf(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="typegroups__manage" data-testid="type-groups-manage">
      <summary>Rename or delete groups</summary>
      <ul className="typegroups__list">
        {groups.map((group) => (
          <li key={group.id} className="typegroups__item" data-group-name={group.name}>
            {renaming === group.id ? (
              <div className="field">
                <label className="field__label" htmlFor={`${ids}-${group.id}`}>
                  New name for <bdi>{group.name}</bdi>
                </label>
                <div className="typegroups__newrow">
                  <input
                    id={`${ids}-${group.id}`}
                    className="field__input"
                    dir="auto"
                    value={draft}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void rename(group)
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        setRenaming(null)
                      }
                    }}
                    aria-describedby={`${ids}-${group.id}-hint`}
                    data-testid="type-group-rename-input"
                  />
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void rename(group)}
                    data-testid="type-group-rename-save"
                  >
                    Rename
                  </button>
                  <button
                    className="button button--text button--sm"
                    type="button"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </button>
                </div>
                <p className="field__hint" id={`${ids}-${group.id}-hint`}>
                  {membersOf(group).length > 1
                    ? `The new name shows for every type in it. ${usedBy(group)}`
                    : usedBy(group)}{' '}
                  Fields that link to it keep working.
                </p>
              </div>
            ) : (
              <div className="typegroups__row">
                <span className="typegroups__name">
                  <bdi>{group.name}</bdi>
                  <span className="typegroups__usage">{usedBy(group)}</span>
                </span>
                <span className="typegroups__actions">
                  <button
                    className="button button--text button--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setProblem(null)
                      setDraft(group.name)
                      setRenaming(group.id)
                    }}
                    aria-label={`Rename the group ${group.name}`}
                    data-testid={`type-group-rename-${group.name}`}
                  >
                    Rename
                  </button>
                  <button
                    className="button button--text button--sm typegroups__delete"
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(group)}
                    aria-label={`Delete the group ${group.name}`}
                    data-testid={`type-group-delete-${group.name}`}
                  >
                    Delete
                  </button>
                </span>
              </div>
            )}
            {problem?.groupId === group.id ? (
              <div
                className="callout callout--warning"
                role="alert"
                data-testid="type-group-problem"
              >
                <p>{problem.text}</p>
                {problem.fields.length > 1 ? (
                  <ul className="typegroups__fields">
                    {problem.fields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** The fields a refused delete names, as "Field on Type", from the problem's own list. */
function fieldsOf(error: unknown): string[] {
  if (!(error instanceof ApiError)) return []
  const fields = (error.problem as { fields?: { fieldName?: string; typeName?: string }[] } | null)
    ?.fields
  return Array.isArray(fields)
    ? fields.map((field) => `“${field.fieldName ?? ''}” on ${field.typeName ?? ''}`)
    : []
}
