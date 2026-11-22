import { IdeasTabs } from '../IdeasTabs'
import { PageHeader } from '../PageHeader'
import { Quoted } from '../NameList'
import { useI18n } from '../../i18n'
import { NewButton } from '../NewButton'

/**
 * An Ideas or Boards list's heading: the nested intro inside a story or a project (ideas only), or the page header
 * and the tabs. `basePath` is the ideas list's path; the boards are at `${basePath}/boards`.
 */
export function IdeasHeader({
  headingId,
  universe,
  basePath,
  nested = null,
  current = 'ideas',
}: {
  headingId: string
  universe: { id: string; name: string } | null
  basePath: string
  /** Inside a story or a project: its own header is the page's. */
  nested?: 'story' | 'project' | null
  current?: 'ideas' | 'boards'
}) {
  const { t, tx } = useI18n()
  const boards = current === 'boards'
  return (
    <>
      {nested !== null ? (
        // Inside a story or a project its own header is the page's: this is one of its views, named for a screen reader.
        <div className="ideas__intro">
          <h2 className="visually-hidden" id={headingId}>
            {t('ideas.browser.heading')}
          </h2>
          <p className="ideas__lede">
            {nested === 'project' ? t('ideas.browser.ledeProject') : t('ideas.browser.ledeStory')}
          </p>
        </div>
      ) : (
        <PageHeader
          title={boards ? t('ideas.boards.title') : t('ideas.browser.heading')}
          titleId={headingId}
          lede={
            <p className="ideas__lede">
              {universe
                ? boards
                  ? tx('ideas.boards.ledeUniverse', { universe: <Quoted text={universe.name} /> })
                  : tx('ideas.browser.ledeUniverse', { universe: <Quoted text={universe.name} /> })
                : boards
                  ? t('ideas.boards.ledeAll')
                  : t('ideas.browser.ledeAll')}
            </p>
          }
          actions={
            boards ? (
              <NewButton to={`${basePath}/boards/new`} data-testid="new-board">
                {t('ideas.boards.newBoard')}
              </NewButton>
            ) : (
              <NewButton to={`${basePath}/new`} data-testid="new-idea">
                {t('ideas.browser.newIdea')}
              </NewButton>
            )
          }
        />
      )}

      {nested !== null ? null : <IdeasTabs basePath={basePath} current={current} />}
    </>
  )
}
