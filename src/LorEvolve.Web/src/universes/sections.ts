import { t } from '../i18n'
import type { UniverseCapabilities } from './access'
import {
  BadgeCheck,
  Blocks,
  CalendarRange,
  Compass,
  Feather,
  FileDiff,
  Globe,
  Hourglass,
  Library,
  Map,
  Network,
  Scale,
  Settings,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

export interface Section {
  segment: string
  testId: string
  icon: LucideIcon
  /**
   * The capability a role needs to be offered the section at all (ADR 0041 amendment). Presentation only: the API refuses
   * the rest regardless. Absent means every member reads it.
   */
  requires?: keyof UniverseCapabilities
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

// Each section once, by name, because the sidebar and the Overview's contents page group them differently (#191).
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
const CHRONOLOGY: Section = {
  segment: 'chronology',
  testId: 'workspace-chronology',
  icon: CalendarRange,
}
const STORIES: Section = { segment: 'stories', testId: 'workspace-stories', icon: Feather }
const TIMELINE: Section = { segment: 'timeline', testId: 'workspace-timeline', icon: Hourglass }
const IDEAS: Section = {
  segment: 'ideas',
  testId: 'workspace-ideas',
  icon: StickyNote,
  requires: 'keepIdeas',
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

// The Overview's contents page still reads these four parts (#191 changes only the sidebar).
/** The world itself: its entries, the kinds they come in, its families and its places. */
export const WORLD: readonly Section[] = [LORE, TYPES, FAMILY_TREE, MAPS]

/** The rules it keeps: how it works, where the lore breaks that, and how its dates run. */
export const RULES: readonly Section[] = [WORLD_LOGIC, CANON, CHRONOLOGY]

/** The writing done with it, and the world's chronology it is told against - Stories, then Timeline (Issue #48). */
export const WRITING: readonly Section[] = [STORIES, TIMELINE, IDEAS]

/** What an AI proposed, waiting for review. */
export const REVIEW: readonly Section[] = [AI_CHANGES]

/**
 * The sidebar's world building group (#191): every worldbuilding destination in the owner's order. Chronology stays a
 * section of its own after Timeline until #200 moves it under Timeline.
 */
export const WORLD_BUILDING: readonly Section[] = [
  LORE,
  TYPES,
  FAMILY_TREE,
  MAPS,
  TIMELINE,
  CHRONOLOGY,
  WORLD_LOGIC,
  IDEAS,
]

/**
 * Management, apart from the worldbuilding above it: what an AI proposed, the public presentation, recovery and
 * configuration. The sidebar sets it off under a rule, and a phone's Sections sheet gives it a row of its own at the foot.
 */
export const MANAGEMENT: readonly Section[] = [AI_CHANGES, PUBLISH, TRASH, SETTINGS]

/**
 * Sections with an address but no place in the sidebar (#191). Stories are listed as Writing Projects in the sidebar's
 * projects group, so a Stories entry beside them showed one body of work twice. Canon is not offered as a top-level
 * section any more. Both pages keep every address, and the Overview's contents page still links to them; they are
 * listed here only so the workspace can still name the page the author is on.
 */
export const UNLISTED: readonly Section[] = [STORIES, CANON]

/**
 * The sections a universe has, in the order the sidebar lists them, grouped as the sidebar draws them: the front page,
 * then the labelled World building group, then (drawn by its own component) Projects, then the labelled Management
 * group. Held as data rather than as markup because the narrow layout needs the same list twice: once as the list of
 * links, and once to name the section the author is currently in.
 *
 * Until #191 the worldbuilding groups carried no labels - the spacing said it. That decision is reversed on purpose:
 * the owner's target sidebar labels every group, because once projects joined the rail, space alone no longer told
 * the world, its projects and its management apart. Each label names its group for a screen reader too.
 *
 * One icon per section, none shared with an entry type's, each decorative: the label names the destination and is what a
 * screen reader reads.
 */
/**
 * The sections a role is offered: those it needs nothing for, and those whose capability it has. AI Changes only while
 * the universe has AI help on.
 */
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

export function offered(sections: readonly Section[], access: UniverseCapabilities, aiHelp = true) {
  return sections.filter(
    (section) =>
      (!section.requires || access[section.requires]) &&
      (aiHelp || section.segment !== 'ai-changes'),
  )
}

export const SECTION_GROUPS: readonly (readonly Section[])[] = [FRONT, WORLD_BUILDING, MANAGEMENT]

/** Every section with an address, listed in the sidebar or not, for naming the one the author is on. */
export const ALL_SECTIONS: readonly Section[] = [...SECTION_GROUPS.flat(), ...UNLISTED]
