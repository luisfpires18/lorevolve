import { LayoutList } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { EntityType, FieldSection } from '../../lore/typeDefinitions'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

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
      <NewButton
        tone="secondary"
        size="sm"
        onClick={() => {
          clear()
          setEditing('new')
        }}
        data-testid={`new-field-${type.name}`}
      >
        {t('entityTypes.fields.add')}
      </NewButton>
      {type.fields.length > 0 || sections.length > 0 ? (
        <Button
          tone="text"
          size="sm"
          icon={LayoutList}
          onClick={() => {
            clear()
            setArranging(true)
          }}
          data-testid={`arrange-sections-${type.name}`}
        >
          {t('entityTypes.fields.sections')}
        </Button>
      ) : null}
    </p>
  )
}
