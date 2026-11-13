/** A universe's own chrome: its rail, tabs and overview (#102). */
const workspace = {
  rail: {
    brand: 'LorEvolve',
    universe: 'Universe',
    archived: 'Archived',
    opening: 'Opening…',
    sections: 'Sections',
    close: 'Close',
    allUniverses: 'All universes',
    sharedAs: 'Shared as {role}',
  },
  missing: {
    title: 'That universe is not here.',
    back: 'Back to your universes',
    failed: 'Could not open this universe.',
    tryAgain: 'Try again',
  },
  overview: {
    noDescription: 'No description yet.',
    noDescriptionOwn:
      'No description yet. {settings} is where you give this world its opening line.',
    noDescriptionSettings: 'Settings',
    dates: 'Created {created}, last changed {changed}',
    shared: 'Shared with you as {role}. {description}',
    empty:
      'Nothing is written here yet. {lore}, where each character, place and thing gets a page.',
    emptyLore: 'Begin in Lore',
    groups: {
      world: 'World',
      rules: 'Rules',
      writing: 'Writing',
      review: 'Review',
    },
  },
  sections: {
    overview: {
      label: 'Overview',
      purpose: 'This universe at a glance.',
    },
    lore: {
      label: 'Lore',
      purpose: 'Every entry: people, places, things and ideas.',
    },
    types: {
      label: 'Types',
      purpose: 'The kinds of entry and relation this world uses.',
    },
    familyTree: {
      label: 'Family Tree',
      purpose: 'Families worked out from recorded connections.',
    },
    maps: {
      label: 'Maps',
      purpose: 'Pictures of the world, with pins that open the Lore they stand for.',
    },
    worldRules: {
      label: 'World Rules',
      purpose: 'How this universe works, stated plainly.',
    },
    canon: {
      label: 'Canon',
      purpose: 'Where the lore breaks its own World Rules. Still being built.',
    },
    chronology: {
      label: 'Chronology',
      purpose: 'How its dates are written and ordered: plain years, or named date periods.',
    },
    stories: {
      label: 'Stories',
      purpose: 'Narratives told with this world, scene by scene.',
    },
    timeline: {
      label: 'Timeline',
      purpose: 'What happened, in the order it happened.',
    },
    ideas: {
      label: 'Ideas',
      purpose: 'Possibilities, kept apart from the lore.',
    },
    aiChanges: {
      label: 'AI Changes',
      purpose: 'Changes an AI proposed, waiting for someone to approve or reject them.',
    },
    trash: {
      label: 'Trash',
      purpose: 'What was removed, waiting to be restored.',
    },
    publish: {
      label: 'Publish',
      purpose: 'How this universe appears on the public portal.',
    },
    settings: {
      label: 'Settings',
      purpose: 'Name, colour, collaborators, backups and archive.',
    },
  },
}

export default workspace
