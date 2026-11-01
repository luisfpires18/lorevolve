// The page's two behaviours: the feature index (one feature read at a time) and the anonymous survey
// dialog, sent to /api/survey. Turnstile is loaded the first time the dialog opens, so the page itself talks to nobody
// but its own host. The questions mirror lib/survey.js, which is what the server accepts.

// -- The feature index --

// With JavaScript the list sits beside one feature at a time (above it, as a scrolling row, on a phone). Without it,
// every feature shows in turn.
const index = document.querySelector('.index')
const pages = [...index.querySelectorAll('.index__page')]
const nav = index.querySelector('.index__nav')
const links = [...nav.querySelectorAll('a')]

function showFeature(id) {
  const page = pages.find((candidate) => candidate.id === id) ?? pages[0]
  for (const candidate of pages) candidate.classList.toggle('is-current', candidate === page)
  for (const link of links) {
    if (link.hash === `#${page.id}`) {
      link.setAttribute('aria-current', 'true')
      // On a phone the row scrolls the choice into the middle; never the page itself.
      nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2
    } else link.removeAttribute('aria-current')
  }
}

function choose(link) {
  // A choice swaps the feature in place instead of jumping down the page.
  history.replaceState(null, '', link.hash)
  showFeature(link.hash.slice(1))
  // On a phone, reading far into one feature and choosing the next starts the next at its top.
  if (!wide.matches && index.getBoundingClientRect().top < 0) index.scrollIntoView()
}

const wide = matchMedia('(min-width: 56rem)')
index.classList.add('is-indexed')
showFeature(location.hash.slice(1))

for (const link of links) {
  link.addEventListener('click', (event) => {
    event.preventDefault()
    choose(link)
  })
}

// The arrow keys move through the list, the way a list of choices usually works.
const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
nav.addEventListener('keydown', (event) => {
  const at = links.indexOf(document.activeElement)
  if (at < 0 || !STEP[event.key]) return
  event.preventDefault()
  const next = links[Math.min(links.length - 1, Math.max(0, at + STEP[event.key]))]
  next.focus()
  choose(next)
})

// -- The survey questions --

const dialog = document.getElementById('survey')
const form = document.getElementById('survey-form')
const stepLabel = document.getElementById('survey-step')

let turnstileReady = null
let widgetId = null

// The page's feature list, by group and in the same order. lib/survey.js holds the same keys.
const FEATURE_GROUPS = [
  [
    'A universe',
    [
      ['lore', 'Lore entries: pictures, articles, aliases, tags'],
      ['massCreate', 'Mass create and quick create'],
      ['types', 'Your own types, fields and groups'],
      ['canonStatus', 'Idea, Draft, Canon status'],
      ['history', 'Version history and Trash'],
      ['privateNotes', 'Private notes'],
      ['relations', 'Relations and when they hold'],
      ['familyTree', 'Family trees'],
      ['progression', 'Progression: stages, forms, abilities, looks'],
      ['knowledge', 'Character knowledge'],
      ['maps', 'Maps, pins and distances'],
      ['worldRules', 'World rules and their checks'],
      ['canonIntegrity', 'Canon checks'],
      ['calendar', 'Your own calendar'],
      ['stories', 'Stories, chapters, scenes and manuscript'],
      ['plot', 'Plot arcs and beats'],
      ['timeline', 'Timeline'],
      ['review', 'Comments and suggestions'],
    ],
  ],
  [
    'Your workspace',
    [
      ['ideas', 'Ideas and idea boards'],
      ['collaboration', 'Collaboration'],
      ['assistant', 'AI assistant'],
      ['mcp', 'Connecting Claude or ChatGPT (MCP)'],
      ['backup', 'Backup and export'],
      ['search', 'Search'],
      ['installApp', 'Installing it as an app'],
    ],
  ],
  [
    'Public portal',
    [
      ['publishing', 'Publishing'],
      ['explore', 'Explore and author pages'],
    ],
  ],
]

const one = (name, label, options) => ({ kind: 'one', name, label, options })
const free = (name, label, max = 2000, hint = '') => ({ kind: 'text', name, label, max, hint })

