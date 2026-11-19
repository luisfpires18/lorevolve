import { Link, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ProjectEntityDetailView } from '../components/ProjectEntityDetailView'
import { useGameProject } from '../projects/useGameProject'
import { useTitleDetail } from '../lib/useTitleDetail'
import { t, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { LoadingNote } from '../components/LoadingNote'
import { LoadError } from '../components/LoadError'

/**
 * One entry of a game, on its own screen (#286). The game is checked first, exactly as the game's directory checks it
 * (#284): nothing of a foreign project, or of an entry read through it, is drawn or put in the tab title until it passes.
 */
export default function GameEntityPage() {
  useI18n()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const { loading, failed, retry, game } = useGameProject(projectId, universeId)
  useTitleDetail(game?.name ?? null)

  if (loading) return <LoadingNote>{t('projects.list.loading')}</LoadingNote>

  if (failed)
    return (
      <LoadError message={t('projects.one.failed')} onRetry={retry} testId="game-project-failed" />
    )

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
