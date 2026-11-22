/** App shell: routes and error screens, workspace bar, skip link, brand, shared dialogs and menus, API fallback errors (#101). */
const shell = {
  app: {
    loadFailed: 'Could not load this.',
    tryAgain: 'Try again',
    screenPending: 'Loading this screen',
    sectionPending: 'Opening…',
    crashed: {
      stale: 'LorEvolve was updated while this page was open. Reload to continue.',
      generic: 'Something went wrong on this page. Reload to try again.',
      reload: 'Reload',
    },
  },
  crumb: {
    label: 'Breadcrumb',
  },
  fields: {
    required: '(required)',
  },
  pager: {
    label: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    position: 'Page {page} of {total}',
  },
  showMore: {
    label: 'Show more',
    loading: 'Loading…',
    error: 'More could not be loaded.',
    shown: 'Showing {shown} of {total}',
  },
  workspace: {
    screen: {
      ideas: 'Ideas',
      projects: 'Projects',
      profile: 'Profile',
      aiChanges: 'Pending AI Changes',
      universes: 'Universes',
    },
    navLabel: 'My workspace',
    context: 'My workspace',
    universes: 'Universes',
    ideas: 'Ideas',
    projects: 'Projects',
    explore: 'Explore',
  },
  brand: {
    homeLabel: 'LorEvolve, home',
  },
  skipLink: {
    label: 'Skip to main content',
  },
  roleGate: {
    title: 'This part of the universe is not available to you.',
    hint: 'Your role in this shared universe does not include it. {back}',
    back: 'Back to the overview',
  },
  actions: {
    cancel: 'Cancel',
    close: 'Close',
    done: 'Done',
    discard: 'Discard changes',
    save: 'Save',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    moveUpNamed: 'Move {name} up',
    moveDownNamed: 'Move {name} down',
    moveEarlierNamed: 'Move {name} earlier',
    moveLaterNamed: 'Move {name} later',
    earlier: 'Earlier',
    later: 'Later',
    view: 'View',
    hide: 'Hide',
  },
  zoom: {
    label: 'Zoom',
    in: 'Zoom in',
    out: 'Zoom out',
  },
  confirm: {
    removePicture: {
      title: 'Remove this picture?',
      message: 'It is deleted for good. You can add another one at any time.',
      confirm: 'Remove picture',
    },
    cancel: 'Cancel',
    failed: 'That could not be done. Try again.',
    discard: {
      title: 'Close without saving your changes?',
      message: 'They will be lost.',
      confirm: 'Discard changes',
      cancel: 'Keep editing',
    },
    leave: {
      confirm: 'Leave without saving',
      cancel: 'Stay',
    },
  },
  api: {
    fallbackError: 'Something went wrong. Try again.',
    networkFailure: 'LorEvolve could not be reached. Check your connection and try again.',
  },
}

export default shell
