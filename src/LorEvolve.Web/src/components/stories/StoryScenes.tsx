import { BookPlus, Layers } from 'lucide-react'
import { useI18n } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { StoryPartPublication } from '../StoryPartPublication'
import {
  arcLabel,
  arcNumber,
  chapterCountLabel,
  sceneCountLabel,
  unchaptered as unchapteredLabel,
} from '../../stories/format'
import type { Scene } from '../../stories/types'
import type { storyPatches } from '../../stories/storyPatches'
import type { storyChapterMoves } from '../../stories/storyChapterMoves'
import type { storyRemovals } from '../../stories/storyRemovals'
import type { useStoryState } from '../../stories/useStoryState'
import { StorySceneCards } from './StorySceneCards'
import {
  StoryChapterSections,
  StoryGroupRow,
  type StoryChapterSectionsProps,
} from './StoryChapterSections'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { SectionTitle } from '../Section'
import { FormMessage } from '../FormMessage'

/** The Scenes view: the toolbar, the story's scenes or chapters, and each arc with its chapters. */
export function StoryScenes(
  props: Omit<StoryChapterSectionsProps, 'group' | 'titleLevel'> &
    Pick<ReturnType<typeof useStoryState>, 'setArcForm'> &
    Pick<ReturnType<typeof storyPatches>, 'patchArc'> &
    Pick<ReturnType<typeof storyChapterMoves>, 'moveArc'> &
    Pick<ReturnType<typeof storyRemovals>, 'removeArc'> & {
      hasStructure: boolean
      isEmpty: boolean
      unchaptered: Scene[]
      message: string | null
    },
) {
  const {
    access,
    universe,
    story,
    scenes,
    hasStructure,
    isEmpty,
    unchaptered,
    groups,
    message,
    storyIsPublic,
    setChapterForm,
    setArcForm,
    setSceneForm,
    patchArc,
    moveArc,
    removeArc,
  } = props
  const { t } = useI18n()

  const newScene = (
    <NewButton
      onClick={() => setSceneForm({ mode: 'new', chapterId: null })}
      data-testid="new-scene"
    >
      {t('stories.page.newScene')}
    </NewButton>
  )

  const newChapter = (
    <NewButton
      tone="secondary"
      icon={BookPlus}
      onClick={() => setChapterForm({ mode: 'new', arcId: null })}
      data-testid="new-chapter"
    >
      {t('stories.page.newChapter')}
    </NewButton>
  )

  const newArc = (
    <NewButton
      tone="secondary"
      icon={Layers}
      onClick={() => setArcForm({ mode: 'new' })}
      data-testid="new-arc"
    >
      {t('stories.page.newArc')}
    </NewButton>
  )

  return (
    <section className="story__scenes" aria-labelledby="story-scenes-heading">
      <h2 className="visually-hidden" id="story-scenes-heading">
        {t('stories.page.structureHeading')}
      </h2>

      {story.premise ? (
        <p className="story__premise prose" data-testid="story-premise">
          {story.premise}
        </p>
      ) : null}

      {isEmpty ? null : (
        <div className="story__toolbar">
          <QuietNote className="chron__aside story__aside">
            {hasStructure ? t('stories.page.asideStructured') : t('stories.page.aside')}
          </QuietNote>
          {access.editContent ? (
            <div className="actions">
              {newArc}
              {newChapter}
              <span className="story__create">{newScene}</span>
            </div>
          ) : null}
        </div>
      )}

      {message ? <FormMessage testId="story-error">{message}</FormMessage> : null}

      {isEmpty ? (
        <EmptyState
          testId="scenes-empty"
          title={t('stories.page.empty.title')}
          hint={t('stories.page.empty.hint')}
          action={
            access.editContent ? (
              <>
                {newScene}
                {newChapter}
                {newArc}
              </>
            ) : undefined
          }
        />
      ) : null}

      {!hasStructure && scenes.length > 0 ? (
        <ul className="types__list" data-testid="scene-list">
          <StorySceneCards {...props} container={scenes} titleLevel={3} />
        </ul>
      ) : null}

      {hasStructure && unchaptered.length > 0 ? (
        <section
          className="storygroup"
          aria-labelledby="unchaptered-heading"
          data-testid="unchaptered"
        >
          <header className="storygroup__head">
            <SectionTitle level={3} tone="label" size="xs" id="unchaptered-heading">
              {unchapteredLabel()}
            </SectionTitle>
            <QuietNote className="storygroup__hint">
              {t('stories.page.unchapteredHint', {
                scenes: sceneCountLabel(unchaptered.length),
              })}
            </QuietNote>
          </header>
          <ul className="types__list" data-testid="unchaptered-scenes">
            <StorySceneCards {...props} container={unchaptered} titleLevel={4} />
          </ul>
        </section>
      ) : null}

      {groups.unarced.length > 0 || groups.arcs.length > 0 ? (
        <ul className="types__list">
          <StoryChapterSections {...props} group={groups.unarced} titleLevel={3} />
          {groups.arcs.map(({ arc, chapters: inArc }, index) => (
            <StoryGroupRow
              key={arc.id}
              noun="arc"
              id={arc.id}
              title={arc.title}
              index={index}
              count={groups.arcs.length}
              titleLevel={3}
              number={arcNumber(index)}
              label={arcLabel(index, arc.title)}
              countLabel={inArc.length > 0 ? chapterCountLabel(inArc.length) : undefined}
              summary={arc.description}
              empty={inArc.length > 0 ? undefined : t('stories.arc.empty')}
              words={{
                add: t('stories.arc.addChapter'),
                edit: t('stories.arc.edit'),
                editLabel: t('stories.arc.editLabel', { label: arcLabel(index, arc.title) }),
                more: t('stories.arc.moreActions', { label: arcLabel(index, arc.title) }),
                delete: t('stories.arc.delete'),
              }}
              onMove={(by) => void moveArc(arc, by)}
              onAdd={() => setChapterForm({ mode: 'new', arcId: arc.id })}
              onEdit={() => setArcForm({ mode: 'edit', arc, index })}
              onDelete={() => void removeArc(arc, index)}
              startsOpen={index === 0}
              publication={
                access.publish ? (
                  <StoryPartPublication
                    universeId={universe.id}
                    storyId={story.id}
                    kind="arc"
                    id={arc.id}
                    name={arc.title}
                    visibility={arc.visibility}
                    storyIsPublic={storyIsPublic}
                    onChange={(visibility) => patchArc(arc.id, visibility)}
                  />
                ) : null
              }
            >
              <ul className="types__list">
                <StoryChapterSections {...props} group={inArc} titleLevel={4} />
              </ul>
            </StoryGroupRow>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
