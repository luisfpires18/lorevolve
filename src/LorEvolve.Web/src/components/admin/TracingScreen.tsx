import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import { PageHeader } from '../PageHeader'

// ---------- Tracing ----------

export function TracingScreen() {
  const { t } = useI18n()
  return (
    <>
      <PageHeader title={t('admin.tracing.title')} lede={t('admin.tracing.lede')} />
      <EmptyState
        testId="admin-tracing-empty"
        title={t('admin.tracing.emptyTitle')}
        hint={t('admin.tracing.emptyHint')}
      />
    </>
  )
}
