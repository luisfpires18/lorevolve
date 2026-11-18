import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { IdeasTabs } from '../IdeasTabs'
import { ActionIcon } from '../ActionIcon'
import { PageHeader } from '../PageHeader'
import { Quoted } from '../NameList'
import type { IdeasScope } from '../../ideas/types'
import { useI18n } from '../../i18n'

/** An ideas list's heading: the nested intro inside a story or a project, or the page header and the tabs. */
export function IdeasHeader({
  isNested,
  headingId,
  scope,
  universe,
  basePath,
}: {
  isNested: boolean
  headingId: string
  scope: IdeasScope
  universe: { id: string; name: string } | null
  basePath: string
}) {
  const { t, tx } = useI18n()
  return (
    <>
      {isNested ? (
        // Inside a story or a project its own header is the page's: this is one of its views, named for a screen reader.
        <div className="ideas__intro">
          <h2 className="visually-hidden" id={headingId}>
            {t('ideas.browser.heading')}
          </h2>
          <p className="ideas__lede">
            {scope.kind === 'project'
              ? t('ideas.browser.ledeProject')
              : t('ideas.browser.ledeStory')}
          </p>
        </div>
      ) : (
        <PageHeader
          title={t('ideas.browser.heading')}
          titleId={headingId}
          lede={
            <>
              <p className="ideas__lede">
                {universe
                  ? tx('ideas.browser.ledeUniverse', { universe: <Quoted text={universe.name} /> })
                  : t('ideas.browser.ledeAll')}
              </p>
            </>
          }
          actions={
            <Link className="button" to={`${basePath}/new`} data-testid="new-idea">
              <ActionIcon icon={Plus} />
              {t('ideas.browser.newIdea')}
            </Link>
          }
        />
      )}

      {isNested ? null : <IdeasTabs basePath={basePath} current="ideas" />}
    </>
  )
}
