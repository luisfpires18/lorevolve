import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import type { EntityType, EntityTypeGroup } from '../lore/typeDefinitions'
import { typeGroupActions } from '../lore/typeGroupActions'
import { TypeGroupRow } from './lore/TypeGroupRow'

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
  const { t, tn, tx } = useI18n()
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

  const { membersOf, usedBy, rename, remove, create, move } = typeGroupActions({
    universeId,
    onGroupsChanged,
    t,
    tn,
    tx,
    newName,
    setNewName,
    setNewError,
    setRenaming,
    draft,
    busy,
    setBusy,
    setProblem,
    setMoving,
    groups,
    typeName,
  })

  return (
    <section className="typegroups typegroups--panel" data-testid="type-groups-panel">
      <p className="typegroups__intro">{t('entityTypes.groupsPanel.intro')}</p>
      {canEdit ? (
        <Field label={t('entityTypes.groupsPanel.newGroup')} id={`${ids}-new`} error={newError}>
          {(control) => (
            <div className="typegroups__newrow">
              <input
                {...control}
                className="field__input"
                dir="auto"
                value={newName}
                placeholder={t('entityTypes.groupsPanel.namePlaceholder')}
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
                {t('entityTypes.groupsPanel.add')}
              </button>
            </div>
          )}
        </Field>
      ) : null}
      {groups.length === 0 ? (
        <p className="typegroups__empty" data-testid="type-groups-empty">
          {t('entityTypes.groupsPanel.empty')}
        </p>
      ) : null}
      <ol className="typegroups__list" data-testid="type-groups-list">
        {groups.map((group, index) => (
          <TypeGroupRow
            key={group.id}
            group={group}
            index={index}
            groups={groups}
            ids={ids}
            canEdit={canEdit}
            renaming={renaming}
            setRenaming={setRenaming}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            problem={problem}
            setProblem={setProblem}
            membersOf={membersOf}
            usedBy={usedBy}
            rename={rename}
            remove={remove}
            move={move}
          />
        ))}
      </ol>
    </section>
  )
}
