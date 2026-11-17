import { Link, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ProjectEntityDetailView } from '../components/ProjectEntityDetailView'
import { useGameProject } from '../projects/useGameProject'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { GAME_ENTITIES, sectionLabel } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * One entry of a game, on its own screen (#286). The game is checked first, exactly as the game's directory checks it
 * (#284): nothing of a foreign project, or of an entry read through it, is drawn or put in the tab title until it passes.
 */
export default function GameEntityPage() {
  useI18n()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const { loading, game } = useGameProject(projectId, universeId)
  useDocumentTitle(game?.name ?? sectionLabel(GAME_ENTITIES))

  if (loading) return <p className="projects__lede">{t('projects.list.loading')}</p>

  if (game === null || !universeId || !entityId) {
    return (
      <EmptyState
        title={t('projects.gameEntities.notFound')}
        hint={t('projects.gameEntities.notFoundHint')}
        action={
          <Link to={`/app/universes/${universeId}/game-entities`}>
            {t('projects.gameEntities.back')}
          </Link>
        }
        testId="game-entities-missing"
      />
    )
  }

  return (
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
