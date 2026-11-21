import { t } from '../i18n'
import { formatLabel, formatsFor, kindLabel, lifecycleLabel } from './sections'
import type { ProjectDetail } from './types'

/**
 * A project's kind, format and lifecycle as keyed spans, for the projects list and the project's own lede. The format
 * span carries `formatTestId`; with `unset`, a kind that has formats but none chosen says so instead of leaving it out.
 * No separators here: each caller joins the spans its own way.
 */
export function projectMetaSpans(
  project: Pick<ProjectDetail, 'kind' | 'format' | 'lifecycle'>,
  formatTestId: string,
  { unset = false }: { unset?: boolean } = {},
) {
  const format = project.format
    ? formatLabel(project.format)
    : unset && formatsFor(project.kind).length > 0
      ? t('projects.format.unset')
      : null
  return [
    <span key="kind">{kindLabel(project.kind)}</span>,
    format === null ? null : (
      <span key="format" data-testid={formatTestId}>
        {format}
      </span>
    ),
    <span key="lifecycle">{lifecycleLabel(project.lifecycle)}</span>,
  ]
}
