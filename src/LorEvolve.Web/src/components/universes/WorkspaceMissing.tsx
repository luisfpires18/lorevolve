import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'

/** A universe that is not there, or not this account's to open. */
export function WorkspaceMissing() {
  return (
    <EmptyState
      testId="universe-missing"
      title={t('workspace.missing.title')}
      hint={
        <>
          It may have been deleted, or it belongs to someone else.{' '}
          <Link to="/app">{t('workspace.missing.back')}</Link>
        </>
      }
    />
  )
}
