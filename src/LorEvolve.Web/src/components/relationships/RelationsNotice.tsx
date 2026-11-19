import { useI18n } from '../../i18n'
import { LoadError } from '../LoadError'

export function RelationsNotice({
  message,
  readError,
  load,
}: {
  message: string | null
  readError: string | null
  load: () => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <LoadError
      message={message ?? readError}
      onRetry={readError && !message ? () => void load() : undefined}
      retryLabel={t('relationships.section.retry')}
      testId="relationship-error"
    />
  )
}
