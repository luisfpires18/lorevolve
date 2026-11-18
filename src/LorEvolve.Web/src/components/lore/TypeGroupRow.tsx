import { ArrowDown, ArrowUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import type { EntityTypeGroup } from '../../lore/typeDefinitions'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

/** One group on the groups tab: its rename form or its row with the moves, rename and delete, and its problem. */
export function TypeGroupRow({
  group,
  index,
  groups,
  ids,
  canEdit,
  renaming,
  setRenaming,
  draft,
  setDraft,
  busy,
  problem,
  setProblem,
  membersOf,
  usedBy,
  rename,
  remove,
  move,
}: {
  group: EntityTypeGroup
  index: number
  groups: EntityTypeGroup[]
  ids: string
  canEdit: boolean
  renaming: string | null
  setRenaming: (renaming: string | null) => void
  draft: string
  setDraft: (draft: string) => void
  busy: boolean
  problem: { groupId: string; text: string; fields: string[] } | null
  setProblem: (problem: { groupId: string; text: string; fields: string[] } | null) => void
  membersOf: (group: EntityTypeGroup) => string[]
  usedBy: (group: EntityTypeGroup) => string
  rename: (group: EntityTypeGroup) => Promise<void>
  remove: (group: EntityTypeGroup) => Promise<void>
  move: (index: number, by: -1 | 1) => Promise<void>
}) {
  const { t, tx } = useI18n()
  return (
    <li className="typegroups__item" data-group-name={group.name} data-testid="type-group-row">
      {renaming === group.id ? (
        <Field
          label={tx('entityTypes.groupsPanel.newNameFor', { name: <bdi>{group.name}</bdi> })}
          id={`${ids}-${group.id}`}
          hint={
            membersOf(group).length > 1
              ? t('entityTypes.groupsPanel.renameHintMany', { used: usedBy(group) })
              : t('entityTypes.groupsPanel.renameHintOne', { used: usedBy(group) })
          }
        >
          {(control) => (
            <div className="typegroups__newrow">
              <input
                {...control}
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
                data-testid="type-group-rename-input"
              />
              <FormActions onCancel={() => setRenaming(null)} size="sm">
                <Button
                  tone="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void rename(group)}
                  data-testid="type-group-rename-save"
                >
                  {t('entityTypes.groupsPanel.rename')}
                </Button>
              </FormActions>
            </div>
          )}
        </Field>
      ) : (
        <div className="typegroups__row">
          <span className="typegroups__name">
            <bdi>{group.name}</bdi>
            <span className="typegroups__usage">{usedBy(group)}</span>
          </span>
          {canEdit ? (
            <span className="typegroups__actions">
              <Button
                tone="text"
                size="sm"
                className="typegroups__move"
                disabled={busy || index === 0}
                onClick={() => void move(index, -1)}
                aria-label={t('entityTypes.groupsPanel.moveUp', { name: group.name })}
                data-testid={`type-group-up-${group.name}`}
              >
                <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
              </Button>
              <Button
                tone="text"
                size="sm"
                className="typegroups__move"
                disabled={busy || index === groups.length - 1}
                onClick={() => void move(index, 1)}
                aria-label={t('entityTypes.groupsPanel.moveDown', { name: group.name })}
                data-testid={`type-group-down-${group.name}`}
              >
                <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
              </Button>
              <Button
                tone="text"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setProblem(null)
                  setDraft(group.name)
                  setRenaming(group.id)
                }}
                aria-label={t('entityTypes.groupsPanel.renameGroup', { name: group.name })}
                data-testid={`type-group-rename-${group.name}`}
              >
                {t('entityTypes.groupsPanel.rename')}
              </Button>
              <Button
                tone="danger-quiet"
                size="sm"
                className="typegroups__delete"
                disabled={busy}
                onClick={() => void remove(group)}
                aria-label={t('entityTypes.groupsPanel.deleteGroup', { name: group.name })}
                data-testid={`type-group-delete-${group.name}`}
              >
                {t('entityTypes.groupsPanel.delete')}
              </Button>
            </span>
          ) : null}
        </div>
      )}
      {problem?.groupId === group.id ? (
        <div className="callout callout--warning" role="alert" data-testid="type-group-problem">
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
  )
}
