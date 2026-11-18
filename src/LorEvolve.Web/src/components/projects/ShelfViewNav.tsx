import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { VIEWS } from '../../projects/shelfViews'

export function ShelfViewNav({
  views,
  view,
  showView,
}: {
  views: (typeof VIEWS)[keyof typeof VIEWS]
  view: keyof typeof VIEWS | undefined
  showView: boolean
}) {
  return (
    <nav
      className="views"
      aria-label={t(`projects.${views.words}.viewsLabel`)}
      data-testid={`${views.testId}-views`}
    >
      <Link
        className="views__link"
        to="?"
        aria-current={showView ? undefined : 'page'}
        data-testid={`${views.testId}-view-projects`}
      >
        {t(`projects.${views.words}.projectsView`)}
      </Link>
      <Link
        className="views__link"
        to={`?view=${view}`}
        aria-current={showView ? 'page' : undefined}
        data-testid={views.secondTestId}
      >
        {t(`projects.${views.words}.${views.second}` as 'projects.sagas.sagasView')}
      </Link>
    </nav>
  )
}
