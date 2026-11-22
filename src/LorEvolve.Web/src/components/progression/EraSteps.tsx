import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { EntityDetail } from '../../lore/types'
import type { Era } from '../../progression/types'
import { withEra, withoutEra } from '../../progression/eraSearch'

/** Links to the era before, the main profile and the era after, for reading the progression straight through. */
export function EraSteps({
  entry,
  previous,
  next,
  params,
}: {
  entry: EntityDetail
  previous: Era | null
  next: Era | null
  params: URLSearchParams
}) {
  const { t } = useI18n()
  return (
    <nav
      className="erasteps"
      aria-label={t('progression.era.otherStages', { name: entry.name })}
      data-testid="era-steps"
    >
      {previous ? (
        <Link className="erasteps__link" to={{ search: withEra(params, previous.id) }} rel="prev">
          <span aria-hidden="true">← </span>
          <span className="visually-hidden">{t('progression.era.earlier')}</span>
          <bdi>{previous.name}</bdi>
        </Link>
      ) : null}
      <Link
        className="erasteps__link"
        to={{ search: withoutEra(params) }}
        data-testid="era-steps-main"
      >
        {t('progression.era.mainProfile')}
      </Link>
      {next ? (
        <Link className="erasteps__link" to={{ search: withEra(params, next.id) }} rel="next">
          <span className="visually-hidden">{t('progression.era.later')}</span>
          <bdi>{next.name}</bdi>
          <span aria-hidden="true"> →</span>
        </Link>
      ) : null}
    </nav>
  )
}