const QUESTIONS = {
  interests: [
    free('useCase', 'What would you use LorEvolve for?', 1000, "A world you're building, a book, a game, anything. Leave out names and contact details."),
    { kind: 'pick', name: 'interests', label: 'Which features interest you most?', hint: 'Pick as many as you like.' },
    free('wished', "Which features would you like that LorEvolve doesn't have?"),
  ],
  use: [
    one('publish', 'Would you publish your universe for others to read?', [
      ['all', 'Yes, all of it'],
      ['parts', 'Yes, parts of it'],
      ['no', 'No, it stays private'],
    ]),
    one('browse', "Would you browse other authors' published universes?", [
      ['often', 'Often'],
      ['sometimes', 'Sometimes'],
      ['no', 'No'],
    ]),
    one('votes', 'Votes on published universes?', [
      ['updown', 'Upvotes and downvotes'],
      ['up', 'Upvotes only'],
      ['none', 'No votes'],
    ]),
    one('brainstorm', 'How do you brainstorm?', [
      ['text', 'Writing text'],
      ['board', 'Cards on a board'],
      ['both', 'Both'],
      ['none', "I don't"],
    ]),
    one('ideasLive', 'Where should ideas live?', [
      ['universe', 'Inside a universe'],
      ['loose', 'Loose, before they belong to one'],
      ['both', 'Both'],
    ]),
    one('invite', 'Would you invite others into a universe?', [
      ['cowriters', 'Yes, as co-writers'],
      ['reviewers', 'Yes, as reviewers or readers'],
      ['no', 'No'],
    ]),
    one('ai', 'Would you use an AI assistant in your universe?', [
      ['never', 'Never'],
      ['search', 'Only to search my lore and answer questions'],
      ['propose', 'Also to propose changes I approve'],
    ]),
    one('mcpKnew', 'Did you know what an MCP connection is before this?', [
      ['yes', 'Yes'],
      ['no', 'No'],
    ]),
    one('mcpConnect', 'Would you connect Claude or ChatGPT to your universe?', [
      ['yes', 'Yes'],
      ['maybe', 'Maybe'],
      ['no', 'No'],
    ]),
    one('appKind', 'Would you rather use LorEvolve in a browser or as a desktop app?', [
      ['web', 'In a browser'],
      ['desktop', 'As a desktop app'],
      ['both', 'Both'],
    ]),
    one('storage', 'Where should your worlds be stored?', [
      ['cloud', 'Online, reachable from any device'],
      ['local', 'On my own computer'],
      ['both', 'Both'],
    ]),
    {
      kind: 'one',
      name: 'payPreference',
      label: 'If LorEvolve were paid, how would you prefer to pay?',
      options: [
        ['subscription', 'A monthly subscription'],
        ['usage', 'Only for what I use'],
        ['one-time', 'A one-time purchase'],
        ['other', 'Something else'],
      ],
      other: { name: 'payOther', label: 'How else would you prefer to pay?' },
    },
    { kind: 'price', name: 'priceTooCheap', label: "At what monthly price would it feel so cheap you'd doubt it?" },
    { kind: 'price', name: 'priceTooExpensive', label: 'At what monthly price would it be too expensive to consider?' },
  ],
}

const radios = (name, options) =>
  options.map(([value, label]) => `<label class="choice"><input type="radio" name="${name}" value="${value}" /> ${label}</label>`).join('')

function render(question) {
  switch (question.kind) {
    case 'one': {
      // A choice with "Something else" carries its own text box, shown only while that choice is made.
      const other = question.other
        ? `<input class="choice__other" name="${question.other.name}" type="text" maxlength="200" aria-label="${question.other.label}" hidden />`
        : ''
      return `<fieldset class="field"><legend class="field__label">${question.label}</legend>${radios(question.name, question.options)}${other}</fieldset>`
    }
    case 'text': {
      const hint = question.hint ? `<span class="field__hint">${question.hint}</span>` : ''
      return `<label class="field"><span class="field__label">${question.label}</span>${hint}<textarea name="${question.name}" rows="3" maxlength="${question.max}"></textarea></label>`
    }
    case 'pick':
      return `<fieldset class="field"><legend class="field__label">${question.label}</legend><p class="field__hint">${question.hint}</p>${FEATURE_GROUPS.map(([group, items]) => `<p class="field__group">${group}</p>${items.map(([key, label]) => `<label class="choice"><input type="checkbox" name="${question.name}" value="${key}" /> ${label}</label>`).join('')}`).join('')}</fieldset>`
    case 'price':
      return `<label class="field"><span class="field__label">${question.label}</span><span class="field__hint">In euros, per month.</span><span class="money"><span aria-hidden="true">€</span><input name="${question.name}" type="number" inputmode="decimal" min="0" max="10000" step="0.01" /></span></label>`
  }
}

for (const container of form.querySelectorAll('[data-questions]')) {
  container.innerHTML = QUESTIONS[container.dataset.questions].map(render).join('')
}

function answers() {
  const result = {}
  const value = (name) => form.querySelector(`[name="${name}"]:is(textarea, input:not([type="radio"])), [name="${name}"]:checked`)?.value ?? ''
  for (const question of Object.values(QUESTIONS).flat()) {
    if (question.kind === 'pick') {
      result[question.name] = [...form.querySelectorAll(`[name="${question.name}"]:checked`)].map((box) => box.value)
    } else {
      result[question.name] = value(question.name)
      if (question.other) result[question.other.name] = value(question.other.name)
    }
  }
  return result
}

