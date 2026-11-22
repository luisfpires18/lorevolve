import { useI18n } from '../../i18n'
import type { EntityType } from '../../lore/typeDefinitions'
import { StatusNotice } from '../Callout'
import { LoadError } from '../LoadError'

/** Above the Lore types: a failure with Retry when the list could not be read, and the status line. */
export function TypesNotices({
  types,
  message,
  setMessage,
  notice,
  refresh,
}: {
  types: EntityType[] | null
  message: string | null
  setMessage: (message: string | null) => void
  notice: string | null
  refresh: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <>
      {message ? (
        <LoadError
          message={message}
          onRetry={
            types
              ? undefined
              : () => {
                  setMessage(null)
                  refresh().catch(() => undefined)
                }
          }
          retryLabel={t('entityTypes.page.retry')}
          testId="types-error"
        />
      ) : null}

      <StatusNotice className="types__notice" testId="types-notice">
        {notice}
      </StatusNotice>
    </>
  )
}
