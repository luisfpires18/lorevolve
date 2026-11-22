import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { TargetChoice } from '../../lore/fieldDraft'
import type { EntityTypeGroup, FieldDefinition } from '../../lore/typeDefinitions'
import { typePathLabel, type TypeTree } from '../../lore/typeTree'

/** What a link field may point at: any Lore type, a group, or one type. */
export function FieldLinkTarget({
  field,
  tree,
  groups,
  isLink,
  target,
  setTarget,
  fieldErrors,
}: {
  field: FieldDefinition | null
  tree: TypeTree
  groups: EntityTypeGroup[]
  isLink: boolean
  target: TargetChoice
  setTarget: (target: TargetChoice) => void
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <>
      {isLink ? (
        <Field
          as="select"
          label={t('entityTypes.fields.canLinkTo')}
          id="field-target"
          error={fieldErrors.target}
          hint={
            <>
              {target === null
                ? t('entityTypes.fields.targetHintNone')
                : target === 'any'
                  ? t('entityTypes.fields.targetHintAny')
                  : target.startsWith('group:')
                    ? t('entityTypes.fields.targetHintGroup')
                    : t('entityTypes.fields.targetHintType')}
              {field && field.entryCount > 0 ? (
                <> {t('entityTypes.fields.targetNarrowHint')}</>
              ) : null}
            </>
          }
          value={target ?? ''}
          onChange={(event) => setTarget((event.target.value || null) as TargetChoice)}
          data-testid="field-target"
        >
          {target === null ? (
            <option value="" disabled>
              {t('entityTypes.fields.chooseTarget')}
            </option>
          ) : null}
          <option value="any">{t('entityTypes.fields.anyLoreType')}</option>
          {groups.length > 0 ? (
            <optgroup label={t('entityTypes.fields.optgroupGroups')}>
              {groups.map((group) => (
                <option key={group.id} value={`group:${group.id}`}>
                  {t('entityTypes.fields.groupOption', { name: group.name })}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label={t('entityTypes.fields.optgroupTypes')}>
            {tree.ordered.map((node) => (
              <option key={node.type.id} value={`type:${node.type.id}`}>
                {typePathLabel(node)}
              </option>
            ))}
          </optgroup>
        </Field>
      ) : null}
    </>
  )
}
