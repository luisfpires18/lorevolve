const universeConnect = {
  title: 'Connect an AI app',
  heading: 'Connect an AI app',
  connecting: 'Connecting…',
  approve: 'Approve',
  deny: 'Deny',
  goBack: 'Go back to the app',
  noAccount: 'You don’t have access to the universe this app asked for.',
  noAccountNote: 'Nothing was connected. Going back tells the app it wasn’t approved.',
  introReadOnly: 'read-only',
  intro:
    'This app wants {readOnly} access to one of your universes: its lore entries, relationships, stories, scene manuscripts and timeline. What it reads goes to the AI service behind it. Check who is asking before you approve.',
  introProposals:
    'This app wants {readOnly} access to one of your universes: its lore entries, relationships, stories, scene manuscripts and timeline. What it reads goes to the AI service behind it. Check who is asking before you approve. It also asks to propose changes for you to review, which you can allow below.',
  signedIn: 'Signed in as {name}. {link}',
  connectedApps: 'See connected apps',
  checking: 'Checking this request…',
  invalid: 'This connection request isn’t valid, so nothing was connected.',
  invalidNote: 'Start again from your AI app.',
  checkFailed: 'LorEvolve couldn’t check this request. Reload the page to try again.',
  appSection: 'The app',
  appLabel: 'App',
  verified:
    'Its details are published by {host}, and LorEvolve fetched them from there. The name is the one that site gives.',
  unverified:
    'LorEvolve can’t confirm who made this app. It registered itself, and it chose its own name. Approve only if you just added LorEvolve to an app you trust.',
  returnTo: 'After you decide, your browser goes back to {host}.',
  loopback:
    'This app runs on your own device. Any program on this computer could use that address, so approve only if you started this from an app on this computer.',
  universeSection: 'The universe',
  universeLabel: 'Universe',
  youAre: {
    owner: 'You’re the owner here. The app gets your access to this universe and no other.',
    editor: 'You’re an Editor here. The app gets your access to this universe and no other.',
    reviewer: 'You’re a Reviewer here. The app gets your access to this universe and no other.',
    viewer: 'You’re a Viewer here. The app gets your access to this universe and no other.',
  },
  canDoSection: 'What it can do',
  readOnlyAccess: 'Read-only access to',
  cannotWrite: 'It can’t create, edit or delete anything.',
  notesSection: 'Before you approve',
  noteService:
    'What the app reads goes to the AI service behind it, which handles it under its own terms. Long manuscripts can take up a lot of the app’s context, so it reads them a section at a time.',
  noteStays:
    'The app stays connected until you disconnect it in Profile, Connected apps, or until you no longer have access to this universe.',
  levelSection: 'Access level',
  proposeUnavailable:
    'The app also asked to propose changes. Your role here only reads, so it gets Reader access.',
  level: 'Access level',
  levelReaderName: 'Reader',
  levelReader: '{level}: {app} only reads this universe',
  levelCreatorName: 'Creator',
  levelCreator: '{level}: it also proposes new and changed content for you to review',
  creatorCan:
    'A Creator can send lore entries, articles, relationships, stories, scenes, prose, plot, timeline moments, world rules and, if you own this universe, your ideas to Pending AI Changes in LorEvolve, as you. Removals only go to the Trash, and a field is only ever archived. Nothing changes until you, or the universe’s owner or an Editor, approves it there. You can make it a Reader again in Connected apps.',
  creatorCanSchema:
    'A Creator can send lore entries, articles, relationships, stories, scenes, prose, plot, timeline moments, world rules, lore types, fields and groups and, if you own this universe, your ideas to Pending AI Changes in LorEvolve, as you. Removals only go to the Trash, and a field is only ever archived. Nothing changes until you, or the universe’s owner or an Editor, approves it there. You can make it a Reader again in Connected apps.',
}

export default universeConnect
