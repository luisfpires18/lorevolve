import { useState } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ProjectEntitiesView } from '../components/ProjectEntitiesView'
import { useGameProject } from '../projects/useGameProject'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { GAME_ENTITIES, sectionLabel } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * One game's directory inside Game Entities (#284): its own categories, counts and entries, read by the game's id, so
 * another game's types never show here. The game and the category both live in the address (`?type=`, `?manage=types`).
 */
export default function GameEntitiesPage() {
  useI18n()
  const { projectId } = useParams<{ projectId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const { pathname } = useLocation()
  const [schemaVersion, setSchemaVersion] = useState(0)
  // Only a game of this universe counts: a foreign project's name must not reach the tab title either.
  const { loading, game: project } = useGameProject(projectId, universeId)
  useDocumentTitle(project?.name ?? sectionLabel(GAME_ENTITIES))

  const back = (
    <Link to={`/app/universes/${universeId}/game-entities`} data-testid="game-entities-back">
      {t('projects.gameEntities.back')}
    </Link>
  )

  if (loading) return <p className="projects__lede">{t('projects.list.loading')}</p>

  // Not a game of this universe: the API still decides who may read it, this only keeps the screen honest.
  if (project === null) {
    return (
      <EmptyState
        title={t('projects.gameEntities.notFound')}
        hint={t('projects.gameEntities.notFoundHint')}
        action={back}
        testId="game-entities-missing"
      />
    )
  }

  return (
    <section className="projects" data-testid="game-entities-page">
      <PageHeader
        crumb={back}
        title={<bdi>{project.name}</bdi>}
        titleTestId="game-entities-title"
        lede={t('projects.gameEntities.lede')}
      />
      <ProjectEntitiesView
        key={project.id}
        projectId={project.id}
        universeId={project.universe.id}
        reloadKey={schemaVersion}
        entryHref={(entry) => `${pathname}/${entry.id}`}
        onChanged={() => setSchemaVersion((version) => version + 1)}
      />
    </section>
  )
}
