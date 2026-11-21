import { Link } from 'react-router-dom'
import type { Chronology } from '../../chronology/types'
import { useI18n } from '../../i18n'
import { formatSpan } from '../../progression/eras'
import type { Progression } from '../../progression/types'
import { withEra } from '../../progression/eraSearch'

/** The eras on the main profile, each with its span, what happens then and how many fields it sets. */
export function EraList({
  progression,
  chronology,
  params,
}: {
  progression: Progression
  chronology: Chronology
  params: URLSearchParams
}) {
  const { t, tn } = useI18n()
  return (
    <ol className="plainlist stack" data-testid="era-list">
      {progression.eras.map((era) => {
        const span = formatSpan(chronology, era.start, era.end)
        return (
          <li className="eralist__item" key={era.id}>
            <Link className="eralist__name" to={{ search: withEra(params, era.id) }}>
              {era.name}
            </Link>
            {span ? <span className="eralist__span">{span}</span> : null}
            {era.description ? (
              <p className="eralist__description prose">{era.description}</p>
            ) : null}
            <p className="eralist__meta">
              {era.fields.length === 0
                ? t('progression.view.eraMeta.none')
                : tn('progression.view.eraMeta.own', era.fields.length)}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
