import canonWorldLogicSystems from './worldLogicSystems'

const canonWorldLogic = {
  title: 'World Logic',
  lede: 'The rules this universe keeps, the Systems that group them, and what checking them found. A rule is read only where you stated it explicitly; LorEvolve never reads what a rule says.',
  tabs: {
    rules: 'Rules',
    systems: 'Systems',
    integrity: 'Integrity',
  },
  kinds: {
    worldRule: 'World rule · ',
    definition: 'Rule definition · ',
  },
  hasCondition: 'Has a condition · ',
  wordsOnly: 'Words only · ',
  scopes: {
    universe: 'Whole universe · ',
    project: 'One project · ',
  },
  systems: canonWorldLogicSystems,
  integrity: {
    loading: 'Gathering findings…',
    readFailed: 'The findings could not be read.',
    check: 'Check the rules now',
    checking: 'Checking…',
    checkFailed: 'The check could not be run. Try again.',
    checked: 'Checked {time}',
    truncated:
      'This check found more than one run records, so nothing was closed. Deal with what is here and check again.',
    outcomes: {
      violation: 'Contradiction',
      unknown: 'Could not be answered',
      error: 'The rule is broken',
    },
    outcomeHints: {
      violation: 'The lore contradicts this rule.',
      unknown:
        'The stored facts cannot answer this rule, so nothing is proved either way. This is not a pass.',
      error: 'The rule itself could not be evaluated, so it checked nothing.',
    },
    statuses: {
      open: 'Open',
      reviewing: 'Reviewing',
      resolved: 'Resolved',
      dismissed: 'Dismissed',
    },
    errorCode: 'Code {code}',
    ruleVersion: 'Rule version {version}',
    evidenceCount: { one: '{count} record', other: '{count} records' },
    found: 'Found {time}',
    loadingOne: 'Gathering this finding…',
    readOneFailed: 'This finding could not be read.',
    evidence: 'What it rests on',
    noEvidence: 'This finding rests on no stored record.',
    rationale: 'What the check concluded, in its own words',
    history: 'History',
    byCheck: 'By the check itself',
    actions: {
      detected: 'Found',
      reopened: 'Found again',
      reviewed: 'Taken up',
      dismissed: 'Dismissed',
      resolved: 'Marked fixed',
      closed: 'No longer found',
    },
    dismiss: 'Dismiss',
    undismiss: 'Take it up again',
    resolve: 'Mark fixed',
    machine: {
      title: '{system}, {state}',
      undeclaredTitle: '{system}, a value with no state',
      hints: {
        undeclaredState: 'This entry holds a value that no state of the machine declares.',
        noTransitionHolds: 'No transition into this state holds for this entry.',
      },
      entry: 'Entry {name}',
      systemVersion: 'System version {version}',
    },
    deciding: 'Saving…',
    decideFailed: 'That could not be saved. Try again.',
    empty: {
      title: 'No findings are recorded.',
      hint: 'That can mean no check has run yet, or that the last one found nothing. Run the check to see which.',
    },
    passed: {
      title: 'Every rule that could be answered passed.',
      hint: 'The check ran and found no contradiction, no rule it could not answer and no broken rule.',
    },
    canonLink: 'Open Canon findings',
  },
}

export default canonWorldLogic
