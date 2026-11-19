import { Link } from 'react-router-dom'
import { Crumb } from '../Crumb'
import { useI18n } from '../../i18n'
import { ContentPublication } from '../ContentPublication'
import { PageHeader } from '../PageHeader'
import { ReviewComments } from '../ReviewComments'
import { chapterCountLabel, sceneCountLabel } from '../../stories/format'
import { storyChanges } from '../../stories/changes'
import {
  STORY_STATUS_LABELS,
  type Chapter,
  type Scene,
  type StoryDetail,
} from '../../stories/types'
import { StatusBadge } from '../StatusBadge'
import type { ReactNode } from 'react'
import type { StoryViewName, useStoryState } from '../../stories/useStoryState'

/** The story's title, its facts, its publication and comments; `children` is the bar under them. */
export function StoryHeader({
  view,
  universe,
  story,
  chapters,
  scenes,
  hasChapters,
  timelinePath,
  storyPublication,
  setStoryForm,
  setPublication,
  reload,
  children,
}: Pick<ReturnType<typeof useStoryState>, 'setStoryForm' | 'setPublication'> & {
  view: StoryViewName
  universe: { id: string }
  story: StoryDetail
  chapters: Chapter[]
  scenes: Scene[]
  hasChapters: boolean
  timelinePath: string
  storyPublication: ReturnType<typeof useStoryState>['publication']
  reload: () => void
  children: ReactNode
}) {
  const { t } = useI18n()

  return (
    <PageHeader
      crumb={
        <Crumb
          items={[{ to: `/app/universes/${universe.id}/writing`, label: t('stories.page.crumb') }]}
        />
      }
      title={<bdi>{story.title}</bdi>}
      titleTestId="story-title"
      lede={
        // Writing needs the height more than the facts: the Manuscript view keeps the title and the views only.
        view === 'manuscript' ? null : (
          // A div, because the publication control's panel is not phrasing content. The story's publication sits
          // with its other facts: the bar under the title is full at 360px, and this line has room.
          <div className="story__meta">
            <StatusBadge
              step={story.status}
              label={STORY_STATUS_LABELS[story.status]}
              testId="story-status"
            />
            {hasChapters ? (
              <span data-testid="story-chapter-count">{chapterCountLabel(chapters.length)}</span>
            ) : null}
            <span>{sceneCountLabel(scenes.length)}</span>
            {storyPublication ? (
              <ContentPublication
                key={story.id}
                universeId={universe.id}
                kind="story"
                id={story.id}
                name={story.title}
                placement="line"
                initialState={storyPublication.state ?? undefined}
                onChange={(state) => setPublication({ storyId: story.id, state })}
              />
            ) : null}
            <Link className="story__timeline" to={timelinePath} data-testid="story-timeline">
              {t('stories.page.timeline')}
            </Link>
            {/* Comments on the story as a whole. Not on the Manuscript view, where each scene has its own. */}
            <ReviewComments
              universeId={universe.id}
              subject={{ kind: 'story', storyId: story.id }}
              subjectName={story.title}
              describeSuggestion={storyChanges}
              onSuggestionAccepted={reload}
              onSuggest={() => setStoryForm('suggest')}
            />
          </div>
        )
      }
    >
      {children}
    </PageHeader>
  )
}
