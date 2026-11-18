import { useI18n } from '../../i18n'

export function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="notice notice--error" role="alert">
      <p>{message}</p>
      <button className="button button--secondary" type="button" onClick={onRetry}>
        {t('admin.tryAgain')}
      </button>
    </div>
  )
}
