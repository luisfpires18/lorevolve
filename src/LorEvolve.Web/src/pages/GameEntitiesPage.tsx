import { useState } from 'react'
import { Section } from '../components/Section'
import { useLocation, useOutletContext, useParams } from 'react-router-dom'
import { Crumb } from '../components/Crumb'
import { PageHeader } from '../components/PageHeader'
import { ProjectEntitiesView } from '../components/ProjectEntitiesView'
import { GameGate } from '../projects/gameGate'
import { t, useI18n } from '../i18n'
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

  const back = {
    to: `/app/universes/${universeId}/game-entities`,
    label: t('projects.gameEntities.back'),
    testId: 'game-entities-back',
  }

  return (
    // Only a game of this universe counts: a foreign project's name must not reach the tab title either.
    <GameGate projectId={projectId} universeId={universeId}>
      {(project) => (
        <Section testId="game-entities-page">
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
        </Section>
      )}
    </GameGate>
  )
}
