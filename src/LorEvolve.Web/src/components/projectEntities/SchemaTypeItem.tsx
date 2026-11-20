import { addProjectField, deleteProjectField, deleteProjectType } from '../../projectEntities/api'
import { confirmDelete } from '../../lib/confirm'
import { typePathLabel } from '../../lore/typeTree'
import type { ProjectEntityType } from '../../projectEntities/types'
import { asFieldDefinition, PROJECT_FIELD_KINDS } from '../../projectEntities/fieldDefinition'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { TypeFieldRow } from '../lore/TypeFieldRow'
import { InheritedFields } from '../lore/InheritedFields'
import { FieldDialog } from '../lore/FieldDialog'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { t, tn, useI18n } from '../../i18n'
import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import type { buildTypeTree } from '../../lore/typeTree'

type Tree = ReturnType<typeof buildTypeTree<ProjectEntityType>>

/**
 * One type in the list: its icon, name, counts and menu, and its fields when opened, listed the way a Lore type's are:
 * what the types above hand down first, read-only, then its own, each with Delete, and Add field.
 */
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
  refresh: () => void
  failing: (error: unknown) => void
}) {
  useI18n()
  const fieldsId = useId()
  const [adding, setAdding] = useState(false)

  const type = node.type
  const parent = node.depth > 0 ? tree.byId.get(node.path[node.path.length - 2]!.id) : null
  // Inherited fields are defined once, on the type above, and are not editable here: each under the type that holds it.
  const inherited = node.path
    .slice(0, -1)
    .map((owner) => ({
      owner,
      fields: type.inheritedFields
        .filter((field) => owner.fields.some((own) => own.id === field.id))
        .map(asFieldDefinition),
    }))
    .filter((each) => each.fields.length > 0)
  const summary = (field: FieldDefinition) => FIELD_KIND_LABELS[field.kind]

  function removeField(field: FieldDefinition) {
    return confirmDelete(
      {
        title: t('entityTypes.fields.deleteTitle', { name: field.name }),
        // The client cannot see whether entries hold a value; the API refuses when they do.
        message: t('projects.structure.deleteEmpty'),
        confirmLabel: t('entityTypes.fields.deleteConfirm'),
      },
      () => deleteProjectField(projectId, type.id, field.id).then(refresh),
      { setBusy, fail: failing },
    )
  }

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
          fold={{
            open: openTypeId === type.id,
            count: type.fields.length,
            onToggle: () => setOpenTypeId(openTypeId === type.id ? null : type.id),
            testId: `project-type-fields-open-${type.id}`,
            controls: fieldsId,
          }}
          onDelete={async () => {
            // A type entries still use is refused by the API; ask only when the delete can go through.
            if (type.entryCount === 0) {
              await confirmDelete(
                {
                  title: t('entityTypes.page.deleteTitle', { name: type.name }),
                  message: t('entityTypes.page.deleteMessage'),
                  confirmLabel: t('entityTypes.page.deleteConfirm'),
                },
                () => deleteProjectType(projectId, type.id).then(refresh),
                { setBusy, fail: failing },
              )
              return
            }
            setBusy(true)
            await deleteProjectType(projectId, type.id).then(refresh).catch(failing)
          }}
          deleteDisabled={busy}
          deleteTestId={`project-type-delete-${type.id}`}
          menuTestId={`project-type-actions-${type.id}`}
        />
      }
    >
      {type.description ? <p className="types__description prose">{type.description}</p> : null}

      {openTypeId === type.id ? (
        <div
          id={fieldsId}
          className="types__fields"
          data-testid={`project-type-fields-panel-${type.id}`}
        >
          {type.fields.length === 0 && inherited.length === 0 ? (
            <QuietNote spacing="flush">{t('projects.schema.noFields')}</QuietNote>
          ) : (
            <>
              <InheritedFields type={type} inherited={inherited} summary={summary} />
              <ul className="fieldlist" data-testid={`project-type-fields-${type.id}`}>
                {type.fields.map((field) => (
                  <TypeFieldRow
                    key={field.id}
                    field={asFieldDefinition(field)}
                    canEdit
                    busy={busy}
                    summary={summary}
                    remove={removeField}
                  />
                ))}
              </ul>
            </>
          )}

          <NewButton
            tone="secondary"
            size="sm"
            data-testid={`project-field-add-${type.id}`}
            onClick={() => setAdding(true)}
          >
            {t('projects.schema.addField')}
          </NewButton>

          {adding ? (
            <FieldDialog
              field={null}
              owner={type.name}
              kinds={PROJECT_FIELD_KINDS}
              save={(input) => addProjectField(projectId, type.id, input)}
              onClose={() => setAdding(false)}
              onSaved={async () => {
                setAdding(false)
                refresh()
              }}
            />
          ) : null}
        </div>
      ) : null}
    </TypeRow>
  )
}
