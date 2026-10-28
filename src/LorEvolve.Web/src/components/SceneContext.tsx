import { useId } from 'react'
import { Link } from 'react-router-dom'
import { LoreReference } from './LoreReference'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { SceneBeatReference } from '../stories/structure'
import type { Scene } from '../stories/types'

/*
 * What a scene refers to, drawn the same way wherever a scene is shown - its card on the Scenes view and its page on the
 * Manuscript view - so the two cannot drift apart. All of it is read-only here: the scene form edits the date, the point
 * of view and the lore, and the beats own their links to the scene. `testId` names the surface, so each keeps its own
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

/** The plot beats that point at the scene, arc by arc, each a way to that beat on the story's Plot view. */
export function SceneBeats({
  universeId,
  storyId,
  beats,
  storyHasBeats = false,
  testId,
}: {
  universeId: string
  storyId: string
  beats: SceneBeatReference[]
  /**
   * The story plans beats, none of them this scene's: say so, and where they are linked, rather than show nothing. Only
   * where one scene is shown at a time (the manuscript), and never a demand - a scene needs no beat.
   */
  storyHasBeats?: boolean
  testId: Surface
}) {
  const labelId = useId()
  const plotPath = `/app/universes/${universeId}/stories/${storyId}/plot`

  if (beats.length === 0) {
    return storyHasBeats ? (
      <p className="scene__refs scene__noplot" data-testid={`${testId}-plot-none`}>
        <span className="scene__label">Plot</span>
        <span>
          No beat links this scene. <Link to={plotPath}>Open Plot</Link>
        </span>
      </p>
    ) : null
  }

  return (
    <div className="scene__refs">
      <span className="scene__label" id={labelId}>
        Plot
      </span>
      <ul className="scene__lore" aria-labelledby={labelId} data-testid={`${testId}-plot`}>
        {beats.map((beat) => (
          <li key={beat.beatId}>
            <Link
              className="lorechip plotchip"
              to={`${plotPath}#beat-${beat.beatId}`}
              aria-label={`${beat.arcTitle}: ${beat.beatTitle}`}
              data-testid={`${testId}-plot-beat`}
            >
              <span className="lorechip__name">
                <bdi>{beat.arcTitle}</bdi>
                <span className="plotchip__arrow"> → </span>
                <bdi>{beat.beatTitle}</bdi>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
