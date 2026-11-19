import { t } from '../../i18n'
import { VIEWS } from '../../projects/shelfViews'
import { ViewLinks } from '../ViewLinks'

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
    <ViewLinks
      label={t(`projects.${views.words}.viewsLabel`)}
      testId={`${views.testId}-views`}
      items={[
        {
          to: '?',
          label: t(`projects.${views.words}.projectsView`),
          current: !showView,
          testId: `${views.testId}-view-projects`,
        },
        {
          to: `?view=${view}`,
          label: t(`projects.${views.words}.${views.second}` as 'projects.sagas.sagasView'),
          current: showView,
          testId: views.secondTestId,
        },
      ]}
    />
  )
}
