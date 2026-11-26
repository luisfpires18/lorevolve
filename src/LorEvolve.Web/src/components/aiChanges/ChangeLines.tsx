import { ChangeAction, type Change, type ChangeLine } from '../../aiChanges/types'
import { isProse } from '../../aiChanges/changeTraits'
import { useI18n } from '../../i18n'

/** A change's lines: "now → proposed" for an edit or a new order, the proposed value otherwise. */
export function ChangeLines({ change, lines }: { change: Change; lines: ChangeLine[] }) {
  const { t } = useI18n()
  if (lines.length === 0) return null
  const compared =
    (change.action === ChangeAction.Update || change.action === ChangeAction.Reorder) &&
    !isProse(change)

  return (
    <dl className="aichangeitem__lines">
      {lines.map((line, index) => (
        <div className="aichangeitem__line" key={`${line.label}-${index}`}>
          <dt>{line.label}</dt>
          <dd>
            {compared ? (
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
  )
}
