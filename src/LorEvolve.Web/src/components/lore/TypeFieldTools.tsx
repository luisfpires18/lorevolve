import { LayoutList, Plus } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import type { EntityType, FieldSection } from '../../lore/typeDefinitions'

/** Under a type's fields: Add field, and Sections once there is anything to arrange. */
export function TypeFieldTools({
  type,
  sections,
  clear,
  setEditing,
  setArranging,
}: {
  type: EntityType
  sections: FieldSection[]
  clear: () => void
  setEditing: (editing: 'new') => void
  setArranging: (arranging: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <p className="fieldlist__tools">
      <button
        className="button button--secondary button--sm"
        type="button"
        onClick={() => {
          clear()
          setEditing('new')
        }}
        data-testid={`new-field-${type.name}`}
      >
        <ActionIcon icon={Plus} />
        {t('entityTypes.fields.add')}
      </button>
      {type.fields.length > 0 || sections.length > 0 ? (
        <button
          className="button button--text button--sm"
          type="button"
          onClick={() => {
            clear()
            setArranging(true)
          }}
          data-testid={`arrange-sections-${type.name}`}
        >
          <ActionIcon icon={LayoutList} />
          {t('entityTypes.fields.sections')}
        </button>
      ) : null}
    </p>
  )
}
