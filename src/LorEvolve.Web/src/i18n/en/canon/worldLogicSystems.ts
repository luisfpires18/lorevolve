import canonWorldLogicMachine from './worldLogicMachine'

const canonWorldLogicSystems = {
  loading: 'Gathering Systems…',
  readFailed: 'The Systems could not be read.',
  noRules: 'This System references no rules yet.',
  ruleCount: { one: '{count} rule', other: '{count} rules' },
  sharedWith: { one: 'In {count} System', other: 'In {count} Systems' },
  newSystem: 'New System',
  edit: 'Edit',
  empty: {
    title: 'No Systems yet.',
    hint: 'A System is a named set of rules, such as a magic system or a line of succession. The same rule can belong to several Systems without being copied.',
  },
  editor: {
    newTitle: 'New System',
    editTitle: 'Edit System',
    lede: 'A System is a name and a summary. The rules it references are added through MCP or the API for now.',
    back: 'Back to Systems',
    name: 'Name',
    summary: 'Summary',
    create: 'Create System',
    save: 'Save changes',
    saving: 'Saving…',
    saved: 'Saved.',
    nameTaken: 'Another System already has this name.',
    invalid: 'Check the fields below.',
    saveFailed: 'The System could not be saved. Try again.',
    gone: 'This System no longer exists.',
    conflict:
      'This System was changed since you opened it. Load the saved version to keep working.',
    loadSaved: 'Load the saved version',
    tabs: {
      details: 'Details',
      machine: 'Machine',
    },
    delete: {
      open: 'Delete',
      title: 'Delete this System?',
      message: 'The System and its links are removed for good. The rules it references are kept.',
      confirm: 'Delete System',
      busy: 'Deleting…',
    },
  },
  machine: canonWorldLogicMachine,
}

export default canonWorldLogicSystems
