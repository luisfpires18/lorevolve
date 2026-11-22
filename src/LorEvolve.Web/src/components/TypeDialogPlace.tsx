import { Field } from './Field'
import { useI18n } from '../i18n'
import { typePathLabel, type TreeType, type TypeNode } from '../lore/typeTree'
import { SectionTitle } from './Section'

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
    <section className="drawer__group" aria-labelledby="type-hierarchy">
      <SectionTitle level={3} tone="rule-accent" id="type-hierarchy">
        {t('entityTypes.page.dialog.hierarchy')}
      </SectionTitle>
      <Field
        label={t('entityTypes.page.dialog.parent')}
        id="type-parent"
        hint={parentHint ?? t('entityTypes.page.dialog.parentHint')}
        error={fieldErrors.parent}
      >
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select"
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
          </select>
        )}
      </Field>
    </section>
  )
}
