import { Compass, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'
import { ProjectKind, ProjectLifecycle, type ProjectDetail } from './types'

/**
 * The pages one project has, in the order its expansion lists them.
 *
 * Held as data for the same reason the universe's sections are: the sidebar needs the list, and so does anything that
 * has to name the page an author is on. Today a project has one page, its overview. #140 gives a Writing project its
 * story's pages and #141 renames that story's Scenes tab to Structure; both add entries here rather than touching the
 * markup that draws them.
 */
export interface ProjectSection {
  /** The part of the URL below the project, empty for the project's own page. */
  segment: string
  testId: string
  icon: LucideIcon
}

export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  {
    segment: '',
    testId: 'project-overview',
    icon: Compass,
  },
]

/** A section's name, in the current language. */
export function projectSectionLabel(section: ProjectSection) {
  const key = section.segment === '' ? 'overview' : section.segment
  return t(`projects.sections.${key}` as never)
}

/** What kind of work this is, in the current language. */
export function kindLabel(kind: ProjectDetail['kind']) {
  switch (kind) {
    case ProjectKind.Game:
      return t('projects.kind.game')
    case ProjectKind.Series:
      return t('projects.kind.series')
    case ProjectKind.Film:
      return t('projects.kind.film')
    case ProjectKind.Comic:
      return t('projects.kind.comic')
    default:
      return t('projects.kind.writing')
  }
}

/** How far along it is, in the current language. */
export function lifecycleLabel(lifecycle: ProjectDetail['lifecycle']) {
  switch (lifecycle) {
    case ProjectLifecycle.Active:
      return t('projects.lifecycle.active')
    case ProjectLifecycle.Complete:
      return t('projects.lifecycle.complete')
    case ProjectLifecycle.Archived:
      return t('projects.lifecycle.archived')
    default:
      return t('projects.lifecycle.planning')
  }
}

/** Where a project's pages live. One address, whether the project was reached from a universe or from the workspace. */
export function projectPath(projectId: string, segment = '') {
  return segment ? `/app/projects/${projectId}/${segment}` : `/app/projects/${projectId}`
}
