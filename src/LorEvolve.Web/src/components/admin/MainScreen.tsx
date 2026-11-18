import { getOverview } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useLoad } from '../../admin/useLoad'
import { DatabaseBackups } from './DatabaseBackups'
import { Failure } from './Failure'
import { Heading } from './Heading'
import { Overview } from './Overview'

export function MainScreen() {
  const { t } = useI18n()
  const { state, retry } = useLoad(getOverview)

  return (
    <>
      <Heading title={t('admin.main.title')} lede={t('admin.main.lede')} />

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.main.counting')}
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <Overview overview={state.value} /> : null}
      <DatabaseBackups />
    </>
  )
}
