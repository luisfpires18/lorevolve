import { useUniverseAccess } from '../../universes/access'
import { FilePenLine, Hourglass, Pencil, Trash } from 'lucide-react'
import { useI18n } from '../../i18n'
import { ViewChips } from '../ViewChips'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { projectSections } from '../../projects/sections'
import { ProjectKind } from '../../projects/types'
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
        items={projectSections(ProjectKind.Writing, story.id).map((section, index) => ({
          to: `${storyPath}/${section.segment}`,
          end: index === 0,
          // A story's views keep the story's own words (`stories.page.view*`).
          label: t(
            section.segment === 'structure'
              ? 'stories.page.viewStructure'
              : 'stories.page.viewManuscript',
          ),
          icon: section.icon,
          // The story's own ids (G26): the structure view is "scenes".
          testId: `story-view-${section.segment === 'structure' ? 'scenes' : section.segment}`,
        }))}
      />

      {/* Every view keeps a way to the story's world chronology here, the Manuscript view included, whose header has
              no line of facts to hold it. */}
      <ActionMenu
        className="story__menu"
        label={t('stories.page.storyActions', { title: story.title })}
        triggerTestId="story-actions"
      >
        <ActionMenuItem icon={Hourglass} to={timelinePath} testId="menu-story-timeline">
          {t('stories.page.menuTimeline')}
        </ActionMenuItem>
        {access.suggestChanges && !access.editContent ? (
          <ActionMenuItem
            icon={FilePenLine}
            onClick={() => setStoryForm('suggest')}
            testId="suggest-story"
          >
            {t('stories.page.suggest')}
          </ActionMenuItem>
        ) : null}
        {access.editContent ? (
          <>
            <ActionMenuItem icon={Pencil} onClick={() => setStoryForm('edit')} testId="edit-story">
              {t('stories.page.editStory')}
            </ActionMenuItem>
            <hr className="actionmenu__divider" />
            <ActionMenuItem
              icon={Trash}
              tone="danger"
              onClick={() => void removeStory()}
              testId="delete-story"
            >
              {t('stories.page.deleteStory')}
            </ActionMenuItem>
          </>
        ) : null}
      </ActionMenu>
    </div>
  )
}
