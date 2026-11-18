import { useI18n } from '../../i18n'

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
    <div className="notice notice--error" role="alert" data-testid="relationship-error">
      <p>{message ?? readError}</p>
      {readError && !message ? (
        <button className="button button--secondary" type="button" onClick={() => void load()}>
          {t('relationships.section.retry')}
        </button>
      ) : null}
    </div>
  )
}
