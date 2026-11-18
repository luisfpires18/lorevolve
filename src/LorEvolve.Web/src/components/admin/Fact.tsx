import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { NOT_RECORDED, NOT_TRACKED } from '../../admin/adminConstants'

// ---------- One account ----------

export function Fact({
  label,
  value,
  testId,
}: {
  label: string
  value: ReactNode | typeof NOT_TRACKED | typeof NOT_RECORDED
  testId: string
}) {
  const { t } = useI18n()
  return (
    <div className="facts__row">
      <dt className="facts__key">{label}</dt>
      <dd
        className={
          value === NOT_TRACKED || value === NOT_RECORDED
            ? 'facts__value adminfact--none'
            : 'facts__value'
        }
        data-testid={testId}
      >
        {value === NOT_TRACKED
          ? t('admin.untracked.value')
          : value === NOT_RECORDED
            ? t('admin.user.beforeRecords')
            : value}
      </dd>
    </div>
  )
}
