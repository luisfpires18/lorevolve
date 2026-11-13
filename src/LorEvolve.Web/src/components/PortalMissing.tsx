import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useI18n } from '../i18n'

/**
 * The one page every public address answers with when it has nothing to show: a private world, a private or trashed
 * entry or story, an author with nothing public, and an address nobody ever held all read the same, and none of them
 * says which it was (ADR 0036, 0037).
 */
export function PortalMissing({ title, testId }: { title: string; testId: string }) {
  const { t } = useI18n()
  useDocumentTitle(t('portal.missing.documentTitle'))
  return (
    <div className="pmissing" data-testid={testId}>
      <h1 className="pmissing__title">{title}</h1>
      <p className="pmissing__hint">{t('portal.missing.hint')}</p>
      <Link className="portal__pill" to="/">
        {t('portal.missing.explore')}
      </Link>
    </div>
  )
}

/** A public page that could not be read at all - never mistaken for one that is not there. */
export function PortalError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  useDocumentTitle(t('portal.error.documentTitle'))
  return (
    <div className="pmissing" role="alert" data-testid="public-error">
      <h1 className="pmissing__title">{t('portal.error.title')}</h1>
      <p className="pmissing__hint">{t('portal.error.hint')}</p>
      <button className="portal__pill" type="button" onClick={onRetry}>
        {t('portal.error.retry')}
      </button>
    </div>
  )
}
