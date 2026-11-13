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
}

/** The front page. */
export const FRONT: readonly Section[] = [
  {
    segment: '',
    testId: 'workspace-overview',
    icon: Compass,
  },
]

/** The world itself: its entries, the kinds they come in, its families and its places. */
export const WORLD: readonly Section[] = [
  {
    segment: 'lore',
    testId: 'workspace-lore',
    icon: Library,
  },
  {
    segment: 'types',
    testId: 'workspace-types',
    icon: Blocks,
  },
  {
    segment: 'family-tree',
    testId: 'workspace-family-tree',
    icon: Network,
  },
  {
    segment: 'maps',
    testId: 'workspace-maps',
    icon: Map,
  },
]

/** The rules it keeps: how it works, where the lore breaks that, and how its dates run. */
export const RULES: readonly Section[] = [
  {
    segment: 'world-rules',
    testId: 'workspace-world-rules',
    icon: Scale,
  },
  {
    segment: 'canon',
    testId: 'workspace-canon',
    icon: BadgeCheck,
    wip: true,
  },
  {
    segment: 'chronology',
    testId: 'workspace-chronology',
    icon: CalendarRange,
  },
]

/** The writing done with it, and the world's chronology it is told against - Stories, then Timeline (Issue #48). */
export const WRITING: readonly Section[] = [
  {
    segment: 'stories',
    testId: 'workspace-stories',
    icon: Feather,
  },
  {
    segment: 'timeline',
    testId: 'workspace-timeline',
    icon: Hourglass,
  },
  {
    segment: 'ideas',
    testId: 'workspace-ideas',
    icon: StickyNote,
    requires: 'keepIdeas',
  },
]

/** What an AI proposed, waiting for review. */
export const REVIEW: readonly Section[] = [
  {
    segment: 'ai-changes',
    testId: 'workspace-ai-changes',
    icon: FileDiff,
    requires: 'suggestChanges',
  },
]

/**
 * Upkeep, apart from the worldbuilding above it: recovery, the public presentation, configuration. The sidebar sets it
 * off under a rule, and a phone's Sections sheet gives it a row of its own at the foot.
 */
export const UPKEEP: readonly Section[] = [
  {
    segment: 'trash',
    testId: 'workspace-trash',
    icon: Trash2,
    requires: 'manageTrash',
  },
  {
    segment: 'publish',
    testId: 'workspace-publish',
    icon: Globe,
    requires: 'publish',
  },
  {
    segment: 'settings',
    testId: 'workspace-settings',
    icon: Settings,
    requires: 'manageUniverse',
  },
]

/**
 * The sections a universe has, in the order the sidebar lists them, grouped as the sidebar spaces them: the front page;
 * the world itself; the rules it keeps; the writing done with it; AI review; and, set apart, its upkeep. The worldbuilding groups
 * carry no labels - the spacing says it. Held as data rather than as markup because the narrow layout needs the same list
 * twice: once as the list of links, and once to name the section the author is currently in.
 *
 * One icon per section, none shared with an entry type's, each decorative: the label names the destination and is what a
 * screen reader reads.
 */
/**
 * The sections a role is offered: those it needs nothing for, and those whose capability it has. AI Changes only while
 * the universe has AI help on.
 */
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

export const SECTION_GROUPS: readonly (readonly Section[])[] = [
  FRONT,
  WORLD,
  RULES,
  WRITING,
  REVIEW,
  UPKEEP,
]
