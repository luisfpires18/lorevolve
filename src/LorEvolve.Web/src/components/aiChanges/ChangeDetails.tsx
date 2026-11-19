import { ChangeAction, type Change, type Proposal } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import { isProse } from '../../aiChanges/changeTraits'
import { MediaChange } from './MediaChange'
import { ProseChange } from './ProseChange'
import { QuietNote } from '../QuietNote'

/** What a change does: its lines, its prose or picture, what it touches, what it needs or is needed by, and what stops it. */
export function ChangeDetails({
  detailsId,
  universeId,
  proposal,
  change,
  pending,
  needs,
  neededBy,
  named,
  onUploaded,
}: {
  detailsId: string
  universeId: string
  proposal: Proposal
  change: Change
  pending: boolean
  needs: string[]
  neededBy: string[]
  named: (keys: string[]) => string[]
  onUploaded: (next: Proposal) => void
}) {
  const { t } = useI18n()

  return (
    <div id={detailsId}>
      {change.lines.length > 0 ? (
        <dl className="aichangeitem__lines">
          {change.lines.map((line, index) => (
            <div className="aichangeitem__line" key={`${line.label}-${index}`}>
              <dt>{line.label}</dt>
              <dd>
                {(change.action === ChangeAction.Update ||
                  change.action === ChangeAction.Reorder) &&
                !isProse(change) ? (
                  <>
                    <span className="aichangeitem__before" dir="auto">
                      <span className="visually-hidden">{t('review.aiChange.item.now')}</span>
                      {line.before ?? t('review.aiChange.item.empty')}
                    </span>
                    <span className="aichangeitem__arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="aichangeitem__after" dir="auto">
                      <span className="visually-hidden">{t('review.aiChange.item.proposed')}</span>
                      {line.after ?? t('review.aiChange.item.empty')}
                    </span>
                  </>
                ) : (
                  <span dir="auto">{line.after}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {change.prose ? <ProseChange change={change} /> : null}

      {change.media ? (
        <MediaChange
          universeId={universeId}
          proposal={proposal}
          change={change}
          onUploaded={onUploaded}
        />
      ) : null}

      {change.impact ? (
        <ul className="aichangeitem__impact" data-testid="ai-change-impact">
          {change.impact.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {pending && needs.length > 0 ? (
        <QuietNote className="aichangeitem__deps" wrap testId="ai-change-needs">
          {t('review.aiChange.item.needs', { list: named(needs).join('; ') })}
        </QuietNote>
      ) : null}
      {pending && neededBy.length > 0 ? (
        <QuietNote className="aichangeitem__deps" wrap>
          {t('review.aiChange.item.neededBy', { list: named(neededBy).join('; ') })}
        </QuietNote>
      ) : null}

      {pending && change.issues.length > 0 ? (
        <ul
          className={
            change.isConflict
              ? 'callout callout--warning aichangeitem__issues'
              : 'form__message aichangeitem__issues'
          }
          data-testid="ai-change-issues"
        >
          {change.issues.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
