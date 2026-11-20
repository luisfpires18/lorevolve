import { deleteProjectType } from '../../projectEntities/api'
import { confirmAction } from '../../lib/confirm'
import { typePathLabel } from '../../lore/typeTree'
import type { ProjectEntityType } from '../../projectEntities/types'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { t, tn, useI18n } from '../../i18n'
import { useId, type Dispatch, type SetStateAction } from 'react'
import type { buildTypeTree } from '../../lore/typeTree'
import { SchemaTypeFields } from './SchemaTypeFields'

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
  const fieldsId = useId()

  const type = node.type
  const parent = node.depth > 0 ? tree.byId.get(node.path[node.path.length - 2]!.id) : null
  return (
    <TypeRow
      name={type.name}
      icon={type.icon}
      hiddenPath={
        parent ? t('entityTypes.page.inside', { path: typePathLabel(parent) }) : undefined
      }
      depth={node.depth}
      testId={`project-type-${type.id}`}
      data-type-name={type.name}
      countTestId={`project-type-count-${type.id}`}
      count={
        type.entryCount === 0
          ? t('projects.schema.noEntries')
          : tn('projects.schema.entryCount', type.entryCount)
      }
      actions={
        <TypeRowActions
          name={type.name}
          addChild={{
            onAdd: () => {
              setChildOf(type)
              setEditing('new')
            },
            testId: `project-type-add-child-${type.id}`,
          }}
          onEdit={() => setEditing(type)}
          editTestId={`project-type-edit-${type.id}`}
          fields={{
            open: openTypeId === type.id,
            count: type.fields.length,
            onToggle: () => setOpenTypeId(openTypeId === type.id ? null : type.id),
            testId: `project-type-fields-open-${type.id}`,
            controls: fieldsId,
          }}
          onDelete={async () => {
            const confirmed = await confirmAction({
              title: t('entityTypes.page.deleteTitle', { name: type.name }),
              message: t('entityTypes.page.deleteMessage'),
              confirmLabel: t('entityTypes.page.deleteConfirm'),
              variant: 'destructive',
            })
            if (!confirmed) return
            setBusy(true)
            deleteProjectType(projectId, type.id).then(refresh).catch(failing)
          }}
          deleteDisabled={busy}
          deleteTestId={`project-type-delete-${type.id}`}
          menuTestId={`project-type-actions-${type.id}`}
        />
      }
    >
      {type.description ? <p className="types__description prose">{type.description}</p> : null}

      <SchemaTypeFields
        id={fieldsId}
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
    </TypeRow>
  )
}
