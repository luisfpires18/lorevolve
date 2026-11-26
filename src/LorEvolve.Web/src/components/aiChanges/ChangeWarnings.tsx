import { type Change } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'
import { FormMessage } from '../FormMessage'
import { Callout } from '../Callout'

/** What a reviewer must know before deciding: what a change touches, what it needs or is needed by, and what stops it. */
export function ChangeWarnings({
  change,
  pending,
  needs,
  neededBy,
}: {
  change: Change
  pending: boolean
  /** Titles of the waiting changes this one needs, and of those that need it. */
  needs: string[]
  neededBy: string[]
}) {
  const { t } = useI18n()
  const issueItems = change.issues.map((issue, index) => <li key={index}>{issue.message}</li>)

  return (
    <>
      {change.impact ? (
        <ul className="aichangeitem__impact" data-testid="ai-change-impact">
          {change.impact.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {pending && needs.length > 0 ? (
        <QuietNote className="aichangeitem__deps" wrap testId="ai-change-needs">
          {t('review.aiChange.item.needs', { list: needs.join('; ') })}
        </QuietNote>
      ) : null}
      {pending && neededBy.length > 0 ? (
        <QuietNote className="aichangeitem__deps" wrap>
          {t('review.aiChange.item.neededBy', { list: neededBy.join('; ') })}
        </QuietNote>
      ) : null}

      {pending && change.issues.length > 0 ? (
        change.isConflict ? (
          <Callout
            look="callout"
            tone="warning"
            as="ul"
            className="aichangeitem__issues"
            testId="ai-change-issues"
          >
            {issueItems}
          </Callout>
        ) : (
          <FormMessage
            as="ul"
            role={null}
            className="aichangeitem__issues"
            testId="ai-change-issues"
          >
            {issueItems}
          </FormMessage>
        )
      ) : null}
    </>
  )
}
