import { useOutletContext, useParams } from 'react-router-dom'
import { MissingState } from '../components/MissingState'
import { ProjectEntityDetailView } from '../components/ProjectEntityDetailView'
import { useGameProjectLoad } from '../projects/useGameProjectLoad'
import { useTitleDetail } from '../lib/useTitleDetail'
import { t, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { ReadGate } from '../components/ReadGate'

/**
 * One entry of a game, on its own screen (#286). The game is checked first, exactly as the game's directory checks it
 * (#284): nothing of a foreign project, or of an entry read through it, is drawn or put in the tab title until it passes.
 */
export default function GameEntityPage() {
  useI18n()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const { load, game, retry } = useGameProjectLoad(projectId, universeId)
  useTitleDetail(game?.name ?? null)

  return (
    <ReadGate
      load={load}
      loading={{ text: t('projects.list.loading') }}
      error={{ onRetry: retry, testId: 'game-project-failed' }}
    >
      {(game) =>
        game === null || !universeId || !entityId ? (
          <MissingState
            title={t('projects.gameEntities.notFound')}
            hint={t('projects.gameEntities.notFoundHint')}
            backTo={`/app/universes/${universeId}/game-entities`}
            backLabel={t('projects.gameEntities.back')}
            backIn="action"
            testId="game-entities-missing"
          />
        ) : (
          <ProjectEntityDetailView
            key={entityId}
            projectId={game.id}
            universeId={universeId}
            entityId={entityId}
            gameName={game.name}
            gameHref={`/app/universes/${universeId}/game-entities/${game.id}`}
          />
        )
      }
    </ReadGate>
  )
}
