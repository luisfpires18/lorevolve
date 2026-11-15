import { EmptyState } from './EmptyState'
import { IdeasBrowser } from './IdeasBrowser'
import { useI18n } from '../i18n'
import type { ProjectDetail } from '../projects/types'
import { useUniverseAccess } from '../universes/access'

/**
 * A project's Ideas view (#197): the account's own ideas that are notes for this project, in the same list, capture and
 * editor every other ideas view uses. An idea points only into a universe its author owns (ADR 0030), so a collaborator
 * keeps no ideas here and is told so rather than shown a capture that would be refused.
 */
export function ProjectIdeas({ project }: { project: ProjectDetail }) {
  const { t } = useI18n()
  const access = useUniverseAccess()

  if (!project.universe || !access.keepIdeas) {
    return (
      <EmptyState
        title={t('projects.ideas.ownerOnly')}
        hint={t('projects.ideas.ownerOnlyHint')}
        testId="project-ideas-owner-only"
      />
    )
  }

  return (
    <IdeasBrowser
      scope={{ kind: 'project', universe: project.universe, project: { id: project.id } }}
    />
  )
}
