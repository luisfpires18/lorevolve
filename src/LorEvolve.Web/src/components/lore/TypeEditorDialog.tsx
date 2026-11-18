import { TypeDialog } from '../TypeDialog'
import { useI18n } from '../../i18n'
import { createEntityType, updateEntityType } from '../../lore/typesApi'
import type { EntityType, EntityTypeGroup } from '../../lore/typeDefinitions'
import type { TypeTree } from '../../lore/typeTree'

/** The Types screen's drawer for a new type or an existing one, saved through the Lore types API. */
export function TypeEditorDialog({
  universe,
  tree,
  groups,
  editing,
  setEditing,
  childOf,
  setBlocked,
  setNotice,
  refresh,
}: {
  universe: { id: string }
  tree: TypeTree
  groups: EntityTypeGroup[]
  editing: EntityType | 'new'
  setEditing: (editing: null) => void
  childOf: EntityType | null
  setBlocked: (blocked: null) => void
  setNotice: (notice: string) => void
  refresh: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <TypeDialog
      tree={tree}
      type={editing === 'new' ? null : editing}
      initialParent={editing === 'new' ? childOf : null}
      groups={groups}
      write={(values) =>
        editing === 'new'
          ? createEntityType(universe.id, {
              name: values.name,
              description: null,
              icon: values.icon,
              accentColor: null,
              displayOrder: null,
              familyTreeEligible: values.familyTreeEligible,
              parent: { id: values.parentId },
              ...(values.groups ? { groups: values.groups } : {}),
            })
          : // What this drawer does not edit - the description, the colour, the order, the Family Tree choice - goes
            // back exactly as it is stored.
            updateEntityType(universe.id, editing.id, {
              name: values.name,
              description: editing.description,
              icon: values.icon,
              accentColor: editing.accentColor,
              displayOrder: editing.displayOrder,
              familyTreeEligible: editing.familyTreeEligible,
              parent: { id: values.parentId },
              ...(values.groups ? { groups: values.groups } : {}),
            })
      }
      onClose={() => setEditing(null)}
      onSaved={async (savedName, parentId) => {
        const wasNew = editing === 'new'
        // Made from a row's Add child: said with where it went, which is where the author chose in the end.
        const parent =
          wasNew && childOf && parentId ? tree.byId.get(parentId)?.type.name : undefined
        setEditing(null)
        setBlocked(null)
        setNotice(
          parent
            ? t('entityTypes.page.createdInside', { name: savedName, parent })
            : wasNew
              ? t('entityTypes.page.created', { name: savedName })
              : t('entityTypes.page.saved', { name: savedName }),
        )
        await refresh()
      }}
    />
  )
}
