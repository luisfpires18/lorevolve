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
  testPrefix = 'ai-change',
}: {
  change: Change
  pending: boolean
  /** Titles of the waiting changes this one needs, and of those that need it. */
  needs: string[]
  neededBy: string[]
  /** The drawer names its own, so a card and its open drawer never share a test id. */
  testPrefix?: string
}) {
  const { t } = useI18n()
  const issueItems = change.issues.map((issue, index) => <li key={index}>{issue.message}</li>)

  return (
    <>
      {change.impact ? (
        <ul className="aichangeitem__impact" data-testid={`${testPrefix}-impact`}>
          {change.impact.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {pending && needs.length > 0 ? (
        <QuietNote className="aichangeitem__deps" wrap testId={`${testPrefix}-needs`}>
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
            testId={`${testPrefix}-issues`}
          >
            {issueItems}
          </Callout>
        ) : (
          <FormMessage
            as="ul"
            role={null}
            className="aichangeitem__issues"
            testId={`${testPrefix}-issues`}
          >
            {issueItems}
          </FormMessage>
        )
      ) : null}
    </>
  )
}
