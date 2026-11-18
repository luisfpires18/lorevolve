import { useUniverseAccess } from '../../universes/access'
import { ArrowDown, ArrowUp, Image as ImageIcon } from 'lucide-react'
import { useI18n } from '../../i18n'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { ShelfCard } from '../ShelfCard'
import { pictureUrl, storyCoverStore } from '../../covers/api'
import { storyProjectPath } from '../../projects/sections'
import { sceneCountLabel } from '../../stories/format'
import { STORY_STATUS_LABELS, type StorySummary } from '../../stories/types'
import type { Dispatch, SetStateAction } from 'react'

/** The stories as books on a shelf, each with its menu to move it, change its cover or open it. */
export function StoryShelf({
  stories,
  access,
  universe,
  move,
  setCovering,
}: {
  stories: StorySummary[]
  access: ReturnType<typeof useUniverseAccess>
  universe: { id: string }
  move: (story: StorySummary, by: -1 | 1) => Promise<void>
  setCovering: Dispatch<SetStateAction<StorySummary | null>>
}) {
  const { t } = useI18n()

  return (
    // Each story as a book on its shelf (owner, 2026-11-17); the Gaming page draws its games the same way.
    <ul className="shelf" data-testid="story-list">
      {stories.map((story, index) => (
        <ShelfCard
          key={story.id}
          frame="book"
          href={storyProjectPath(universe.id, story.id)}
          title={story.title}
          description={story.premise}
          step={story.status}
          statusLabel={STORY_STATUS_LABELS[story.status]}
          meta={<span data-testid="story-scene-count">{sceneCountLabel(story.sceneCount)}</span>}
          cover={
            story.cover
              ? pictureUrl(storyCoverStore(universe.id, story.id), story.cover, 'card')
              : null
          }
          onAddPicture={access.editContent ? () => setCovering(story) : undefined}
          attrs={{
            'data-testid': 'story-row',
            'data-title': story.title,
            'data-story-id': story.id,
          }}
          menu={
            access.editContent ? (
              <ActionMenu
                label={t('stories.browse.moreActions', { title: story.title })}
                triggerTestId="story-actions"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => setCovering(story)}
                  data-testid="story-cover"
                >
                  <ActionIcon icon={ImageIcon} />
                  {t(story.cover ? 'projects.common.changePicture' : 'projects.common.addPicture')}
                </button>
                {index > 0 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => void move(story, -1)}
                    data-testid="story-move-up"
                  >
                    <ActionIcon icon={ArrowUp} />
                    {t('stories.browse.moveUp')}
                  </button>
                ) : null}
                {index < stories.length - 1 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => void move(story, 1)}
                    data-testid="story-move-down"
                  >
                    <ActionIcon icon={ArrowDown} />
                    {t('stories.browse.moveDown')}
                  </button>
                ) : null}
              </ActionMenu>
            ) : null
          }
        />
      ))}
    </ul>
  )
}
