import { ListTree, Pencil, Trash } from 'lucide-react'
import { deleteProjectType } from '../../projectEntities/api'
import { typePathLabel } from '../../lore/typeTree'
import type { ProjectEntityType } from '../../projectEntities/types'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { TypeIcon } from '../TypeIcon'
import { t, tn, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { buildTypeTree } from '../../lore/typeTree'
import { SchemaTypeFields } from './SchemaTypeFields'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

type Tree = ReturnType<typeof buildTypeTree<ProjectEntityType>>

/** One type in the list: its icon, name, counts and menu, and its fields when opened. */
export function SchemaTypeItem({
  node,
  tree,
  projectId,
  busy,
  setBusy,
  setEditing,
  setChildOf,
  openTypeId,
  setOpenTypeId,
  addingFieldTo,
  setAddingFieldTo,
  refresh,
  failing,
}: {
  node: Tree['ordered'][number]
  tree: Tree
  projectId: string
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  setEditing: Dispatch<SetStateAction<ProjectEntityType | 'new' | null>>
  setChildOf: Dispatch<SetStateAction<ProjectEntityType | null>>
  openTypeId: string | null
  setOpenTypeId: Dispatch<SetStateAction<string | null>>
  addingFieldTo: string | null
  setAddingFieldTo: Dispatch<SetStateAction<string | null>>
  refresh: () => void
  failing: (error: unknown) => void
}) {
  useI18n()

  const type = node.type
  const parent = node.depth > 0 ? tree.byId.get(node.path[node.path.length - 2]!.id) : null
  return (
    <li
      className="types__row"
      data-testid={`project-type-${type.id}`}
      data-type-name={type.name}
      data-depth={node.depth}
      style={{ ['--depth' as string]: Math.min(node.depth, 6) }}
    >
      <div className="types__head">
        <span className="types__icon">
          <TypeIcon iconKey={type.icon} />
        </span>
        <span className="types__name">
          <bdi>{type.name}</bdi>
          {parent ? (
            <span className="visually-hidden">
              {t('entityTypes.page.inside', { path: typePathLabel(parent) })}
            </span>
          ) : null}
        </span>
        <span className="types__count" data-testid={`project-type-count-${type.id}`}>
          {type.entryCount === 0
            ? t('projects.schema.noEntries')
            : tn('projects.schema.entryCount', type.entryCount)}
        </span>
        <span className="types__actions">
          {/* Quiet like the universe's; on a phone it waits in the row's menu instead. */}
          <NewButton
            tone="secondary"
            size="sm"
            icon={ListTree}
            className="types__addchild"
            aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
            data-testid={`project-type-add-child-${type.id}`}
            onClick={() => {
              setChildOf(type)
              setEditing('new')
            }}
          >
            {t('entityTypes.page.addChild')}
          </NewButton>
          <Button
            tone="secondary"
            size="sm"
            icon={Pencil}
            aria-label={t('entityTypes.page.editLabel', { name: type.name })}
            data-testid={`project-type-edit-${type.id}`}
            onClick={() => setEditing(type)}
          >
            {t('entityTypes.page.edit')}
          </Button>
          <Button
            tone="secondary"
            size="sm"
            aria-expanded={openTypeId === type.id}
            aria-label={t('entityTypes.page.fieldsLabel', { name: type.name })}
            data-testid={`project-type-fields-open-${type.id}`}
            onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
          >
            {t('entityTypes.page.fields')}
            {type.fields.length > 0 ? (
              <span className="types__fieldcount">{type.fields.length}</span>
            ) : null}
          </Button>
          <ActionMenu
            label={t('entityTypes.page.moreActions', { name: type.name })}
            triggerTestId={`project-type-actions-${type.id}`}
          >
            <button
              className="actionmenu__item types__addchilditem"
              type="button"
              onClick={() => {
                setChildOf(type)
                setEditing('new')
              }}
            >
              <ActionIcon icon={ListTree} />
              {t('entityTypes.page.addChildType')}
            </button>
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={busy}
              data-testid={`project-type-delete-${type.id}`}
              onClick={() => {
                setBusy(true)
                deleteProjectType(projectId, type.id).then(refresh).catch(failing)
              }}
            >
              <ActionIcon icon={Trash} />
              {t('entityTypes.page.deleteType')}
            </button>
          </ActionMenu>
        </span>
      </div>

      {type.description ? <p className="types__description prose">{type.description}</p> : null}

      <SchemaTypeFields
        projectId={projectId}
        busy={busy}
        setBusy={setBusy}
        openTypeId={openTypeId}
        addingFieldTo={addingFieldTo}
        setAddingFieldTo={setAddingFieldTo}
        refresh={refresh}
        failing={failing}
        type={type}
      />
    </li>
  )
}
