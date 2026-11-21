import { useOutletContext, useParams } from 'react-router-dom'
import { ProjectEntityDetailView } from '../components/ProjectEntityDetailView'
import { GameGate } from '../projects/gameGate'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * One entry of a game, on its own screen (#286). The game is checked first, exactly as the game's directory checks it
 * (#284): nothing of a foreign project, or of an entry read through it, is drawn or put in the tab title until it passes.
 */
export default function GameEntityPage() {
  useI18n()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()

  return (
    <GameGate projectId={projectId} universeId={workspace?.universe.id} notFound={!entityId}>
      {(game, universeId) => (
        <ProjectEntityDetailView
          key={entityId}
          projectId={game.id}
          universeId={universeId}
          entityId={entityId!}
          gameName={game.name}
          gameHref={`/app/universes/${universeId}/game-entities/${game.id}`}
        />
      )}
    </GameGate>
  )
}
