import type { ReactNode } from 'react'
import { SceneBeatList, SceneLore, SceneStamp } from '../SceneContext'
import { ManuscriptTools, type ManuscriptToolsProps } from './ManuscriptTools'

/** Where the scene is told, its title and its tools, and the scene's planning folded behind Details on a phone. */
export function ManuscriptHead(
  props: ManuscriptToolsProps & { where: { container: ReactNode; position: string } },
) {
  const { where, titleId, scene, hasContext, contextId, isContextOpen, universeId, chronology } =
    props

  return (
    <header className="manuscript__head">
      <p className="manuscript__where" data-testid="manuscript-where">
        {where.container ? <>{where.container} · </> : null}
        <span className="manuscript__position">{where.position}</span>
      </p>

      <div className="manuscript__titlerow">
        <h3 className="manuscript__title" id={titleId} data-testid="manuscript-scene-title">
          <bdi>{scene.title}</bdi>
        </h3>

        <ManuscriptTools {...props} />
      </div>

      {hasContext ? (
        <div
          className="manuscript__context"
          id={contextId}
          data-open={isContextOpen ? 'true' : 'false'}
        >
          <SceneStamp
            universeId={universeId}
            chronology={chronology}
            scene={scene}
            testId="manuscript"
          />
          <SceneLore universeId={universeId} scene={scene} testId="manuscript" />
          <SceneBeatList beats={scene.beats} testId="manuscript" />
        </div>
      ) : null}
    </header>
  )
}
