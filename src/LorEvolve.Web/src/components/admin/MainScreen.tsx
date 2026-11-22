import { getOverview } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { DatabaseBackups } from './DatabaseBackups'
import { PageHeader } from '../PageHeader'
import { Overview } from './Overview'
import { ReadGate } from '../ReadGate'

export function MainScreen() {
  const { t } = useI18n()
  const { load: state, retry } = useAsyncRead(getOverview)

  return (
    <>
      <PageHeader title={t('admin.main.title')} lede={t('admin.main.lede')} />

      <ReadGate
        load={state}
        loading={{ text: t('admin.main.counting') }}
        error={{ onRetry: retry }}
      >
        {(overview) => <Overview overview={overview} />}
      </ReadGate>
      <DatabaseBackups />
    </>
  )
}
