import type { UniverseCapabilities } from './access'
import {
  BadgeCheck,
  Blocks,
  CalendarRange,
  Compass,
  Feather,
  Globe,
  Hourglass,
  Library,
  Map,
  Network,
  Scale,
  Settings,
  Sparkles,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

export interface Section {
  segment: string
  label: string
  testId: string
  icon: LucideIcon
  /** What the section holds, in a line: the Overview's contents page reads it. */
  purpose: string
  /**
   * The capability a role needs to be offered the section at all (ADR 0041 amendment). Presentation only: the API refuses
   * the rest regardless. Absent means every member reads it.
   */
  requires?: keyof UniverseCapabilities
}

/** The front page. */
export const FRONT: readonly Section[] = [
  {
    segment: '',
    label: 'Overview',
    testId: 'workspace-overview',
    icon: Compass,
    purpose: 'This universe at a glance.',
  },
]

/** The world itself: what is true in it, when, and how it works. */
export const WORLD: readonly Section[] = [
  {
    segment: 'lore',
    label: 'Lore',
    testId: 'workspace-lore',
    icon: Library,
    purpose: 'Every entry: people, places, things and ideas.',
  },
  {
    segment: 'maps',
    label: 'Maps',
    testId: 'workspace-maps',
    icon: Map,
    purpose: 'Pictures of the world, with pins that open the Lore they stand for.',
  },
  {
    segment: 'family-tree',
    label: 'Family Tree',
    testId: 'workspace-family-tree',
    icon: Network,
    purpose: 'Families worked out from recorded connections.',
  },
  {
    segment: 'chronology',
    label: 'Chronology',
    testId: 'workspace-chronology',
    icon: CalendarRange,
    purpose: 'How its dates are written and ordered: plain years, or named date periods.',
  },
  {
    segment: 'world-rules',
    label: 'World Rules',
    testId: 'workspace-world-rules',
    icon: Scale,
    purpose: 'How this universe works, stated plainly.',
  },
]

/** The writing done with it, and the world's chronology it is told against - Stories, then Timeline (Issue #48). */
export const WRITING: readonly Section[] = [
  {
    segment: 'stories',
    label: 'Stories',
    testId: 'workspace-stories',
    icon: Feather,
    purpose: 'Narratives told with this world, scene by scene.',
  },
  {
    segment: 'timeline',
    label: 'Timeline',
    testId: 'workspace-timeline',
    icon: Hourglass,
    purpose: 'What happened, in the order it happened.',
  },
  {
    segment: 'ideas',
    label: 'Ideas',
    testId: 'workspace-ideas',
    icon: StickyNote,
    purpose: 'Possibilities, kept apart from the lore.',
    requires: 'keepIdeas',
  },
]

/** Keeping the world consistent and shaped. */
export const KEEPING: readonly Section[] = [
  {
    segment: 'canon',
    label: 'Canon',
    testId: 'workspace-canon',
    icon: BadgeCheck,
    purpose: 'What this world says twice, and differently.',
  },
  {
    segment: 'types',
    label: 'Types',
    testId: 'workspace-types',
    icon: Blocks,
    purpose: 'The kinds of entry and relation this world uses.',
  },
  {
    segment: 'ai-changes',
    label: 'AI changes',
    testId: 'workspace-ai-changes',
    icon: Sparkles,
    purpose: 'Changes an AI proposed, waiting for someone to approve or reject them.',
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
    label: 'Trash',
    testId: 'workspace-trash',
    icon: Trash2,
    purpose: 'What was removed, waiting to be restored.',
    requires: 'manageTrash',
  },
  {
    segment: 'publish',
    label: 'Publish',
    testId: 'workspace-publish',
    icon: Globe,
    purpose: 'How this universe appears on the public portal.',
    requires: 'publish',
  },
  {
    segment: 'settings',
    label: 'Settings',
    testId: 'workspace-settings',
    icon: Settings,
    purpose: 'Name, colour, collaborators, backups and archive.',
    requires: 'manageUniverse',
  },
]

/**
 * The sections a universe has, in the order the sidebar lists them, grouped as the sidebar spaces them: the front page;
 * the world itself; the writing done with it; keeping it consistent; and, set apart, its upkeep. The worldbuilding groups
 * carry no labels - the spacing says it. Held as data rather than as markup because the narrow layout needs the same list
 * twice: once as the list of links, and once to name the section the author is currently in.
 *
 * One icon per section, none shared with an entry type's, each decorative: the label names the destination and is what a
 * screen reader reads.
 */
/** The sections a role is offered: those it needs nothing for, and those whose capability it has. */
export function offered(sections: readonly Section[], access: UniverseCapabilities) {
  return sections.filter((section) => !section.requires || access[section.requires])
}

export const SECTION_GROUPS: readonly (readonly Section[])[] = [
  FRONT,
  WORLD,
  WRITING,
  KEEPING,
  UPKEEP,
]
