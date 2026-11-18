import { useI18n } from '../../i18n'
import { Button } from '../Button'

export function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="notice notice--error" role="alert">
      <p>{message}</p>
      <Button tone="secondary" onClick={onRetry}>
        {t('admin.tryAgain')}
      </Button>
    </div>
  )
}
