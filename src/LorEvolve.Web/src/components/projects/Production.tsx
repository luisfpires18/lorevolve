import { Link } from 'react-router-dom'
import { formatLabel, kindLabel, projectPath } from '../../projects/sections'
import type { CinemaProduction } from '../../projects/sagas'

/** One production row: a link to the original project, with its kind and format. */
export function Production({
  universeId,
  production,
}: {
  universeId: string
  production: CinemaProduction
}) {
  return (
    <span className="fieldlist__text">
      <Link
        className="fieldlist__name"
        to={projectPath(production.projectId, '', universeId)}
        data-testid={`saga-production-${production.projectId}`}
      >
        <bdi>{production.name}</bdi>
      </Link>
      <span className="fieldlist__meta">
        {kindLabel(production.kind)}
        {production.format ? ` · ${formatLabel(production.format)}` : ''}
      </span>
    </span>
  )
}
