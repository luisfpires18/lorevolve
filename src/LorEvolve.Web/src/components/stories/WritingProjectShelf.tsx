import { ShelfCard, shelfStep } from '../ShelfCard'
import { pictureUrl, projectCoverStore } from '../../covers/api'
import { lifecycleLabel, projectRowPath } from '../../projects/sections'
import type { ProjectDetail } from '../../projects/types'

/** The other writing projects, as books on a shelf. */
export function WritingProjectShelf({ projects }: { projects: ProjectDetail[] }) {
  return (
    <ul className="shelf" data-testid="writing-project-list">
      {projects.map((project) => (
        <ShelfCard
          key={project.id}
          frame="book"
          href={projectRowPath(project)}
          title={project.name}
          description={project.summary}
          step={shelfStep(project.lifecycle)}
          statusLabel={lifecycleLabel(project.lifecycle)}
          cover={
            project.cover ? pictureUrl(projectCoverStore(project.id), project.cover, 'card') : null
          }
          attrs={{ 'data-testid': 'writing-project-row' }}
        />
      ))}
    </ul>
  )
}
