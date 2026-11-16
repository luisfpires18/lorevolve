import { Boxes, Compass, FileText, ListTree, Settings2, type LucideIcon } from 'lucide-react'
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

// Series episodes, Film scenes and Comic chapters all carry a script, and the app already calls it Script in both
// languages (`projects.seasons.script`), so one section serves the three kinds.
const script: ProjectSection = {
  segment: 'script',
  label: 'seasons.script',
  testId: 'project-script',
  icon: FileText,
}

// Every kind opens on its overview and offers Entities, because the overview holds the project's schema and Entities
// its entries until #196 moves the schema into Entities (#193): a kind without either would put a panel out of reach.
const SECTIONS_BY_KIND: Record<ProjectDetail['kind'], readonly ProjectSection[]> = {
  [ProjectKind.Writing]: [overview, structure, manuscript, entities],
  [ProjectKind.Game]: [overview, entities, systems],
  [ProjectKind.Series]: [overview, structure, script, entities],
  [ProjectKind.Film]: [overview, structure, script, entities],
  [ProjectKind.Comic]: [overview, structure, script, entities],
}

// A Story shown as a Writing Project has the story's own three views and nothing else: it is not a stored project, so
// it holds no project types or entries, and its Overview would be a second header over the story's (#194).
const STORY_SECTIONS: readonly ProjectSection[] = [structure, manuscript]

/** The sections a project of this kind offers, in order; a story-backed project offers the story's views. */
export function projectSections(
  kind: ProjectDetail['kind'],
  storyId?: string | null,
): readonly ProjectSection[] {
  if (storyId) return STORY_SECTIONS
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
 * `/app/universes/<universeId>/projects/<id>` is the canonical address, because every project belongs to exactly one
 * universe (#172) and opening it there keeps the author inside that universe's shell, as every other section does.
 * `/app/projects/<id>` is kept as the account-level way in: it reads the project and redirects here (#199).
 */
export function projectPath(projectId: string, segment: string, universeId: string) {
  const base = `/app/universes/${universeId}/projects/${projectId}`
  return segment ? `${base}/${segment}` : base
}

/**
 * A story's address, as the view of its Writing Project (#194). The story's page and the screens beside it link here
 * directly rather than through the old story address, because a redirect between two routes would start the story's
 * page again, and moving between its views is meant to keep it.
 */
export function storyProjectPath(
  universeId: string,
  storyId: string,
  view: 'structure' | 'manuscript' = 'structure',
  sceneId?: string,
) {
  const path = projectPath(storyId, view, universeId)
  return sceneId ? `${path}/${sceneId}` : path
}

/**
 * Where one row of the projects list leads.
 *
 * #140 sent a Story shown as a Writing Project to the story's own address, because the project shell did not exist yet
 * and the story's screen was the only place its content could be read. #194 reverses that: every kind now opens its
 * project shell the same way, and a story-backed project's shell renders the story's own views, so its content is
 * still the story's and nothing was copied anywhere (#140). The story's old addresses redirect here.
 */
export function projectRowPath(project: ProjectDetail) {
  return projectPath(project.id, '', project.universe.id)
}
