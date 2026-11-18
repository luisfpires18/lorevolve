import { Link } from 'react-router-dom'
import { storyPath, type PublicStory } from '../../portal/api'
import { useI18n } from '../../i18n'

export function StoryCard({ world, story }: { world: string; story: PublicStory }) {
  const { t } = useI18n()
  return (
    <li className="pstorycard">
      <Link className="pstorycard__link" to={storyPath(world, story.slug)}>
        <span className="pstorycard__title" dir="auto">
          <bdi>{story.title}</bdi>
        </span>
        <span className="pstorycard__summary" dir="auto">
          {story.publicSummary}
        </span>
        <span className="pstorycard__cta" aria-hidden="true">
          {t('portal.world.storyCta')}
        </span>
      </Link>
    </li>
  )
}
