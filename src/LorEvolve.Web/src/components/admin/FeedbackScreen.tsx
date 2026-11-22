import { useCallback, useState } from 'react'
import { EmptyState } from '../EmptyState'
import { FeedbackKind, listFeedback } from '../../feedback/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { PageHeader } from '../PageHeader'
import { Pager } from '../Pager'
import { ReadGate } from '../ReadGate'
import { QuietNote } from '../QuietNote'
import { DateText } from '../DateText'

/** Bug reports and feature requests from the button on every signed-in page, newest first. Read only. */
export function FeedbackScreen() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listFeedback(page, signal), [page])
  const { load: state, retry } = useAsyncRead(load)

  return (
    <>
      <PageHeader title={t('admin.feedback.title')} lede={t('admin.feedback.lede')} />
      <ReadGate
        load={state}
        loading={{ text: t('admin.feedback.reading') }}
        error={{ onRetry: retry }}
      >
        {(feedback) =>
          feedback.items.length === 0 ? (
            <EmptyState testId="admin-feedback-empty" title={t('admin.feedback.empty')} />
          ) : (
            <>
              <ul className="feedbackreports" data-testid="admin-feedback">
                {feedback.items.map((report) => (
                  <li
                    className="feedbackreport"
                    key={report.id}
                    data-testid="admin-feedback-report"
                  >
                    <QuietNote className="feedbackreport__meta">
                      <strong>
                        {report.kind === FeedbackKind.Bug
                          ? t('admin.feedback.bug')
                          : t('admin.feedback.featureRequest')}
                      </strong>
                      {' · '}
                      <bdi>{report.userName ?? t('admin.feedback.removedAccount')}</bdi>
                      {' · '}
                      <DateText value={report.createdAt} withTime />
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
                totalPages={Math.ceil(feedback.totalCount / feedback.pageSize)}
                onPage={setPage}
              />
            </>
          )
        }
      </ReadGate>
    </>
  )
}
