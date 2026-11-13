import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import {
  createEntityTypeGroup,
  deleteEntityTypeGroup,
  renameEntityTypeGroup,
  reorderEntityTypeGroups,
} from '../lore/api'
import type { EntityType, EntityTypeGroup } from '../lore/types'

/**
 * The universe's groups on their own tab of Types: their priority, first first, and who is in each. The priority orders a
 * scene's lore - each entry under the first-ranked group of its type. A group is created, moved, renamed and deleted here,
 * at once; which groups a type joins stays in the type's own editor. Rename and delete change the group for every type in
 * it, so each says which types that is. A delete a link field depends on is refused by the API, which names the fields.
 */
export function TypeGroupsPanel({
  universeId,
  groups: saved,
  types,
  canEdit,
  onGroupsChanged,
}: {
  universeId: string
  groups: EntityTypeGroup[]
  types: EntityType[]
  canEdit: boolean
  /** After any change: read the groups again. */
  onGroupsChanged: () => Promise<void>
}) {
  const ids = useId()
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{
    groupId: string
    text: string
    fields: string[]
  } | null>(null)
  // A move shows its new order at once; the saved list takes over once it is read again, or comes back on failure.
  const [moving, setMoving] = useState<EntityTypeGroup[] | null>(null)
  const groups = moving ?? saved
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

  async function create() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setNewError(null)
    try {
      await createEntityTypeGroup(universeId, name)
      setNewName('')
      await onGroupsChanged()
    } catch (error: unknown) {
      setNewError(
        error instanceof ApiError
          ? (error.fieldErrors.name ?? error.message)
          : 'That group could not be created.',
      )
    } finally {
      setBusy(false)
    }
  }

  /** One step up or down: the whole order is sent, as every other order in LorEvolve is. */
  async function move(index: number, by: -1 | 1) {
    if (busy) return
    const order = groups.map((group) => group.id)
    const [moved] = order.splice(index, 1)
    order.splice(index + by, 0, moved)
    const byId = new Map(groups.map((group) => [group.id, group]))
    setMoving(order.map((id) => byId.get(id)!))
    setBusy(true)
    setProblem(null)
    try {
      await reorderEntityTypeGroups(universeId, order)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: moved,
        text: error instanceof ApiError ? error.message : 'That group could not be moved.',
        fields: [],
      })
    } finally {
      setMoving(null)
      setBusy(false)
    }
  }

  return (
    <section className="typegroups typegroups--panel" data-testid="type-groups-panel">
      <p className="typegroups__intro">
        A group gathers types that are the same kind of thing. Its place here is its priority: a
        scene's lore lists entries by the first group their type is in, top group first. Choose a
        type's groups in its editor.
      </p>
      {canEdit ? (
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-new`}>
            New group
          </label>
          <div className="typegroups__newrow">
            <input
              id={`${ids}-new`}
              className="field__input"
              dir="auto"
              value={newName}
              placeholder="Insert a name"
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void create()
                }
              }}
              data-testid="type-group-create-name"
            />
            <button
              className="button button--secondary button--sm"
              type="button"
              disabled={busy || !newName.trim()}
              onClick={() => void create()}
              data-testid="type-group-create"
            >
              <Plus aria-hidden="true" focusable="false" strokeWidth={1.75} />
              Add group
            </button>
          </div>
          {newError ? <p className="field__error">{newError}</p> : null}
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="typegroups__empty" data-testid="type-groups-empty">
          No groups yet.
        </p>
      ) : null}
      <ol className="typegroups__list" data-testid="type-groups-list">
        {groups.map((group, index) => (
          <li
            key={group.id}
            className="typegroups__item"
            data-group-name={group.name}
            data-testid="type-group-row"
          >
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
                {canEdit ? (
                  <span className="typegroups__actions">
                    <button
                      className="button button--text button--sm typegroups__move"
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => void move(index, -1)}
                      aria-label={`Move the group ${group.name} up`}
                      data-testid={`type-group-up-${group.name}`}
                    >
                      <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    </button>
                    <button
                      className="button button--text button--sm typegroups__move"
                      type="button"
                      disabled={busy || index === groups.length - 1}
                      onClick={() => void move(index, 1)}
                      aria-label={`Move the group ${group.name} down`}
                      data-testid={`type-group-down-${group.name}`}
                    >
                      <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    </button>
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
                ) : null}
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
      </ol>
    </section>
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
