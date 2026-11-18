import adminMain from './admin/main'
import adminUser from './admin/user'
import adminRestore from './admin/restore'

/** LorEvolve Admin: accounts, invitations, backups and the deploy log (#105). */
const admin = {
  loadFailed: 'Could not load this.',
  tryAgain: 'Try again',
  documentTitle: {
    admin: 'Admin',
    main: 'Main',
    users: 'Users',
    tracing: 'Tracing',
    feedback: 'Feedback',
  },
  nav: {
    label: 'LorEvolve Admin',
    context: 'LorEvolve Admin',
    main: 'Main',
    users: 'Users',
    feedback: 'Feedback',
    tracing: 'Tracing',
    myWorkspace: 'My workspace',
  },
  untracked: {
    value: 'Not tracked yet',
    heading: 'Not tracked yet',
    note: 'LorEvolve does not record these, so nothing is shown in their place.',
    newAccounts: {
      label: 'New accounts over time',
      source: "Each account's creation date is recorded from now on, not counted here yet.",
    },
    active: {
      label: 'Active users',
      source: "Each account's last sign-in is recorded from now on, not counted here yet.",
    },
    requests: {
      label: 'Requests and errors',
      source: 'No request telemetry is kept.',
    },
    ai: {
      label: 'AI usage and cost',
      source:
        'Nothing is counted here: AI reaches a universe over MCP, and a proposal costs this host nothing.',
    },
  },
  role: {
    member: 'Member',
    admin: 'Admin',
  },
  main: adminMain,
  backups: {
    heading: 'Database backups',
    reading: 'Reading…',
    startFailed: 'The backup could not be started.',
    backingUp: 'Backing up',
    runNow: 'Run backup now',
    off: 'Off on this server. Turned on by the deployment’s settings: docs/recovery/database-backups.md.',
    lastVerified: {
      label: 'Last verified backup',
      none: 'None yet',
      stale: 'Stale: older than expected (every {hours} hours).',
      fresh: 'Uploaded and read back. Every {hours} hours.',
      freshManual: 'Uploaded and read back. Every {hours} hours, manual only.',
    },
    kept: {
      label: 'Kept',
      value: '{verified} · {size}',
      pruningOn: '{environment}, {store}. Pruning on.',
      pruningOff: '{environment}, {store}. Pruning off.',
    },
    attempt: {
      label: 'Last attempt',
      none: 'None since this server started',
      failures: '{error} ({count} in a row)',
      schedule: 'The schedule checks every 15 minutes.',
    },
    outcome: {
      running: 'Running',
      succeeded: 'Succeeded',
      failed: 'Failed',
    },
  },
  users: {
    title: 'Users',
    lede: 'Every LorEvolve account. Universe content is never shown here.',
    search: {
      label: 'Find an account',
      placeholder: 'Username or public name',
    },
    gathering: 'Gathering accounts…',
    count: {
      one: '{n} account',
      other: '{n} accounts',
    },
    blocked: 'Blocked',
    viewDetails: 'View details',
    viewDetailsFor: 'View details for {username}',
    empty: {
      noMatch: 'No account matches that.',
      none: 'No accounts yet.',
      hint: 'Try another name, or clear the search.',
    },
    pager: {
      label: 'Pagination',
      previous: 'Previous',
      next: 'Next',
      position: 'Page {page} of {total}',
    },
  },
  user: adminUser,
  history: {
    heading: 'Admin actions',
    empty: 'No admin action has been taken on this account.',
    line: '{action} by {actor} · {time}',
    removedActor: 'a removed account',
    blocked: 'Blocked',
    unblocked: 'Unblocked',
    passwordResetSent: 'Sent a password reset link',
  },
  signUp: {
    heading: 'Sign-up link',
    note: 'For someone to join LorEvolve while registration is invitation-only. The link lets that email address, and only that one, create an account. Email link sends it to them from noreply@lorevolve.com; Make link shows it for you to send yourself.',
    emailLabel: 'Their email address',
    emailFailed: 'The email could not be sent.',
    linkFailed: 'The link could not be made.',
    sending: 'Sending',
    emailLink: 'Email link',
    makeLink: 'Make link',
    sent: 'Sent to {to}. The link works until {time}.',
    link: 'Send them this link, valid until {time}: {url}',
  },
  password: {
    heading: 'Password',
    confirmTitle: 'Email {username} a password reset link?',
    confirmMessage:
      'LorEvolve sends the link to their account email address. It works once, for 1 hour, and choosing a new password signs them out everywhere.',
    confirmLabel: 'Send the link',
    busy: 'Sending…',
    noteBlocked: 'A blocked account cannot reset its password. Unblock it first.',
    note: 'For someone who cannot sign in. They can also use Forgot your password? on the sign-in page.',
    send: 'Email a reset link',
    sent: 'Sent. The link works for 1 hour.',
  },
  block: {
    access: 'Access',
    unavailable:
      'Admin accounts cannot be blocked, so no Admin can lock out themselves or the last Admin.',
    unavailableSelf:
      'This is your account. Admin accounts cannot be blocked, so no Admin can lock out themselves or the last Admin.',
    reasonRequired: 'Say why. The reason is kept in the audit record.',
    reasonLabel: 'Reason (kept in the audit record)',
    reasonDetail: 'Reason: {reason}',
    block: {
      heading: 'Block this account',
      note: 'Blocking signs them out everywhere, refuses their sign-in and disconnects their AI apps. Nothing they wrote is touched.',
      submit: 'Block account',
      confirmTitle: 'Block {username}?',
      confirmMessage:
        'They are signed out everywhere at once, cannot sign in, and every AI app they connected is disconnected. Their universes and everything in them stay as they are.',
      confirmLabel: 'Block account',
      busy: 'Blocking…',
    },
    unblock: {
      heading: 'Unblock this account',
      note: 'Unblocking lets them sign in again.',
      submit: 'Unblock account',
      confirmTitle: 'Unblock {username}?',
      confirmMessage:
        'They can sign in again. Sessions and AI apps ended by the block do not come back: they sign in and connect again themselves.',
      confirmLabel: 'Unblock account',
      busy: 'Unblocking…',
    },
  },
  tracing: {
    title: 'Tracing',
    lede: 'Request and error tracing for the service.',
    emptyTitle: 'Tracing is not available yet.',
    emptyHint:
      "Block and unblock actions are recorded, with who, why and when, on each account's details.",
  },
  feedback: {
    title: 'Feedback',
    lede: 'Bug reports and feature requests, newest first, with the page each was sent from. Times are UTC.',
    reading: 'Reading…',
    empty: 'Nothing sent yet.',
    bug: 'Bug',
    featureRequest: 'Feature request',
    removedAccount: 'A removed account',
    pager: {
      label: 'Pagination',
      newer: 'Newer',
      older: 'Older',
    },
  },
  restore: adminRestore,
}

export default admin
