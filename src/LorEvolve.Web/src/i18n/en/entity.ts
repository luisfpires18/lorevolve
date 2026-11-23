import entityHistory from './entity/history'
import entityArticle from './entity/article'
import entityPage from './entity/page'

/** An entry: its page, article, history, cards, pictures, saving and recovery (#102). */
const entity = {
  wip: {
    title: 'Work in progress: not yet working properly',
    label: 'WIP',
  },
  fact: {
    yes: 'Yes',
    no: 'No',
    inTrash: '{name} (in Trash)',
  },
  history: entityHistory,
  card: {
    select: 'Select {name}',
    also: 'also {names}',
    inArticle: 'In the article',
  },
  save: {
    status: {
      saving: 'Saving…',
      unsaved: 'Unsaved changes',
      saved: 'Saved',
    },
    button: {
      saving: 'Saving…',
      saved: 'Saved',
    },
  },
  conflict: {
    replaceConfirm: {
      title: 'Replace your unsaved changes with the latest version?',
      message: 'Your changes will be lost.',
      confirm: 'Use the latest version',
      cancel: 'Keep my changes',
    },
    suggestion: {
      title: 'This {what} changed while you were writing your suggestion.',
      text: 'Your suggestion is still here and hasn’t been sent. Look at the latest version first, then decide what to keep.',
    },
    edit: {
      title: 'This {what} changed while you were editing.',
      text: 'Your changes are still here and haven’t been saved. LorEvolve won’t save over the newer version. Look at it first, then decide what to keep.',
    },
    review: 'Review the latest version',
    failed: 'LorEvolve couldn’t open the latest version. Try again.',
    loading: 'Opening the latest version…',
    missing:
      'This {what} isn’t here anymore. Someone may have moved it to the Trash. Your changes are still on screen, so copy them before you leave.',
    latestHeading: 'Latest saved version',
    keepMine: 'Keep my changes',
    useLatest: 'Use the latest version',
    hint: {
      suggestion: 'Your suggestion stays here, unsent. Send it again when you’re ready.',
      edit: 'Your changes stay where they are, unsaved. Save again when you’re ready.',
    },
    sides: {
      latest: 'Saved now',
      mine: 'Yours',
    },
    matches: 'The latest version matches your changes.',
    latestTextHint: 'Your version is still in the editor.',
  },
  recovered: {
    confirm: {
      title: 'Discard the recovered draft of {what}?',
      message: 'The changes in it were never saved, and cannot be brought back.',
      confirm: 'Discard draft',
    },
    title: 'Recovered draft',
    kept: 'This device kept a copy of changes to {what} that were never saved, from {time}.',
    savedAgain:
      'It has been saved again since that copy was made, most recently {time}, so the copy may be older than the saved text.',
    savedChanged:
      'The saved text has changed since that copy was made, so the copy may be out of date.',
    hint: 'Recovering puts the copy in the editor as unsaved changes. Nothing is saved until you save.',
    recover: 'Recover draft',
    discard: 'Discard draft',
    hide: 'Hide the draft',
    show: 'Show the draft',
  },
  privateNote: {
    what: 'note',
    discardGuard: 'This note has unsaved changes. Close without saving them?',
    gone: 'This entry is no longer here, so its note could not be saved. It may have been moved to the Trash in another window. Your text is still here: copy it before you close this.',
    saveFailed: 'The note could not be saved. Your text is still here. Try again.',
    privacy:
      'Only you, the owner of this universe, can read this. It is never published, searched, shown to collaborators, or read by a connected app.',
    opening: 'Opening the note…',
    openFailed: 'This note could not be opened.',
    retry: 'Try again',
    latestLabel: 'Latest saved note',
    latestBlank: 'No text in the latest version.',
    field: 'Note',
    tooLong: 'Too long to save: {used} of {max} characters.',
    save: 'Save',
    nothingSaved: 'Nothing saved yet',
    savedAt: 'Saved {when}',
    triggerTitle: 'Private note',
    triggerLabel: 'Private note',
    eyebrow: 'Private note',
  },
  image: {
    tooBig: 'Images must be {mb} MB or smaller.',
    removeFailed: 'That image could not be removed.',
    heading: 'Picture',
    replace: 'Replace',
    add: 'Add image',
    editThumbnail: 'Edit thumbnail',
    removing: 'Removing…',
    remove: 'Remove',
    hint: {
      pending: 'Added when this entry is created.',
      rules: 'One picture. JPEG, PNG or WebP, up to 8 MB.',
    },
    crop: {
      editTitle: 'Edit thumbnail',
      frameTitle: 'Frame the thumbnail',
      saveThumbnail: 'Save',
      upload: 'Upload',
      usePicture: 'Use this picture',
    },
  },
  fieldImage: {
    saveTypeFirst: 'Save the new entry type before adding or changing pictures.',
    reframe: 'Edit crop',
    uploadFailed: 'A picture for "{name}" could not be saved.',
    crop: {
      editTitle: 'Edit crop',
      frameTitle: 'Crop the picture',
      saveCrop: 'Save',
    },
  },
  picker: {
    change: 'Change',
    looking: 'Looking…',
    none: 'Nothing here by that name.',
    create: 'Create “{name}”',
    newEntry: 'New entry',
    created: '{name} was created. {hint} {link}',
    openFull: 'Open full entry',
  },
  multiPicker: {
    remove: 'Remove {name}',
    looking: 'Looking…',
    none: 'Nothing here by that name.',
  },
  article: entityArticle,
  articleHistory: {
    restored: 'Restored version {number}',
    restoredEarlier: 'Restored an earlier version',
    cleared: 'Cleared the article',
    first: 'First version',
    saved: 'Saved',
    openFailed: 'That version could not be opened.',
    confirm: {
      title: 'Put version {number} of the article back?',
      message: 'It becomes the newest version, and nothing in the history is lost.',
      confirm: 'Put this version back',
    },
    stale:
      'The article was saved somewhere else after this page opened, so nothing was put back. The article above is now the latest.',
    entryGone: 'This entry is no longer here, so nothing was put back.',
    restoreFailed: 'That version could not be put back.',
    toggle: 'Article history',
    readFailed: 'The article’s history could not be read.',
    opening: 'Opening…',
    none: 'No saved versions yet.',
    nowShowing: 'now showing',
    version: 'Version {number}',
    restoring: 'Restoring…',
    restore: 'Restore',
    snapshotOpening: 'Opening…',
    snapshotBlank: 'No text in this version.',
  },
  page: entityPage,
  copy: {
    unavailable: 'The entry to copy from couldn’t be opened. This is a blank new entry.',
    title: 'Copying from {name}',
    intro:
      'Its type, summary, tags and fields are in the form below. Change anything before you create the entry.',
    also: 'Also copy',
    aliases: 'Other names: {names}',
    references: 'Links to other entries: {names}',
    referencesSameType: 'Links to other entries: {names} (only within the same type)',
    referenceItem: '{field}: {entry}',
    anotherEntry: 'Another entry',
    article: 'Article',
    noLinks: 'The article has no links.',
    linksCopied: {
      one: 'The article is copied with its link, as written:',
      other: 'The article is copied with its {n} links, as written:',
    },
    inside: '{href} (inside LorEvolve)',
    skipped:
      'Not copied: its picture, relationships, story and scene links, eras, forms and appearances, comments, history and publication. The copy starts as an Idea and stays private.',
  },
  sections: {
    fields: {
      one: '{n} field',
      other: '{n} fields',
    },
    required: '{n} required',
    attention: {
      one: '{n} needs attention',
      other: '{n} need attention',
    },
  },
}

export default entity
