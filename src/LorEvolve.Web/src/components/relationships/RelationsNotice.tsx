import { useI18n } from '../../i18n'
import { Button } from '../Button'

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
        <Button tone="secondary" onClick={() => void load()}>
          {t('relationships.section.retry')}
        </Button>
      ) : null}
    </div>
  )
}
