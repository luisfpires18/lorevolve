import { useState } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { Crumb } from '../components/Crumb'
import { PageHeader } from '../components/PageHeader'
import { ProjectEntitiesView } from '../components/ProjectEntitiesView'
import { useGameProject } from '../projects/useGameProject'
import { useTitleDetail } from '../lib/useTitleDetail'
import { t, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { LoadingNote } from '../components/LoadingNote'
import { LoadError } from '../components/LoadError'

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
  const { loading, failed, retry, game: project } = useGameProject(projectId, universeId)
  useTitleDetail(project?.name ?? null)

  const back = {
    to: `/app/universes/${universeId}/game-entities`,
    label: t('projects.gameEntities.back'),
    testId: 'game-entities-back',
  }

  if (loading) return <LoadingNote>{t('projects.list.loading')}</LoadingNote>

  if (failed)
    return (
      <LoadError message={t('projects.one.failed')} onRetry={retry} testId="game-project-failed" />
    )

  // Not a game of this universe: the API still decides who may read it, this only keeps the screen honest.
  if (project === null) {
    return (
      <EmptyState
        title={t('projects.gameEntities.notFound')}
        hint={t('projects.gameEntities.notFoundHint')}
        action={
          <Link to={back.to} data-testid={back.testId}>
            {back.label}
          </Link>
        }
        testId="game-entities-missing"
      />
    )
  }

  return (
    <section className="projects" data-testid="game-entities-page">
      <PageHeader
        crumb={<Crumb items={[back]} />}
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
