import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ManuscriptEditor } from './ManuscriptEditor'
import { ManuscriptParts } from './ManuscriptParts'
import type { Chronology } from '../chronology/types'
import { t, useI18n } from '../i18n'
import { unchaptered as unchapteredLabel } from '../stories/format'
import { chapterChoices, readingOrder, scenesIn } from '../stories/structure'
import type { Scene, StoryDetail } from '../stories/types'
import { EmptyState } from './EmptyState'
import { projectPath } from '../projects/sections'

interface ManuscriptPanelProps {
  universeId: string
  /** The story being written. Its chapters and scenes are the outline; none of them carries prose. */
  story: StoryDetail
  chronology: Chronology
  /** The scene the address names, if it names one. */
  sceneId: string | undefined
  /** Opens a scene's own form, the same drawer the Scenes view uses. */
  onEditScene: (scene: Scene) => void
  /** Opens a scene's form to send a suggestion instead (task 045). */
  onSuggestScene: (scene: Scene) => void
  /** An accepted suggestion changed a scene: the story is read again. */
  onSceneChanged: () => void
  /** Lore Context saved the open scene's links: the story shows the scene the API answered with. */
  onSceneSaved: (scene: Scene) => void
  /** The open scene's prose publication control (ADR 0039), built by the story page. */
  manuscriptPublication?: (scene: Scene) => ReactNode
}

/**
 * Where a scene is told: its chapter as the Scenes view names it ("Arc 1, Chapter 2: Ashes" inside an arc) or Unchaptered -
 * none in a story without chapters - and "Scene 1 of 3" inside it.
 */
function whereOf(
  labels: Map<string, { prefix: string; title: string }>,
  scenes: Scene[],
  scene: Scene,
) {
  const container = scenesIn(scenes, scene.chapterId)
  const chapter = scene.chapterId === null ? undefined : labels.get(scene.chapterId)
  return {
    container:
      labels.size > 0 ? (
        chapter ? (
          <>
            {chapter.prefix}: <bdi>{chapter.title}</bdi>
          </>
        ) : (
          unchapteredLabel()
        )
      ) : null,
    position: t('manuscript.panel.position', {
      number: container.findIndex((candidate) => candidate.id === scene.id) + 1,
      total: container.length,
    }),
  }
}

/**
 * A story's Manuscript view: its scenes as an outline, and the open scene's prose beside it.
 *
 * The outline is the story as it is structured now - Unchaptered first while it holds a scene, then each chapter in
 * order with its scenes in order - drawn from the story read, which carries no prose. It is for finding a scene, not
 * for arranging one: nothing here reorders or moves anything. Choosing a scene changes the address, so a reload, a
 * bookmark or a scene moved to another chapter all keep the same scene open, and only that one scene's manuscript is
 * read.
 *
 * With no scene in the address, the first scene the story is read in opens. On a narrow screen the outline folds into
 * a disclosure that names the open scene, so the writing gets the width.
 */
export function ManuscriptPanel({
  universeId,
  story,
  chronology,
  sceneId,
  onEditScene,
  onSuggestScene,
  onSceneChanged,
  onSceneSaved,
  manuscriptPublication,
}: ManuscriptPanelProps) {
  const { t, tx } = useI18n()
  const { arcs, chapters } = story
  const scenes = readingOrder(arcs, chapters, story.scenes)
  const choices = chapterChoices(arcs, chapters)
  const labels = new Map(choices.map((choice) => [choice.id, choice]))
  // The story's project views since #194; the old story address redirects there.
  const storyPath = projectPath(story.id, '', universeId)
  const hasChapters = chapters.length > 0

  if (scenes.length === 0) {
    return (
      <EmptyState
        testId="manuscript-empty"
        title={t('manuscript.panel.empty.title')}
        hint={tx('manuscript.panel.empty.hint', {
          link: (
            <Link to={`${storyPath}/structure`} data-testid="manuscript-empty-scenes">
              {t('manuscript.panel.empty.link')}
            </Link>
          ),
        })}
      />
    )
  }

  if (!sceneId) {
    return <Navigate to={`${storyPath}/manuscript/${scenes[0].id}`} replace />
  }

  const selected = scenes.find((scene) => scene.id === sceneId) ?? null
  const unchaptered = scenesIn(scenes, null)

  const groups = hasChapters
    ? [
        ...(unchaptered.length > 0
          ? [{ key: 'unchaptered', label: unchapteredLabel(), scenes: unchaptered }]
          : []),
        ...choices.map((choice) => ({
          key: choice.id,
          label: (
            <>
              {choice.prefix}: <bdi>{choice.title}</bdi>
            </>
          ),
          scenes: scenesIn(scenes, choice.id),
        })),
      ]
    : [{ key: 'story', label: null, scenes }]
  const parts = groups.map((group) => ({
    key: group.key,
    label: group.label,
    parts: group.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      to: `${storyPath}/manuscript/${scene.id}`,
    })),
  }))

  return (
    <ManuscriptParts
      groups={parts}
      currentId={sceneId}
      heading={t('manuscript.panel.heading')}
      outlineLabel={t('manuscript.panel.outline')}
      toggleLabel={t('manuscript.panel.scenes')}
      closeLabel={t('manuscript.panel.closeScenes')}
      chooseLabel={t('manuscript.panel.chooseScene')}
      noneLabel={t('manuscript.panel.noScenes')}
    >
      {selected ? (
        <ManuscriptEditor
          key={selected.id}
          universeId={universeId}
          storyId={story.id}
          scene={selected}
          chronology={chronology}
          where={whereOf(labels, scenes, selected)}
          onEditScene={onEditScene}
          onSuggestScene={onSuggestScene}
          chapters={chapters}
          onSceneChanged={onSceneChanged}
          onSceneSaved={onSceneSaved}
          publication={manuscriptPublication?.(selected)}
        />
      ) : (
        <EmptyState
          testId="manuscript-scene-missing"
          title={t('manuscript.panel.missing.title')}
          hint={t('manuscript.panel.missing.hint')}
        />
      )}
    </ManuscriptParts>
  )
}
