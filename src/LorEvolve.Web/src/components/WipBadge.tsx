import { useI18n } from '../i18n'

/** Marks a section that is shown but not yet working properly. */
export function WipBadge() {
  const { t } = useI18n()
  return (
    <span className="wipbadge" title={t('entity.wip.title')}>
      {t('entity.wip.label')}
    </span>
  )
}
