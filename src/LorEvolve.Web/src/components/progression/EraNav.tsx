import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { EntityDetail } from '../../lore/types'
import type { Era, Progression } from '../../progression/types'
import { withEra, withoutEra } from '../../progression/eraSearch'

/** The era nav: the main profile, then each era in the author's order. */
export function EraNav({
  entry,
  progression,
  selected,
  params,
}: {
  entry: EntityDetail
  progression: Progression
  selected: Era | null
  params: URLSearchParams
}) {
  const { t } = useI18n()
  return (
    <nav
      className="eranav"
      aria-label={t('progression.view.nav', { name: entry.name })}
      data-testid="era-nav"
    >
      <ul className="eranav__list">
        <li>
          <Link
            className="eranav__link"
            to={{ search: withoutEra(params) }}
            aria-current={selected ? undefined : 'page'}
            data-testid="era-nav-main"
          >
            {t('progression.view.mainProfile')}
          </Link>
        </li>
        {progression.eras.map((era) => (
          <li key={era.id}>
            <Link
              className="eranav__link"
              to={{ search: withEra(params, era.id) }}
              aria-current={selected?.id === era.id ? 'page' : undefined}
              data-testid={`era-nav-${era.name}`}
            >
              {era.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
