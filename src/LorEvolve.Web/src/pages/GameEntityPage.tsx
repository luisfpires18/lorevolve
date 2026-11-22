import { useOutletContext, useParams } from 'react-router-dom'
import { GameGate } from '../projects/gameGate'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { ProjectEntryPage } from './ProjectEntryPage'

/**
 * One entry of a game, on its own screen (#286), or a new one (`new?type=`, #551), drawn by the Lore entry page. The game
 * is checked first, exactly as the game's directory checks it (#284): nothing of a foreign project, or of an entry read
 * through it, is drawn or put in the tab title until it passes.
 */
export default function GameEntityPage({ isNew = false }: { isNew?: boolean }) {
  useI18n()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()

  return (
    <GameGate
      projectId={projectId}
      universeId={workspace?.universe.id}
      notFound={!isNew && !entityId}
    >
      {(game, universeId) => {
        const base = `/app/universes/${universeId}/game-entities/${game.id}`
        return (
          <ProjectEntryPage
            projectId={game.id}
            base={base}
            typesHref={`${base}?manage=types`}
            entityId={isNew ? undefined : entityId}
          />
        )
      }}
    </GameGate>
  )
}
