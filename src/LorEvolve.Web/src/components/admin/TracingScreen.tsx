import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import { Heading } from './Heading'

// ---------- Tracing ----------

export function TracingScreen() {
  const { t } = useI18n()
  return (
    <>
      <Heading title={t('admin.tracing.title')} lede={t('admin.tracing.lede')} />
      <EmptyState
        testId="admin-tracing-empty"
        title={t('admin.tracing.emptyTitle')}
        hint={t('admin.tracing.emptyHint')}
      />
    </>
  )
}
