import { useId } from 'react'
import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import { useUniverseStories } from '../../stories/useUniverseStories'
import type { TimelineStoryLink } from '../../timeline/types'
import { Token, TokenList } from '../Token'

/**
 * The stories a moment matters to: each linked one as a token with Remove, and a choice of the universe's other live stories to
 * add. The story list is read once, when the drawer opens - a universe holds a handful of stories and the list is unpaged for
 * that reason - and the linked ones are named from the moment itself, so showing them never waits on it. A story in the Trash
 * stays linked and says so; it is never offered.
 */
export function StoryLinks({
  universeId,
  value,
  onChange,
  error,
}: {
  universeId: string
  value: TimelineStoryLink[]
  onChange: (stories: TimelineStoryLink[]) => void
  error?: string
}) {
  useI18n()
  const selectId = useId()
  const load = useUniverseStories(universeId)
  const stories = load.kind === 'ready' ? load.value : null
  const failed = load.kind === 'error'

  const linked = new Set(value.map((story) => story.storyId))
  const offered = (stories ?? []).filter((story) => !linked.has(story.id))

  return (
    <Field
      id={selectId}
      className="storylinks"
      label={t('time.momentForm.stories')}
      hint={t('time.momentForm.storiesHint')}
      error={error}
      data-testid="moment-stories"
    >
      {(control) => (
        <>
          {value.length > 0 ? (
            <TokenList>
              {value.map((story) => (
                <Token
                  as="li"
                  key={story.storyId}
                  testId="moment-story"
                  note={story.isTrashed ? t('time.momentForm.storyInTrash') : undefined}
                  removeLabel={t('time.momentForm.unlink', { title: story.title })}
                  onRemove={() => onChange(value.filter((one) => one.storyId !== story.storyId))}
                  removeTestId={`moment-story-remove-${story.title}`}
                >
                  <bdi>{story.title}</bdi>
                </Token>
              ))}
            </TokenList>
          ) : null}
          <select
            {...control}
            className="field__input field__input--select"
            value=""
            disabled={stories === null || offered.length === 0}
            onChange={(event) => {
              const story = offered.find((one) => one.id === event.target.value)
              if (story)
                onChange([...value, { storyId: story.id, title: story.title, isTrashed: false }])
            }}
            data-testid="moment-story-add"
          >
            <option value="">
              {failed
                ? t('time.momentForm.storiesFailed')
                : stories === null
                  ? t('time.momentForm.readingStories')
                  : offered.length === 0
                    ? stories.length === 0
                      ? t('time.momentForm.noStories')
                      : t('time.momentForm.allLinked')
                    : t('time.momentForm.linkStory')}
            </option>
            {offered.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title}
              </option>
            ))}
          </select>
        </>
      )}
    </Field>
  )
}
