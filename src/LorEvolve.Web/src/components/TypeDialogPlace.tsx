import { Field } from './Field'
import { useI18n } from '../i18n'
import { typePathLabel, type TreeType, type TypeNode } from '../lore/typeTree'
import { DrawerSection } from './Section'

/** The type drawer's hierarchy section: where the type sits, at the top or inside another type. */
export function TypeDialogPlace({
  parentHint,
  parentId,
  setParentId,
  parents,
  fieldErrors,
}: {
  parentHint?: string
  parentId: string | null
  setParentId: (parentId: string | null) => void
  parents: TypeNode<TreeType>[]
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <DrawerSection title={t('entityTypes.page.dialog.hierarchy')} titleId="type-hierarchy">
      <Field
        as="select"
        label={t('entityTypes.page.dialog.parent')}
        id="type-parent"
        hint={parentHint ?? t('entityTypes.page.dialog.parentHint')}
        error={fieldErrors.parent}
        value={parentId ?? ''}
        onChange={(event) => setParentId(event.target.value || null)}
        data-testid="type-parent"
      >
        <option value="">{t('entityTypes.page.dialog.parentNone')}</option>
        {parents.map((node) => (
          <option key={node.type.id} value={node.type.id}>
            {typePathLabel(node)}
          </option>
        ))}
      </Field>
    </DrawerSection>
  )
}
