import { useId } from 'react'
import { Link } from 'react-router-dom'
import { LoreReference } from './LoreReference'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { Scene, SceneBeat } from '../stories/types'

/*
 * What a scene refers to, drawn the same way wherever a scene is shown - its card on the Scenes view and its page on the
 * Manuscript view - so the two cannot drift apart. All of it is read-only here: the scene form edits the date, the point
 * of view, the lore and the beats. `testId` names the surface, so each keeps its own
 * test ids.
 */

type Surface = 'scene' | 'manuscript'

/**
 * Where the scene happens in the world and whose eyes it is seen through, or nothing when it has neither. The date opens
 * the story's timeline, where the scene sits in world order (Issue #48).
 */
export function SceneStamp({
  universeId,
  chronology,
  scene,
  testId,
}: {
  universeId: string
  chronology: Chronology
  scene: Scene
  testId: Surface
}) {
  const when = sceneWhen(chronology, scene.chronology)
  if (!when && !scene.pov) return null

  return (
    <div className="scene__stamp">
      {when ? (
        <span className="scene__when" data-testid={`${testId}-when`}>
          {/* The story's timeline: this scene among its other dated scenes and the moments linked to the story. */}
          <Link
            className="scene__whenlink"
            to={`/app/universes/${universeId}/timeline?story=${scene.storyId}`}
            aria-label={`${when.text}, on the story's timeline`}
            data-testid={`${testId}-timeline`}
          >
            {when.text}
          </Link>
          {when.placed ? null : <span className="scene__unplaced"> · no date period yet</span>}
        </span>
      ) : null}
      {scene.pov ? (
        <span className="scene__pov" data-testid={`${testId}-pov`}>
          <span className="scene__label">Point of view</span>
          <LoreReference universeId={universeId} reference={scene.pov} portrait />
        </span>
      ) : null}
    </div>
  )
}

/** The lore the scene links, each a way to the entry's own page - or named and unlinked while it is in the Trash. */
export function SceneLore({
  universeId,
  scene,
  testId,
}: {
  universeId: string
  scene: Scene
  testId: Surface
}) {
  const labelId = useId()
  if (scene.entities.length === 0) return null

  return (
    <div className="scene__refs">
      <span className="scene__label" id={labelId}>
        Lore
      </span>
      <ul className="scene__lore" aria-labelledby={labelId} data-testid={`${testId}-lore`}>
        {scene.entities.map((reference) => (
          <li key={reference.entityId}>
            <LoreReference universeId={universeId} reference={reference} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The scene's beats, in order (ADR 0070): each step a line, its note under it. Nothing when it has none - a scene needs no
 * beat. Edited in the scene's own drawer.
 */
export function SceneBeatList({ beats, testId }: { beats: SceneBeat[]; testId: Surface }) {
  const labelId = useId()
  if (beats.length === 0) return null

  return (
    <div className="scene__refs scene__refs--beats">
      <span className="scene__label" id={labelId}>
        Beats
      </span>
      <ol className="scene__beats" aria-labelledby={labelId} data-testid={`${testId}-beats`}>
        {beats.map((beat) => (
          <li key={beat.id} className="scene__beat" data-testid={`${testId}-beat`}>
            <bdi className="scene__beattitle">{beat.title}</bdi>
            {beat.note ? <span className="scene__beatnote">{beat.note}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
