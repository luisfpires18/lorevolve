/** Trash, backups and restore, exports, connected apps and feedback (#105). */
const data = {
  tokens: {
    remove: 'Remove {value}',
  },
  export: {
    backupFailed: 'That backup could not be prepared. Try again.',
    exportFailed: 'That export could not be prepared. Try again.',
  },
  feedback: {
    open: 'Feedback',
    thanks: 'Thanks. Your report was sent.',
    leaveConfirm: 'This report has not been sent. Leave without sending it?',
    describe: 'Describe it in a few words.',
    sendFailed: 'That could not be sent. Try again.',
    title: 'Report a bug or ask for a feature',
    kindLabel: 'What is it?',
    kindGroup: 'What is it?',
    kindBug: 'Bug',
    kindFeature: 'Feature request',
    textBug: 'What went wrong?',
    textFeature: 'What would you like?',
    hintBug:
      'What you did, what you expected, and what happened instead. The page you are on is sent with it.',
    hintFeature:
      'What it would let you do, and where you would use it. The page you are on is sent with it.',
    sending: 'Sending',
    send: 'Send',
    cancel: 'Cancel',
  },
  connectedApps: {
    status: {
      active: 'Connected',
      noAccess: 'No access: you’re no longer a member of this universe',
      expired: 'Needs reconnecting: connect it again from the app to use it',
    },
    disconnectedAnnouncement: '{client} is disconnected from {universe}.',
    title: 'Connected apps',
    note: 'AI apps you’ve allowed to read a universe. Each one reads only that universe, with your access, and can’t change anything.',
    loading: 'Loading your connected apps…',
    loadFailed: 'Your connected apps couldn’t be loaded.',
    retry: 'Try again',
    empty: 'No apps are connected. To connect one, open a universe and choose Connect to AI.',
    disconnectFailed: 'The app couldn’t be disconnected. Try again.',
    readerFailed: 'It couldn’t be made a Reader. Try again.',
    publishedBy: 'Published by {host}',
    unverified: 'Unverified app',
    creator: 'Creator: reads, and proposes changes for review',
    reader: 'Reader: reads only',
    reads: 'Reads {universe}',
    connectedOn: 'Connected {date}',
    lastUsed: 'Last used {date}',
    neverUsed: 'Not used yet',
    makeReaderLabel: 'Make {client} a Reader of {universe}',
    changing: 'Changing',
    makeReader: 'Make Reader',
    disconnectLabel: 'Disconnect {client} from {universe}',
    disconnect: 'Disconnect',
    confirmTitle: 'Disconnect {client} from {universe}?',
    confirmNote:
      'The app loses access straight away. You stay signed in to LorEvolve, and your other connections keep working. You can connect it again later.',
    disconnecting: 'Disconnecting',
    keep: 'Keep',
    stopped:
      'It is a Reader now: it can still read, and can’t propose changes. What it already proposed can only be rejected.',
  },
  trash: {
    title: 'Trash',
    ledeOwner:
      'What you removed from your lore, your stories and your world rules. Everything here can be restored with everything it held, until you choose to delete it permanently.',
    ledeMember:
      'What was removed from this universe’s lore, stories and world rules. Everything here can be restored with everything it held. Restored items that were public will be restored privately. Only the owner can delete anything permanently.',
    ideasPointer: 'Deleted ideas are not here: they belong to your account, and wait in {link}.',
    ideasLink: 'Ideas, under Recently deleted',
    select: 'Select',
    loading: 'Looking through the Trash…',
    loadFailed: 'Could not open the Trash.',
    retry: 'Try again',
    kind: {
      entry: 'Entry',
      story: 'Story',
      chapter: 'Chapter',
      scene: 'Scene',
      arc: 'Arc',
      worldRule: 'World rule',
      relationship: 'Relationship',
      timelineEvent: 'Timeline moment',
    },
    where: {
      story: 'A whole story, with everything in it',
      worldRule: 'In World Rules',
      relationship: 'A relationship between two entries',
      timeline: 'On the timeline',
      timelineStatus: 'On the timeline · {status}',
      inStory: 'In {story}',
    },
    blocked: {
      story: 'Its story, {story}, is in the Trash too. Restore the story first.',
      entry: 'One of the entries it connects is in the Trash too. Restore that entry first.',
    },
    back: {
      entry: '{name} is back in your lore.',
      story: '{name} is back in your stories.',
      chapter:
        'The chapter {name} is back in {story}, after its other chapters. No scene was moved into it.',
      scene: 'The scene {name} is back in {story}.',
      arc: 'The arc {name} is back in {story}.',
      worldRule: 'The world rule {name} is back in World Rules.',
      relationship: 'The relationship {name} is back on both of its entries.',
      timelineEvent: 'The moment {name} is back on the timeline.',
    },
    erasing: {
      entry:
        'Its article, fields, picture and saved versions go with it, and links and references to it in your lore, timeline, stories and ideas are removed.',
      story:
        'Everything in it goes with it: its chapters, its scenes with their writing, saved versions and beats, and its arcs, including any of them that are in the Trash on their own.',
      chapter:
        'Only the chapter goes: its title, summary and notes. The scenes it held moved to Unchaptered when it was put in the Trash, and they stay there.',
      scene:
        'Its writing, every saved version of it and its beats go with it, and its links to lore and ideas are removed.',
      arc: 'Only the arc goes. The chapters that were in it stay where they are, in no arc.',
      worldRule: 'Its check goes with it, if it has one.',
      relationship: 'Only the relationship goes. The two entries it connects stay as they are.',
      timelineEvent:
        'Its participants, story links and details go with it. The entries and stories it named stay as they are.',
    },
    outcome: {
      restoredPrivately: 'It was restored privately: only the owner can publish it again.',
      nowPrivate: 'It is private now.',
      privateFailed: 'It could not be made private: open it and choose Make private.',
      open: 'Open {name}',
      restoreFailed: '{name} could not be restored.',
      gone: '{name} is no longer in the Trash, so nothing was deleted.',
      deleteFailed: '{name} could not be deleted just now. Try again.',
      deleted: '{name} was permanently deleted.',
      bulkDeleted: {
        one: '{n} item was permanently deleted.',
        other: '{n} items were permanently deleted.',
      },
      bulkChanged:
        'The Trash changed before these items could be deleted, so nothing was deleted. Select them again.',
      bulkFailed:
        'Nothing was deleted. The selected items could not be deleted just now. Try again.',
    },
    row: {
      meta: '· {where} · removed {date}',
      selectLabel: 'Select {kind} “{name}”',
      restoreLabel: 'Restore {kind} “{name}”',
      eraseLabel: 'Delete permanently: {kind} “{name}”',
      restore: 'Restore',
      restoring: 'Restoring…',
      erase: 'Delete permanently…',
    },
    empty: {
      title: 'The Trash is empty.',
      hint: 'Anything you remove from your lore, your stories or your world rules waits here.',
    },
    pager: {
      label: 'Pagination',
      previous: 'Previous',
      position: 'Page {page} of {total}',
      next: 'Next',
    },
    bar: {
      hint: 'Select rows on this page to delete them permanently.',
      selected: '{n} selected',
      delete: 'Delete permanently ({n})',
      deleteNone: 'Delete permanently',
      selectPage: 'Select page',
      clear: 'Clear selection',
      done: 'Done',
    },
    publish: {
      titleVisible: 'Restoring {name} makes it public again.',
      titleHidden: '{name} is still selected for publication.',
      textVisibleEntry:
        'This entry was public before it was moved to the Trash. Restoring it will make it visible again in your public universe, to anyone, straight away.',
      textVisibleStory:
        'This story was public before it was moved to the Trash. Restoring it will make it visible again in your public universe, to anyone, straight away.',
      textHidden:
        'It was selected for publication before it was moved to the Trash. Readers cannot see it now, and restoring it does not change that: it would appear once this universe is public.',
      textHiddenStory:
        'It was selected for publication before it was moved to the Trash. Readers cannot see it now, and restoring it does not change that: it would appear once this universe is public and the story has a public summary.',
      restoreVisible: 'Restore and publish',
      restoreHidden: 'Restore, keep selected',
      restorePrivate: 'Restore as private',
      cancel: 'Cancel',
    },
    erase: {
      title: 'Permanently delete the {kind} {name}?',
      cannotUndo: 'This cannot be undone.',
      deleting: 'Deleting…',
      delete: 'Delete permanently',
      cancel: 'Cancel',
    },
    bulk: {
      title: {
        one: 'Permanently delete {n} selected item?',
        other: 'Permanently delete {n} selected items?',
      },
      listLabel: 'Selected',
      each: 'Each {kind}:',
      cannotUndo: 'This cannot be undone.',
      deleting: 'Deleting…',
      delete: 'Delete permanently',
      cancel: 'Cancel',
    },
  },
}

export default data
