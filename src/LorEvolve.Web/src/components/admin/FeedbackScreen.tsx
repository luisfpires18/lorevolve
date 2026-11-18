import { useCallback, useState } from 'react'
import { EmptyState } from '../EmptyState'
import { formatDateTime } from '../../lib/dates'
import { FeedbackKind, listFeedback } from '../../feedback/api'
import { useI18n } from '../../i18n'
import { useLoad } from '../../admin/useLoad'
import { Failure } from './Failure'
import { Heading } from './Heading'
import { Button } from '../Button'

/** Bug reports and feature requests from the button on every signed-in page, newest first. Read only. */
export function FeedbackScreen() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listFeedback(page, signal), [page])
  const { state, retry } = useLoad(load)

  return (
    <>
      <Heading title={t('admin.feedback.title')} lede={t('admin.feedback.lede')} />
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.feedback.reading')}
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' && state.value.items.length === 0 ? (
        <EmptyState testId="admin-feedback-empty" title={t('admin.feedback.empty')} />
      ) : null}
      {state.kind === 'ready' && state.value.items.length > 0 ? (
        <>
          <ul className="feedbackreports" data-testid="admin-feedback">
            {state.value.items.map((report) => (
              <li className="feedbackreport" key={report.id} data-testid="admin-feedback-report">
                <p className="feedbackreport__meta">
                  <strong>
                    {report.kind === FeedbackKind.Bug
                      ? t('admin.feedback.bug')
                      : t('admin.feedback.featureRequest')}
                  </strong>
                  {' · '}
                  <bdi>{report.userName ?? t('admin.feedback.removedAccount')}</bdi>
                  {' · '}
                  {formatDateTime(report.createdAt)}
                  {report.page ? (
                    <>
                      {' · '}
                      <code>{report.page}</code>
                    </>
                  ) : null}
                </p>
                <p className="feedbackreport__text" dir="auto">
                  {report.text}
                </p>
              </li>
            ))}
          </ul>
          {state.value.totalCount > state.value.pageSize ? (
            <nav className="pager" aria-label={t('admin.feedback.pager.label')}>
              <Button tone="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                {t('admin.feedback.pager.newer')}
              </Button>
              <Button
                tone="secondary"
                disabled={page * state.value.pageSize >= state.value.totalCount}
                onClick={() => setPage(page + 1)}
              >
                {t('admin.feedback.pager.older')}
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  )
}
