/** Sign in, sign up, password reset, invitations (#101). */
const auth = {
  layout: {
    pitch:
      'A workroom for the worlds you keep: their people, places, history and the rules that hold them together.',
  },
  routes: {
    checkingSession: 'Checking your session',
    retry: 'Try again',
  },
  login: {
    heading: 'Sign in',
    intro: 'Pick up where your world left off.',
    unavailable: 'Sign-in is unavailable right now.',
    noAccount: 'No account yet? {link}',
    createAccount: 'Create account',
    usernameOrEmail: 'Username or email',
    password: 'Password',
    forgot: 'Forgot your password?',
    submit: 'Sign in',
    submitting: 'Signing in',
  },
  register: {
    heading: 'Create account',
    intro: 'Claim a name, and the workroom is yours.',
    passwordsMatch: 'Both passwords need to match.',
    unavailable: 'Registration is unavailable right now.',
    haveAccount: 'Already have an account? {link}',
    signIn: 'Sign in',
    inviteOnly:
      'LorEvolve is invitation-only for now. Open the invitation link you were sent to create your account.',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    submit: 'Create account',
    submitting: 'Creating account',
  },
  forgot: {
    heading: 'Forgot your password?',
    intro: "Enter your account's email address and we'll send you a link to choose a new one.",
    back: 'Back to sign in',
    failed: 'The link cannot be sent right now.',
    sent: 'If {email} has a LorEvolve account, a link is on its way. It works once, for 1 hour. Nothing arrived? Check your spam folder, or write to support@lorevolve.com.',
    email: 'Email',
    submit: 'Send the link',
    submitting: 'Sending',
  },
  reset: {
    heading: 'Choose a new password',
    intro: 'Your new password signs you out everywhere else.',
    back: 'Back to sign in',
    passwordsMatch: 'Both passwords need to match.',
    failed: 'The password cannot be changed right now.',
    done: 'Your password is changed. {link} with the new one.',
    doneSignIn: 'Sign in',
    linkMissing: 'This page needs the link from your email. {link}.',
    linkMissingAsk: 'Ask for a new one',
    askAgain: 'Ask again',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    submit: 'Save the new password',
    submitting: 'Saving',
  },
  invitation: {
    title: 'Invitation',
    actionFailed: 'That could not be done. Try again.',
    retryLater: 'Try again in a moment.',
    workspace: 'Go to My workspace',
    checkingSession: 'Checking your session',
    signedOut: {
      heading: "You've been invited to collaborate in LorEvolve.",
      intro: 'Sign in or create an account to continue.',
      footer: 'Use the email address the invitation was sent to. {link}',
      explore: 'Explore LorEvolve',
      signIn: 'Sign in',
      createAccount: 'Create account',
    },
    loading: {
      heading: 'Invitation',
      intro: 'Opening the invitation…',
      status: 'Opening the invitation',
    },
    ready: {
      intro: "You've been invited as {role}.",
      working: 'Working',
      accept: 'Accept invitation',
      decline: 'Decline',
    },
    declined: {
      heading: 'Invitation declined.',
      intro: 'Nothing was shared with you, and the invitation is gone.',
    },
    otherAccount: {
      heading: 'This invitation is for a different account.',
      intro: 'Sign in with the account it was sent to, or ask the person who invited you.',
    },
    expired: {
      heading: 'This invitation has expired.',
      intro: 'Ask the person who invited you for a new one.',
    },
    gone: {
      heading: 'This invitation is no longer available.',
      intro: 'It may have been withdrawn, or already answered.',
    },
    error: {
      heading: 'This invitation could not be opened.',
    },
  },
}

export default auth
