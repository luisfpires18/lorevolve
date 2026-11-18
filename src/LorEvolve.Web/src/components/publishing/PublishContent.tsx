import { Link } from 'react-router-dom'
import { Feather, Library } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import type { Published, usePublishState } from '../../publishing/usePublishState'
import { PublishEverything } from './PublishEverything'

/** What readers can see inside the universe, with links to its lore and stories, and Publish everything while public. */
export function PublishContent({
  universeId,
  base,
  isPublic,
  published,
  setCountRound,
}: Pick<ReturnType<typeof usePublishState>, 'setCountRound'> & {
  universeId: string
  base: string
  isPublic: boolean
  published: Published
}) {
  const { t } = useI18n()

  return (
    <>
      <p className="settings__note">{t('universe.publish.contentNote')}</p>
      <ul className="publish__content" data-testid="published-content">
        <li>
          <ActionIcon icon={Library} />
          <span className="publish__contentname">{t('universe.publish.lore')}</span>
          <span className="publish__contentcount" data-testid="published-lore">
            {published ? t('universe.publish.loreCount', { n: published.lore }) : null}
          </span>
          <Link className="button button--secondary button--sm" to={`${base}/lore`}>
            {t('universe.publish.viewLore')}
          </Link>
        </li>
        <li>
          <ActionIcon icon={Feather} />
          <span className="publish__contentname">{t('universe.publish.stories')}</span>
          <span className="publish__contentcount" data-testid="published-stories">
            {published ? t('universe.publish.storiesCount', { n: published.stories }) : null}
          </span>
          <Link className="button button--secondary button--sm" to={`${base}/writing`}>
            {t('universe.publish.viewStories')}
          </Link>
        </li>
      </ul>
      {isPublic ? (
        <PublishEverything
          universeId={universeId}
          onPublished={() => setCountRound((round) => round + 1)}
        />
      ) : null}
    </>
  )
}
