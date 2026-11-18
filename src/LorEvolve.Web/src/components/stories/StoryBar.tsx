import { useUniverseAccess } from '../../universes/access'
import { FilePenLine, FileText, Hourglass, ListTree, Pencil, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { ViewChips } from '../ViewChips'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import type { StoryDetail } from '../../stories/types'
import type { useStoryState } from '../../stories/useStoryState'
import type { storyRemovals } from '../../stories/storyRemovals'

/** The views, and the story's own menu: its timeline, suggest, edit and delete. */
export function StoryBar({
  access,
  story,
  storyPath,
  timelinePath,
  setStoryForm,
  removeStory,
}: Pick<ReturnType<typeof useStoryState>, 'setStoryForm'> &
  Pick<ReturnType<typeof storyRemovals>, 'removeStory'> & {
    access: ReturnType<typeof useUniverseAccess>
    story: StoryDetail
    storyPath: string
    timelinePath: string
  }) {
  const { t } = useI18n()

  return (
    <div className="story__bar">
      <ViewChips
        label={t('stories.page.views')}
        testId="story-views"
        items={[
          {
            to: `${storyPath}/structure`,
            end: true,
            label: t('stories.page.viewStructure'),
            icon: ListTree,
            testId: 'story-view-scenes',
          },
          {
            to: `${storyPath}/manuscript`,
            label: t('stories.page.viewManuscript'),
            icon: FileText,
            testId: 'story-view-manuscript',
          },
        ]}
      />

      {/* Every view keeps a way to the story's world chronology here, the Manuscript view included, whose header has
              no line of facts to hold it. */}
      <ActionMenu
        className="story__menu"
        label={t('stories.page.storyActions', { title: story.title })}
        triggerTestId="story-actions"
      >
        <Link className="actionmenu__item" to={timelinePath} data-testid="menu-story-timeline">
          <ActionIcon icon={Hourglass} />
          {t('stories.page.menuTimeline')}
        </Link>
        {access.suggestChanges && !access.editContent ? (
          <button
            className="actionmenu__item"
            type="button"
            onClick={() => setStoryForm('suggest')}
            data-testid="suggest-story"
          >
            <ActionIcon icon={FilePenLine} />
            {t('stories.page.suggest')}
          </button>
        ) : null}
        {access.editContent ? (
          <>
            <button
              className="actionmenu__item"
              type="button"
              onClick={() => setStoryForm('edit')}
              data-testid="edit-story"
            >
              <ActionIcon icon={Pencil} />
              {t('stories.page.editStory')}
            </button>
            <hr className="actionmenu__divider" />
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              onClick={() => void removeStory()}
              data-testid="delete-story"
            >
              <ActionIcon icon={Trash} />
              {t('stories.page.deleteStory')}
            </button>
          </>
        ) : null}
      </ActionMenu>
    </div>
  )
}