// -- Pages --

const STEPS = { interests: 'Part 1 of 2', use: 'Part 2 of 2' }

function showPage(page) {
  for (const section of form.querySelectorAll('[data-page]')) section.hidden = section.dataset.page !== page
  stepLabel.textContent = STEPS[page] ?? ''
  const target = form.querySelector(`[data-page="${page}"]`)
  const first = target.querySelector('h2.apply__title') ?? target.querySelector('input, textarea')
  dialog.scrollTop = 0
  first?.focus({ preventScroll: true })
}

function currentPage() {
  return form.querySelector('[data-page]:not([hidden])')?.dataset.page ?? 'interests'
}

function showError(message) {
  for (const box of form.querySelectorAll('[data-error]')) {
    box.textContent = message
    box.hidden = !message || box.closest('[data-page]').hidden
  }
}

function loadTurnstile() {
  turnstileReady ??= Promise.all([
    fetch('/api/config').then((response) => response.json()),
    new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = resolve
      script.onerror = reject
      document.head.append(script)
    }),
  ]).then(([config]) => config.turnstileSiteKey)
  // A failed load is retried on the next open rather than remembered.
  turnstileReady.catch(() => {
    turnstileReady = null
  })
  return turnstileReady
}

async function renderTurnstile() {
  if (widgetId !== null) return
  try {
    const siteKey = await loadTurnstile()
    if (!siteKey) throw new Error('No site key')
    if (widgetId === null) {
      widgetId = window.turnstile.render('#turnstile', { sitekey: siteKey, theme: 'auto', size: 'flexible' })
    }
  } catch {
    showError("The spam check couldn't load. Check your connection, then close this and try again.")
  }
}

function openDialog() {
  showError('')
  if (!dialog.open) dialog.showModal()
  showPage(currentPage())
  renderTurnstile()
}

// -- Sending --

const MESSAGES = {
  verification: "The spam check didn't go through. Please try it again.",
  too_long: 'One of the answers is too long. Please shorten it.',
}

async function send(event) {
  event.preventDefault()
  showError('')
  const turnstileToken = widgetId === null ? null : window.turnstile.getResponse(widgetId)
  if (!turnstileToken) {
    showError('Please wait a moment for the spam check to finish, then press Send answers again.')
    return
  }

  const button = form.querySelector('[data-send]')
  const label = button.textContent
  button.disabled = true
  button.textContent = 'Sending…'
  try {
    const response = await fetch('/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: answers(), turnstileToken }),
    })
    const reply = await response.json().catch(() => ({}))
    if (response.ok) showPage('thanks')
    else showError(MESSAGES[reply.error] ?? "Something went wrong and your answers weren't saved. Please try again in a moment.")
  } catch {
    showError("Your answers couldn't be sent. Check your connection and try again; nothing you typed is lost.")
  } finally {
    button.disabled = false
    button.textContent = label
    // A Turnstile token is good for one check; the next send needs a fresh one.
    if (widgetId !== null) window.turnstile.reset(widgetId)
  }
}

// -- Wiring --

dialog.addEventListener('close', () => {
  // Once the answers are sent, the next open starts a fresh survey. A half-filled one is kept for when it opens again.
  if (currentPage() === 'thanks') {
    form.reset()
    for (const box of form.querySelectorAll('.choice__other')) box.hidden = true
    showPage('interests')
  }
})

// A click on the backdrop (the dialog element itself, outside the form) closes it.
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

for (const button of document.querySelectorAll('[data-open-survey]')) button.addEventListener('click', openDialog)
for (const button of dialog.querySelectorAll('[data-close-survey]')) button.addEventListener('click', () => dialog.close())
for (const button of dialog.querySelectorAll('[data-goto]')) {
  button.addEventListener('click', () => {
    showError('')
    showPage(button.dataset.goto)
  })
}
form.addEventListener('submit', send)

// "Something else" shows its text box; any other choice hides it again.
form.addEventListener('change', (event) => {
  const other = event.target.closest('fieldset')?.querySelector('.choice__other')
  if (!other || event.target.type !== 'radio') return
  other.hidden = event.target.value !== 'other'
  if (!other.hidden) other.focus()
})

// The Discord invite: every Discord link on the page appears once it is set. Empty keeps them hidden.
const DISCORD_INVITE = 'https://discord.gg/VPv7X7tpY'
if (DISCORD_INVITE) {
  for (const element of document.querySelectorAll('[data-discord]')) {
    element.hidden = false
    if (element instanceof HTMLAnchorElement) {
      element.href = DISCORD_INVITE
      element.target = '_blank'
      element.rel = 'noopener'
    }
  }
}
