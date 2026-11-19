import { getOverview } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { DatabaseBackups } from './DatabaseBackups'
import { LoadError } from '../LoadError'
import { Heading } from './Heading'
import { Overview } from './Overview'
import { LoadingNote } from '../LoadingNote'

export function MainScreen() {
  const { t } = useI18n()
  const { load: state, retry } = useAsyncRead(getOverview)

  return (
    <>
      <Heading title={t('admin.main.title')} lede={t('admin.main.lede')} />

      {state.kind === 'loading' ? <LoadingNote>{t('admin.main.counting')}</LoadingNote> : null}
      {state.kind === 'error' ? <LoadError message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <Overview overview={state.value} /> : null}
      <DatabaseBackups />
    </>
  )
}
