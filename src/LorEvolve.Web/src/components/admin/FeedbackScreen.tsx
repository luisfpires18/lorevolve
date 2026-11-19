import { useCallback, useState } from 'react'
import { EmptyState } from '../EmptyState'
import { formatDateTime } from '../../lib/dates'
import { FeedbackKind, listFeedback } from '../../feedback/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { LoadError } from '../LoadError'
import { Heading } from './Heading'
import { Pager } from '../Pager'
import { LoadingNote } from '../LoadingNote'
import { QuietNote } from '../QuietNote'

/** Bug reports and feature requests from the button on every signed-in page, newest first. Read only. */
export function FeedbackScreen() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listFeedback(page, signal), [page])
  const { load: state, retry } = useAsyncRead(load)

  return (
    <>
      <Heading title={t('admin.feedback.title')} lede={t('admin.feedback.lede')} />
      {state.kind === 'loading' ? <LoadingNote>{t('admin.feedback.reading')}</LoadingNote> : null}
      {state.kind === 'error' ? <LoadError message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' && state.value.items.length === 0 ? (
        <EmptyState testId="admin-feedback-empty" title={t('admin.feedback.empty')} />
      ) : null}
      {state.kind === 'ready' && state.value.items.length > 0 ? (
        <>
          <ul className="feedbackreports" data-testid="admin-feedback">
            {state.value.items.map((report) => (
              <li className="feedbackreport" key={report.id} data-testid="admin-feedback-report">
                <QuietNote className="feedbackreport__meta">
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
                </QuietNote>
                <p className="feedbackreport__text" dir="auto">
                  {report.text}
                </p>
              </li>
            ))}
          </ul>
          <Pager
            page={page}
            totalPages={Math.ceil(state.value.totalCount / state.value.pageSize)}
            onPage={setPage}
          />
        </>
      ) : null}
    </>
  )
}
