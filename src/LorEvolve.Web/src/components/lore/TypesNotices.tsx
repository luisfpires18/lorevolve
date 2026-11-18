import { useI18n } from '../../i18n'
import type { EntityType } from '../../lore/typeDefinitions'

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
        <div className="notice notice--error" role="alert" data-testid="types-error">
          <p>{message}</p>
          {!types ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setMessage(null)
                refresh().catch(() => undefined)
              }}
            >
              {t('entityTypes.page.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="types__notice" role="status" data-testid="types-notice">
        {notice}
      </p>
    </>
  )
}
