/** App shell: routes and error screens, workspace bar, skip link, brand, shared dialogs and menus, API fallback errors (#101). */
const shell = {
  app: {
    screenPending: 'Loading this screen',
    sectionPending: 'Opening…',
    crashed: {
      stale: 'LorEvolve was updated while this page was open. Reload to continue.',
      generic: 'Something went wrong on this page. Reload to try again.',
      reload: 'Reload',
    },
  },
  workspace: {
    screen: {
      ideas: 'Ideas',
      profile: 'Profile',
      aiChanges: 'Pending AI Changes',
      universes: 'Universes',
    },
    navLabel: 'My workspace',
    context: 'My workspace',
    universes: 'Universes',
    ideas: 'Ideas',
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
  confirm: {
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
