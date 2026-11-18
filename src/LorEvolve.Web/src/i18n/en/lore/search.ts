const loreSearch = {
  kind: {
    entity: 'Lore',
    story: 'Story',
    chapter: 'Chapter',
    scene: 'Scene',
    plotArc: 'Arc',
    manuscript: 'Manuscript',
    idea: 'Idea',
    worldRule: 'World rule',
  },
  field: {
    alias: 'Also known as',
    summary: 'In the summary',
    premise: 'In the premise',
    description: 'In the description',
    notes: 'In the notes',
    body: 'In the idea',
    article: 'In the article',
    prose: 'In the prose',
  },
  unreachable: 'The search could not be reached.',
  empty: 'Nothing in this universe matches “{query}”.',
  announce: {
    results: {
      one: '1 result. Use the up and down arrows to choose one.',
      other: '{n} results. Use the up and down arrows to choose one.',
    },
    resultsMore: {
      one: '1 result, and more that are not shown. Use the up and down arrows to choose one.',
      other: '{n} results, and more that are not shown. Use the up and down arrows to choose one.',
    },
  },
  opened: 'Opened {kind} “{title}”.',
  label: 'Search this universe',
  hint: 'Finds words in the lore and articles, stories, chapters, scenes, arcs, manuscripts and ideas of this universe. Results are listed as you type.',
  idle: 'Search the lore and articles, stories, chapters, scenes, arcs, manuscripts and ideas of this universe.',
  searching: 'Searching…',
  retry: 'Try again',
  results: 'Results',
  more: 'The closest matches of each kind. Add a word to narrow it down.',
}

export default loreSearch
