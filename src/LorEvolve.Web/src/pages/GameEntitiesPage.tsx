import { useState } from 'react'
import { Section } from '../components/Section'
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { Crumb } from '../components/Crumb'
import { PageHeader } from '../components/PageHeader'
import { GameGate } from '../projects/gameGate'
import { t, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { ProjectLore } from './ProjectLore'

/**
 * One game's directory inside Game Entities (#284): its own categories, counts and entries, read by the game's id, so
 * another game's types never show here. The game and the category both live in the address (`?type=`, `?manage=types`).
 * The entries are the Lore list (#551); this family has no Types view, so Manage types opens the editor in place.
 */
export default function GameEntitiesPage() {
  useI18n()
  const { projectId } = useParams<{ projectId: string }>()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const [params] = useSearchParams()
  const managing = params.get('manage') === 'types'
  const [schemaVersion, setSchemaVersion] = useState(0)

  const back = {
    to: `/app/universes/${universeId}/game-entities`,
    label: t('projects.gameEntities.back'),
    testId: 'game-entities-back',
  }

  return (
    // Only a game of this universe counts: a foreign project's name must not reach the tab title either.
    <GameGate projectId={projectId} universeId={universeId}>
      {(project, gameUniverseId) => {
        const base = `/app/universes/${gameUniverseId}/game-entities/${project.id}`
        return (
          <Section testId="game-entities-page">
            <PageHeader
              crumb={<Crumb items={[back]} />}
              title={<bdi>{project.name}</bdi>}
              titleTestId="game-entities-title"
              lede={t('projects.gameEntities.lede')}
              actions={
                managing ? undefined : (
                  <Button
                    tone="secondary"
                    to={`${base}?manage=types`}
                    data-testid="project-types-manage"
                  >
                    {t('projects.entities.manage')}
                  </Button>
                )
              }
            />
            <ProjectLore
              key={project.id}
              list
              projectId={project.id}
              base={base}
              typesHref={`${base}?manage=types`}
              reloadKey={schemaVersion}
              onChanged={() => setSchemaVersion((version) => version + 1)}
            />
          </Section>
        )
      }}
    </GameGate>
  )
}
