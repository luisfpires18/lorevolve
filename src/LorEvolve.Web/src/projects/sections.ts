import { Boxes, FileText, ListTree, Settings2, Shapes, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'
import type { ProjectFamily } from '../universes/sections'
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
// A project's own types, a view of their own (owner, 2026-11-17) rather than a screen inside Entities.
const types: ProjectSection = {
  segment: 'types',
  label: 'sections.types',
  testId: 'project-types',
  icon: Shapes,
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

// Every kind uses one layout, the Game's (#377): no kind has an overview, every project heads its own page, and the
// first entry is the kind's opening view (Structure, or Entities for a Game, which has no structure).
const rest = [entities, types, systems]
const SECTIONS_BY_KIND: Record<ProjectDetail['kind'], readonly ProjectSection[]> = {
  [ProjectKind.Writing]: [structure, manuscript, ...rest],
  [ProjectKind.Game]: rest,
  [ProjectKind.Series]: [structure, script, ...rest],
  [ProjectKind.Film]: [structure, script, ...rest],
  [ProjectKind.Comic]: [structure, script, ...rest],
}

// A Story shown as a Writing Project has the story's own views and nothing else: it is not a stored project, so it
// holds no project types or entries (#194).
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
/** The Cinema (#288) and Comic (#293) formats and the kind each belongs to; the ids are the API's `ProjectFormats`, first of a kind is its default. */
export const PROJECT_FORMATS = [
  { id: 'feature-film', kind: ProjectKind.Film },
  { id: 'short-film', kind: ProjectKind.Film },
  { id: 'special', kind: ProjectKind.Film },
  { id: 'trailer', kind: ProjectKind.Film },
  { id: 'tv-show', kind: ProjectKind.Series },
  { id: 'limited-series', kind: ProjectKind.Series },
  { id: 'western-comic', kind: ProjectKind.Comic },
  { id: 'manga', kind: ProjectKind.Comic },
  { id: 'graphic-novel', kind: ProjectKind.Comic },
  { id: 'one-shot', kind: ProjectKind.Comic },
  { id: 'webcomic', kind: ProjectKind.Comic },
] as const

export function formatsFor(kind: ProjectDetail['kind']) {
  return PROJECT_FORMATS.filter((format) => format.kind === kind)
}

export function formatLabel(id: string) {
  switch (id) {
    case 'feature-film':
      return t('projects.format.feature-film')
    case 'short-film':
      return t('projects.format.short-film')
    case 'special':
      return t('projects.format.special')
    case 'trailer':
      return t('projects.format.trailer')
    case 'tv-show':
      return t('projects.format.tv-show')
    case 'limited-series':
      return t('projects.format.limited-series')
    case 'western-comic':
      return t('projects.format.western-comic')
    case 'manga':
      return t('projects.format.manga')
    case 'graphic-novel':
      return t('projects.format.graphic-novel')
    case 'one-shot':
      return t('projects.format.one-shot')
    case 'webcomic':
      return t('projects.format.webcomic')
    default:
      return id
  }
}

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

/** The sidebar family a kind belongs to: Film and Series are one, Cinema (#272). */
function familyOf(kind: ProjectDetail['kind']): ProjectFamily {
  switch (kind) {
    case ProjectKind.Game:
      return 'game'
    case ProjectKind.Series:
    case ProjectKind.Film:
      return 'cinema'
    case ProjectKind.Comic:
      return 'comic'
    default:
      return 'writing'
  }
}

/** The families of project a universe has, by its projects alone: what is inside them is never read (#272). */
export function projectFamilies(projects: readonly Pick<ProjectDetail, 'kind'>[]) {
  return new Set(projects.map((project) => familyOf(project.kind)))
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
