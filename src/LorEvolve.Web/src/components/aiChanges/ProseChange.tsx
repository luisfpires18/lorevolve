import type { Change } from '../../aiChanges/types'
import { compareProse } from '../../aiChanges/diff'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'

/** A manuscript change, as prose: what is added, or the paragraphs it would take out and put in. */
export function ProseChange({ change }: { change: Change }) {
  const { t, tn } = useI18n()
  const prose = change.prose!
  if (prose.append || prose.current === null) {
    return (
      <div className="aichangeprose">
        <QuietNote className="aichangeprose__label">
          {prose.append ? t('review.aiChange.prose.appended') : t('review.aiChange.prose.added')}
        </QuietNote>
        <div className="aichangeprose__text aichangeprose__text--added" dir="auto">
          {prose.proposed}
        </div>
      </div>
    )
  }

  const parts = compareProse(prose.current, prose.proposed)
  return (
    <div className="aichangeprose" data-testid="ai-change-prose">
      <QuietNote className="aichangeprose__label">{t('review.aiChange.prose.changes')}</QuietNote>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          <p className="aichangeprose__same" key={index}>
            {tn('review.aiChange.prose.unchanged', part.paragraphs.length, {
              n: part.paragraphs.length,
            })}
          </p>
        ) : (
          <div
            className={`aichangeprose__text aichangeprose__text--${part.kind}`}
            key={index}
            dir="auto"
          >
            <span className="visually-hidden">
              {part.kind === 'added'
                ? t('review.aiChange.prose.addedHidden')
                : t('review.aiChange.prose.removedHidden')}
            </span>
            {part.paragraphs.join('\n\n')}
          </div>
        ),
      )}
    </div>
  )
}
