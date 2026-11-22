const storiesPublication = {
  part: {
    shown: { private: 'Private', public: 'Public', selected: 'Selected' },
    scene: {
      what: 'scene outline',
      verb: 'Publish outline',
      listed: 'Readers see this scene’s title and summary in the story’s outline.',
      kept: 'Its notes, point of view, lore, date, beats and prose are not published by this.',
      isPublic: 'This scene’s outline is on the story’s public page.',
    },
    manuscript: {
      what: 'scene prose',
      verb: 'Publish prose',
      listed: 'Readers can read this scene’s prose, under its title, on the story’s public page.',
      kept: 'Its summary, notes and saved versions are not published by this.',
      isPublic: 'This scene’s prose is on the story’s public page.',
    },
    arc: {
      what: 'plot arc',
      verb: 'Publish arc',
      listed: 'Readers see the arc’s title and description.',
      kept: 'Notes and links to scenes and lore are not published. Plot often gives a story away: publish it only on purpose.',
      isPublic: 'This arc is on the story’s public page.',
    },
    madePrivate: 'Made private. It is no longer on the story’s public page.',
    published: 'Published. It is on the story’s public page.',
    selected: 'Selected for publication. It stays hidden until the story is public.',
    failedPublish: 'It could not be published. Try again.',
    failedPrivate: 'It could not be made private. Try again.',
    selectedHidden:
      'Selected for publication, but hidden until the story is public: the story, with its public summary, in a public universe.',
    onlyYou: 'Only you can see this {what}.',
    onlyYouSelects:
      'Only you can see this {what}. The story is not public yet, so publishing selects it: it stays hidden until the story is.',
    label: 'Publication of {what} “{name}”: {state}',
    heading: 'Selected for publication',
    makePrivate: 'Make private',
  },
  content: {
    shown: { private: 'Private', public: 'Public', selected: 'Selected' },
    entry: {
      listed: 'Readers see its name, type, summary, picture and article.',
      kept: 'Its fields, aliases, tags, relationships and history are not published.',
      isPublic: 'This lore entry is available in your public universe.',
      willPublish: 'Publishing this lore entry makes it available in your public universe.',
      onlyYou: 'Only you can see this entry.',
      publish: 'Publish entry',
    },
    story: {
      listed:
        'Readers see its title, its public summary, and the scenes, prose and plot arcs you publish from them.',
      kept: 'Its premise, chapters and notes are not published, nor any scene, prose or arc you have not published.',
      needsSummary:
        'This story is selected for publication but needs a public summary before readers can see it.',
      noSummary: 'A story needs a public summary, written for readers, before it can be published.',
      isPublic: 'This story is selected for your public universe.',
      willPublish: 'Publishing this story selects it for your public universe.',
      selectedHidden:
        'This story is selected for publication, but remains hidden while the universe is private.',
      willSelect:
        'Your universe is private. Publishing selects this story: it remains hidden while the universe is private.',
      onlyYou: 'Only you can see this story.',
      publish: 'Publish story',
    },
    unavailable: 'Publication status unavailable.',
    madePrivate: 'Made private. It is no longer listed in your public universe.',
    published: 'Published. It is listed in your public universe.',
    selected: 'Selected for publication. It stays hidden while the universe is private.',
    failedPublish: 'It could not be published. Try again.',
    failedPrivate: 'It could not be made private. Try again.',
    headingPublic: 'Public',
    headingSelected: 'Selected for publication',
    headingPrivate: 'Private',
    label: 'Publication: {state}',
    summaryLabel: 'Public summary',
    editSummary: 'Edit public summary…',
    writeSummary: 'Write public summary…',
    makePrivate: 'Make private',
    summarySaved: 'Public summary saved.',
    summaryRemoved: 'Public summary removed.',
  },
}

export default storiesPublication
