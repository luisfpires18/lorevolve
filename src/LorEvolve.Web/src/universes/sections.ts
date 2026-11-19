import { t } from '../i18n'
import type { UniverseCapabilities } from './access'
import {
  BadgeCheck,
  BookImage,
  Blocks,
  Clapperboard,
  Compass,
  Feather,
  FileDiff,
  FolderOpen,
  Gamepad2,
  Globe,
  Hourglass,
  Library,
  Map,
  Network,
  PenLine,
  Scale,
  Settings,
  StickyNote,
  Swords,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

/** The kinds of project a universe can hold, as the sidebar tells them apart (#272). Film and Series are one: Cinema. */
export type ProjectFamily = 'writing' | 'game' | 'cinema' | 'comic'

export interface Section {
  segment: string
  testId: string
  icon: LucideIcon
  /**
   * The capability a role needs to be offered the section at all (ADR 0041 amendment). Presentation only: the API refuses
   * the rest regardless. Absent means every member reads it.
   */
  requires?: keyof UniverseCapabilities
  /**
   * The family of project the universe must have for the section to be offered (#272). Counted by projects, never by
   * what is inside them, and read from `offered`, the one place visibility is decided.
   */
  needs?: ProjectFamily
  /** Shown, but marked as not yet working properly. */
  wip?: boolean
  /**
   * Other address segments this section owns, so the sidebar still marks it while the author is at one of them.
   *
   * World Logic owns `world-rules` for exactly this reason (#152): a world rule keeps its own address and its own
   * editor, and it is still part of World Logic, so the sidebar says so rather than marking nothing.
   */
  also?: readonly string[]
}

/** The front page. */
export const FRONT: readonly Section[] = [
  {
    segment: '',
    testId: 'workspace-overview',
    icon: Compass,
  },
]

// Each section once, by name, so the sidebar and the Overview's contents page draw the same objects (#191, #273).
const LORE: Section = { segment: 'lore', testId: 'workspace-lore', icon: Library }
const TYPES: Section = { segment: 'types', testId: 'workspace-types', icon: Blocks }
const FAMILY_TREE: Section = {
  segment: 'family-tree',
  testId: 'workspace-family-tree',
  icon: Network,
}
const MAPS: Section = { segment: 'maps', testId: 'workspace-maps', icon: Map }
const WORLD_LOGIC: Section = {
  // World Logic is where both kinds of rule are read (#152, ADR 0072). Every `world-rules` address still works and
  // a world rule is still edited at its own, so nothing an author has linked or bookmarked broke.
  segment: 'world-logic',
  testId: 'workspace-world-logic',
  icon: Scale,
  also: ['world-rules'],
}
const CANON: Section = { segment: 'canon', testId: 'workspace-canon', icon: BadgeCheck, wip: true }
const STORIES: Section = { segment: 'stories', testId: 'workspace-stories', icon: Feather }
const TIMELINE: Section = { segment: 'timeline', testId: 'workspace-timeline', icon: Hourglass }
const IDEAS: Section = {
  segment: 'ideas',
  testId: 'workspace-ideas',
  icon: StickyNote,
  requires: 'keepIdeas',
}
export const GAME_ENTITIES: Section = {
  segment: 'game-entities',
  testId: 'workspace-game-entities',
  icon: Swords,
  needs: 'game',
}
export const WRITING_PROJECTS: Section = {
  segment: 'writing',
  testId: 'workspace-writing',
  icon: PenLine,
  needs: 'writing',
}
export const GAMING: Section = {
  segment: 'gaming',
  testId: 'workspace-gaming',
  icon: Gamepad2,
  needs: 'game',
}
export const CINEMA: Section = {
  segment: 'cinema',
  testId: 'workspace-cinema',
  icon: Clapperboard,
  needs: 'cinema',
}
export const COMIC: Section = {
  segment: 'comic',
  testId: 'workspace-comic',
  icon: BookImage,
  needs: 'comic',
}
// A game's Entities directory lives under its own address but is still part of Projects, so the shell names it (and the tab) so.
const PROJECTS: Section = {
  segment: 'projects',
  testId: 'workspace-projects',
  icon: FolderOpen,
  also: ['game-entities'],
}
const AI_CHANGES: Section = {
  segment: 'ai-changes',
  testId: 'workspace-ai-changes',
  icon: FileDiff,
  requires: 'suggestChanges',
}
const TRASH: Section = {
  segment: 'trash',
  testId: 'workspace-trash',
  icon: Trash2,
  requires: 'manageTrash',
}
const PUBLISH: Section = {
  segment: 'publish',
  testId: 'workspace-publish',
  icon: Globe,
  requires: 'publish',
}
const SETTINGS: Section = {
  segment: 'settings',
  testId: 'workspace-settings',
  icon: Settings,
  requires: 'manageUniverse',
}

/**
 * The sidebar's world building group (#191): every worldbuilding destination in the owner's order. Chronology is no
 * section of its own: it is Timeline's configuration view (#200).
 */
export const WORLD_BUILDING: readonly Section[] = [
  LORE,
  TYPES,
  FAMILY_TREE,
  MAPS,
  TIMELINE,
  WORLD_LOGIC,
  IDEAS,
]

/**
 * The sidebar's Creation group (#271): the place for what is made with the world. Each destination is offered only
 * while the universe has a project of its family (#272), so the group's heading hides when it has none.
 */
export const CREATION: readonly Section[] = [WRITING_PROJECTS, GAMING, CINEMA, COMIC]

/**
 * Management, apart from the world building above it: the universe's projects, what an AI proposed, the public
 * presentation, recovery and configuration. The sidebar sets it off under a rule, and a phone's Sections sheet gives it
 * a row of its own at the foot.
 */
export const MANAGEMENT: readonly Section[] = [PROJECTS, AI_CHANGES, PUBLISH, TRASH, SETTINGS]

/** A labelled group's dictionary key; the front page alone carries no label (#191). */
export function groupKey(source: readonly Section[]) {
  if (source === WORLD_BUILDING) return 'worldBuilding'
  if (source === CREATION) return 'creation'
  if (source === MANAGEMENT) return 'management'
  return null
}

/**
 * Sections with an address but no place in the sidebar (#191). Stories are listed as Writing Projects under the
 * Projects section, so a Stories entry beside it would show one body of work twice. Canon is not offered as a top-level
 * section any more. Both pages keep every address: Stories are reached through Writing, Canon through World Logic's Integrity tab and
 * the canon block notice. They are listed here only so the workspace can still name the page the author is on.
 */
export const UNLISTED: readonly Section[] = [STORIES, CANON]

/** Whether a section is at this address: its own segment, or one of the others it owns. */
export function owns(section: Section, segment: string) {
  return section.segment === segment || (section.also?.includes(segment) ?? false)
}

/** A section's key in the dictionary: its address, or `overview` for the front page. */
function sectionKey(segment: string) {
  return segment === ''
    ? 'overview'
    : segment.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
}

/** The section's name, in the current language. The label names the destination; a screen reader reads it. */
export function sectionLabel(section: Section) {
  return t(`workspace.sections.${sectionKey(section.segment)}.label` as never)
}

/** What the section holds, in a line: the Overview's contents page reads it. */
export function sectionPurpose(section: Section) {
  return t(`workspace.sections.${sectionKey(section.segment)}.purpose` as never)
}

/**
 * The sections a role is offered: those it needs nothing for, and those whose capability it has. AI Changes only while
 * the universe has AI help on, and those tied to a project family only while it has a project of that family.
 */
export function offered(
  sections: readonly Section[],
  access: UniverseCapabilities,
  aiHelp = true,
  families: ReadonlySet<ProjectFamily> = new Set(),
) {
  return sections.filter(
    (section) =>
      (!section.requires || access[section.requires]) &&
      (!section.needs || families.has(section.needs)) &&
      (aiHelp || section.segment !== 'ai-changes'),
  )
}

/**
 * The sections a universe has, in the order the sidebar lists them, grouped as the sidebar draws them: the front page,
 * then the labelled World building, Creation and Management groups (#271). Held as data rather than as markup because
 * the narrow layout needs the same list twice: once as the list of links, and once to name the section the author is
 * currently in.
 *
 * Every group but the front page is labelled, and each label names its group for a screen reader too. One icon per
 * section, none shared with an entry type's, each decorative: the label names the destination and is what a screen
 * reader reads.
 */
export const SECTION_GROUPS: readonly (readonly Section[])[] = [
  FRONT,
  WORLD_BUILDING,
  CREATION,
  MANAGEMENT,
]

/** Every section with an address, listed in the sidebar or not, for naming the one the author is on. */
export const ALL_SECTIONS: readonly Section[] = [...SECTION_GROUPS.flat(), ...UNLISTED]
