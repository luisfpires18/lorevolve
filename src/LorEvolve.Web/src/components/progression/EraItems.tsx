import { useI18n } from '../../i18n'
import type { Ability, Era, Form } from '../../progression/types'
import { SectionTitle } from '../Section'

/** What is available in one era - only what the author ticked for it - with where it was first unlocked, if here. */
export function EraItems({
  heading,
  era,
  items,
  testId,
}: {
  heading: string
  era: Era
  items: (Form | Ability)[]
  testId: string
}) {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <div className="rail__block">
      <SectionTitle level={4} tone="label">
        {heading}
      </SectionTitle>
      <ul className="eracovers" data-testid={testId}>
        {items.map((item) => (
          <li key={item.id} data-testid={`${testId}-${item.name}`}>
            <bdi>{item.name}</bdi>
            {item.unlock.era?.id === era.id ? (
              <span className="erasource erasource--era">
                {' '}
                {t('progression.era.firstUnlocked')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
