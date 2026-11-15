import {
  Boxes,
  Compass,
  FileText,
  Lightbulb,
  ListTree,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { t } from '../i18n'
import { ProjectKind, ProjectLifecycle, type ProjectDetail } from './types'

/**
 * The pages one project has, in the order its expansion and its tab bar list them.
 *
 * Held as data for the same reason the universe's sections are: the sidebar needs the list, the project's tab bar needs
 * the same list, and so does anything that has to name the page an author is on. Each kind offers the views its
 * structure gives it (#192). Every section is an address of its own; the project's bare address leads to the first.
 */
export interface ProjectSection {
  /** The part of the URL below the project. */
  segment: string
  /** The key of its name under `projects`. */
  label: string
  testId: string
  icon: LucideIcon
  /** A view the project's data cannot fill yet, drawn as an empty state rather than as the overview. */
  pending?: boolean
}

const overview: ProjectSection = {
  segment: 'overview',
  label: 'sections.overview',
  testId: 'project-overview',
  icon: Compass,
}
const structure: ProjectSection = {
  segment: 'structure',
  label: 'sections.structure',
  testId: 'project-structure',
  icon: ListTree,
}
const manuscript: ProjectSection = {
  segment: 'manuscript',
  label: 'sections.manuscript',
  testId: 'project-manuscript',
  icon: FileText,
}
const entities: ProjectSection = {
  segment: 'entities',
  label: 'sections.entities',
  testId: 'project-entities',
  icon: Boxes,
}
const systems: ProjectSection = {
  segment: 'systems',
  label: 'sections.systems',
  testId: 'project-systems',
  icon: Settings2,
}
// Ideas have no project link yet, so the view stays empty until #197 gives an idea a project.
const ideas: ProjectSection = {
  segment: 'ideas',
  label: 'sections.ideas',
  testId: 'project-ideas',
  icon: Lightbulb,
  pending: true,
}

// Series episodes, Film scenes and Comic chapters all carry a script, and the app already calls it Script in both
// languages (`projects.seasons.script`), so one section serves the three kinds.
const script: ProjectSection = {
  segment: 'script',
  label: 'seasons.script',
  testId: 'project-script',
  icon: FileText,
}

const SECTIONS_BY_KIND: Record<ProjectDetail['kind'], readonly ProjectSection[]> = {
  [ProjectKind.Writing]: [structure, manuscript, ideas],
  [ProjectKind.Game]: [overview, entities, systems, ideas],
  [ProjectKind.Series]: [structure, script, entities, ideas],
  [ProjectKind.Film]: [structure, script, entities, ideas],
  [ProjectKind.Comic]: [structure, script, entities, ideas],
}

/** The sections a project of this kind offers, in order. */
export function projectSections(kind: ProjectDetail['kind']): readonly ProjectSection[] {
  return SECTIONS_BY_KIND[kind] ?? SECTIONS_BY_KIND[ProjectKind.Writing]
}

/** A section's name, in the current language. */
export function projectSectionLabel(section: ProjectSection) {
  return t(`projects.${section.label}` as never)
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

/**
 * Where a project's pages live.
 *
 * `/app/projects/<id>` is the canonical address: a project may belong to no universe, so it has to have a home that
 * does not depend on one. Inside a universe's workspace the same project is served at
 * `/app/universes/<universeId>/projects/<id>`, so opening one from that sidebar keeps the author inside the universe
 * shell, as every other section does. The page is the same component either way; only the frame around it differs.
 */
export function projectPath(projectId: string, segment = '', universeId?: string) {
  const base = universeId
    ? `/app/universes/${universeId}/projects/${projectId}`
    : `/app/projects/${projectId}`
  return segment ? `${base}/${segment}` : base
}

/**
 * Where one row of the projects list leads.
 *
 * A Story shown as a Writing Project leads to the story, at the address it has always had: its content is the story's
 * and nothing was copied anywhere else (#140). Anything else leads to the project's own page.
 */
export function projectRowPath(project: ProjectDetail, universeId?: string) {
  if (project.storyId && project.universe) {
    return `/app/universes/${project.universe.id}/stories/${project.storyId}`
  }

  return projectPath(project.id, '', universeId)
}
