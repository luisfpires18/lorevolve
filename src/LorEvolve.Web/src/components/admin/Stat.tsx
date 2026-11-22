import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { NOT_TRACKED } from '../../admin/adminConstants'

export function Stat({
  label,
  value,
  source,
  testId,
}: {
  label: string
  value: ReactNode | typeof NOT_TRACKED
  source: ReactNode
  testId: string
}) {
  const { t } = useI18n()
  const tracked = value !== NOT_TRACKED
  return (
    <li className="adminstat" data-testid={testId} data-tracked={tracked}>
      <span className="adminstat__label">{label}</span>
      <span
        className={tracked ? 'adminstat__value' : 'adminstat__value adminstat__value--none'}
        data-testid={`${testId}-value`}
      >
        {value === NOT_TRACKED ? t('admin.untracked.value') : value}
      </span>
      <span className="adminstat__source">{source}</span>
    </li>
  )
}
