import { useId, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink } from 'react-router-dom'
import { ContainerName } from './ContainerName'
import { ManuscriptEditor } from './ManuscriptEditor'
import type { Chronology } from '../chronology/types'
import { UNCHAPTERED } from '../stories/format'
import { beatsByScene, readingOrder, scenesIn } from '../stories/structure'
import type { Chapter, PlotArc, Scene, StoryDetail } from '../stories/types'
import { EmptyState } from './EmptyState'

interface ManuscriptPanelProps {
  universeId: string
  /** The story being written. Its chapters and scenes are the outline; none of them carries prose. */
  story: StoryDetail
  /** The story's plot, already read by the story page, for the beats that point at the open scene. */
  arcs: PlotArc[]
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

/** Where a scene is told: its chapter or Unchaptered - none in a story without chapters - and "Scene 1 of 3" inside it. */
function whereOf(chapters: Chapter[], scenes: Scene[], scene: Scene) {
  const container = scenesIn(scenes, scene.chapterId)
  const index = chapters.findIndex((chapter) => chapter.id === scene.chapterId)
  return {
    container:
      chapters.length > 0 ? (
        <ContainerName chapter={index < 0 ? null : { index, title: chapters[index].title }} />
      ) : null,
    position: `Scene ${container.findIndex((candidate) => candidate.id === scene.id) + 1} of ${container.length}`,
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
  arcs,
  chronology,
  sceneId,
  onEditScene,
  onSuggestScene,
  onSceneChanged,
  onSceneSaved,
  manuscriptPublication,
}: ManuscriptPanelProps) {
  const listId = useId()
  const toggle = useRef<HTMLButtonElement>(null)

  // Opened "at" a scene rather than simply open, like the workspace's section list: arriving at another scene closes
  // the list without an effect chasing the address.
  const [openAt, setOpenAt] = useState<string | null>(null)

  const { chapters } = story
  const scenes = readingOrder(chapters, story.scenes)
  const storyPath = `/app/universes/${universeId}/stories/${story.id}`
  const hasChapters = chapters.length > 0

  if (scenes.length === 0) {
    return (
      <EmptyState
        testId="manuscript-empty"
        title="No scenes yet."
        hint={
          <>
            A manuscript is written scene by scene.{' '}
            <Link to={storyPath} data-testid="manuscript-empty-scenes">
              Add a scene on the Scenes view
            </Link>{' '}
            to start writing.
          </>
        }
      />
    )
  }

  if (!sceneId) {
    return <Navigate to={`${storyPath}/manuscript/${scenes[0].id}`} replace />
  }

  const selected = scenes.find((scene) => scene.id === sceneId) ?? null
  const isOpen = openAt === sceneId
  const unchaptered = scenesIn(scenes, null)

  const groups = hasChapters
    ? [
        ...(unchaptered.length > 0
          ? [{ key: 'unchaptered', label: UNCHAPTERED, scenes: unchaptered }]
          : []),
        ...chapters.map((chapter, index) => ({
          key: chapter.id,
          label: <ContainerName chapter={{ index, title: chapter.title }} />,
          scenes: scenesIn(scenes, chapter.id),
        })),
      ]
    : [{ key: 'story', label: null, scenes }]

  /**
   * On a narrow screen the list folds away once a scene is chosen, taking the link that held the focus with it, so the
   * focus goes to the toggle - which now names the chosen scene - rather than to nowhere. On a wide screen the toggle is
   * not shown and the focus stays on the link.
   */
  function chose() {
    setOpenAt(null)
    const button = toggle.current
    if (button && button.offsetParent !== null) button.focus()
  }

  return (
    <section className="manuscript" aria-labelledby="manuscript-heading" data-testid="manuscript">
      <h2 className="visually-hidden" id="manuscript-heading">
        Manuscript
      </h2>

      <div className="manuscript__layout">
        <nav className="msoutline" aria-label="Scenes to write" data-testid="manuscript-outline">
          <button
            ref={toggle}
            className="msoutline__toggle"
            type="button"
            aria-expanded={isOpen}
            aria-controls={listId}
            onClick={() => setOpenAt(isOpen ? null : sceneId)}
            data-testid="manuscript-outline-toggle"
          >
            <span className="msoutline__togglelabel">{isOpen ? 'Close scenes' : 'Scenes'}</span>
            {/* Its own direction, not a <bdi>: the title is cut with an ellipsis, and the clipping
                element's direction is what puts the cut at the end of a right-to-left title. */}
            <span className="msoutline__current" dir="auto">
              {selected?.title ?? 'Choose a scene'}
            </span>
          </button>

          <div
            className="msoutline__body"
            id={listId}
            data-open={isOpen ? 'true' : 'false'}
            data-testid="manuscript-outline-list"
          >
            {groups.map((group) => {
              const headingId = `${listId}-${group.key}`
              return (
                <div
                  className="msoutline__group"
                  key={group.key}
                  data-testid="manuscript-outline-group"
                >
                  {group.label ? (
                    <p
                      className="msoutline__heading"
                      id={headingId}
                      data-testid="manuscript-outline-heading"
                    >
                      {group.label}
                    </p>
                  ) : null}
                  {group.scenes.length === 0 ? (
                    <p className="msoutline__none">No scenes yet.</p>
                  ) : (
                    <ol
                      className="msoutline__scenes"
                      aria-labelledby={group.label ? headingId : undefined}
                    >
                      {group.scenes.map((scene) => (
                        <li key={scene.id}>
                          <NavLink
                            to={`${storyPath}/manuscript/${scene.id}`}
                            className="msoutline__link"
                            onClick={chose}
                            data-testid="manuscript-outline-scene"
                            data-title={scene.title}
                          >
                            <bdi>{scene.title}</bdi>
                          </NavLink>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        <div className="manuscript__main">
          {selected ? (
            <ManuscriptEditor
              key={selected.id}
              universeId={universeId}
              storyId={story.id}
              scene={selected}
              chronology={chronology}
              where={whereOf(chapters, scenes, selected)}
              beats={beatsByScene(arcs).get(selected.id) ?? []}
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
              title="That scene is not in this story."
              hint="It may have been deleted. Choose a scene from the list."
            />
          )}
        </div>
      </div>
    </section>
  )
}
