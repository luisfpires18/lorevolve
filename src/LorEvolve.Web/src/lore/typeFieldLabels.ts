import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_KIND_LABELS,
  FIELD_SEMANTIC_LABELS,
  FieldImageShape,
  FieldKind,
} from './fieldKinds'
import type { EntityTypeGroup, FieldDefinition } from './typeDefinitions'
import { typePathLabel, type TypeTree } from './typeTree'
import type { useI18n } from '../i18n'

/** A type's fields in words: what a link field may point at, and the one line under a field's name. */
export function typeFieldLabels({
  t,
  tree,
  groups,
}: {
  tree: TypeTree
  groups: EntityTypeGroup[]
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  /** A link field's allowed target in words, from the types and groups as they are now. */
  function targetLabel(field: Pick<FieldDefinition, 'targetEntityTypeId' | 'targetGroupId'>) {
    if (field.targetGroupId) {
      const group = groups.find((each) => each.id === field.targetGroupId)
      return group
        ? t('entityTypes.fields.targetAnyIn', { name: group.name })
        : t('entityTypes.fields.targetGroup')
    }
    const node = field.targetEntityTypeId ? tree.byId.get(field.targetEntityTypeId) : undefined
    return node ? typePathLabel(node) : t('entityTypes.fields.targetAny')
  }

  /** One line under a field's name: its kind, whether it is required, and what it links to or means. */
  function summary(field: FieldDefinition) {
    const parts = [
      FIELD_KIND_LABELS[field.kind],
      field.kind === FieldKind.Image
        ? FIELD_IMAGE_SHAPE_LABELS[field.imageShape ?? FieldImageShape.Free]
        : field.isRequired
          ? t('entityTypes.fields.required')
          : t('entityTypes.fields.optional'),
    ]
    if (field.kind === FieldKind.EntityReference) {
      parts.push(t('entityTypes.fields.linksTo', { target: targetLabel(field) }))
    }
    if (field.semantic !== null && field.semantic !== undefined) {
      parts.push(
        t('entityTypes.fields.canonMeaning', {
          meaning: FIELD_SEMANTIC_LABELS[field.semantic].toLowerCase(),
        }),
      )
    }
    return parts.join(' · ')
  }

  return { targetLabel, summary }
}
