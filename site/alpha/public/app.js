// The dialog. Apply: one page, sent to /api/apply. After it, optional questions sent to /api/survey with the token the
// application returned. The end-of-alpha survey opens the same dialog from a personal link, /?survey=<token>.
// Turnstile is loaded the first time the application page opens, so the page itself talks to nobody but its own host.
// The questions mirror lib/survey.js, which is what the server accepts.

const dialog = document.getElementById('apply')
const form = document.getElementById('apply-form')
const stepLabel = document.getElementById('apply-step')

let turnstileReady = null
let widgetId = null
let surveyToken = null
let surveyPart = null

// -- The questions --

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
const FEATURES = FEATURE_GROUPS.flatMap(([, items]) => items)

const one = (name, label, options) => ({ kind: 'one', name, label, options })
const free = (name, label, max = 2000) => ({ kind: 'text', name, label, max })

// How someone would prefer to pay, asked on the second page after applying and again at the end of the alpha.
const PRICING = [
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
]

const QUESTIONS = {
  signup: [
    { kind: 'pick', name: 'interests', label: 'Which features interest you most?', hint: 'Pick as many as you like.' },
    free('wished', "Which features would you like that LorEvolve doesn't have?"),
  ],
  'signup-pricing': [
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
    ...PRICING,
  ],
  'end-features': [{ kind: 'grid', name: 'usefulness' }],
  'end-more': [
    one('typesEffort', 'Defining your own types and fields felt:', [
      ['freeing', 'Freeing'],
      ['right', 'About right'],
      ['toomuch', 'Like too much work'],
    ]),
    free('progressionMissing', 'Is anything missing from Progression for your stories?'),
    one('timelineAuto', 'Which dates should fill the timeline in on their own?', [
      ['birthsDeaths', 'Births and deaths'],
      ['characterEvents', 'Other character events too'],
      ['everyDate', 'Every dated field'],
      ['none', 'None, I add moments myself'],
    ]),
    free('mapsWish', 'What would you want from interactive maps?'),
    free('missMost', 'Which feature would you miss most if it disappeared?'),
    free('confused', 'What confused you or got in your way?'),
    free('wished', "Which features would you like that LorEvolve doesn't have?"),
    ...PRICING,
  ],
}

const RATINGS = [
  ['must', 'Must have'],
  ['nice', 'Nice to have'],
  ['no', "Don't need"],
  ['untried', "Didn't try"],
]

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
    case 'text':
      return `<label class="field"><span class="field__label">${question.label}</span><textarea name="${question.name}" rows="3" maxlength="${question.max}"></textarea></label>`
    case 'pick':
      return `<fieldset class="field"><legend class="field__label">${question.label}</legend><p class="field__hint">${question.hint}</p>${FEATURE_GROUPS.map(([group, items]) => `<p class="field__group">${group}</p>${items.map(([key, label]) => `<label class="choice"><input type="checkbox" name="${question.name}" value="${key}" /> ${label}</label>`).join('')}`).join('')}</fieldset>`
    case 'grid':
      return FEATURE_GROUPS.map(
        ([group, items]) =>
          `<p class="field__group">${group}</p>` +
          items
            .map(
              ([key, label]) =>
                `<fieldset class="field rate"><legend class="field__label">${label}</legend><div class="rate__options">${RATINGS.map(([value, text]) => `<label><input type="radio" name="u_${key}" value="${value}" /><span>${text}</span></label>`).join('')}</div></fieldset>`,
            )
            .join(''),
      ).join('')
    case 'price':
      return `<label class="field"><span class="field__label">${question.label}</span><span class="field__hint">In euros, per month.</span><span class="money"><span aria-hidden="true">€</span><input name="${question.name}" type="number" inputmode="decimal" min="0" max="10000" step="0.01" /></span></label>`
  }
}

for (const container of form.querySelectorAll('[data-questions]')) {
  container.innerHTML = QUESTIONS[container.dataset.questions].map(render).join('')
}

// Read page by page: the signup and end-of-alpha surveys share some question names (wished).
function answers(pages) {
  const result = {}
  for (const page of pages) {
    const section = form.querySelector(`[data-page="${page}"]`)
    const value = (name) =>
      section.querySelector(`[name="${name}"]:is(textarea, input:not([type="radio"])), [name="${name}"]:checked`)?.value ?? ''
    for (const question of QUESTIONS[page]) {
      if (question.kind === 'grid') {
        result.usefulness = Object.fromEntries(FEATURES.map(([key]) => [key, value(`u_${key}`)]).filter(([, rating]) => rating))
      } else if (question.kind === 'pick') {
        result[question.name] = [...section.querySelectorAll(`[name="${question.name}"]:checked`)].map((box) => box.value)
      } else {
        result[question.name] = value(question.name)
        if (question.other) result[question.other.name] = value(question.other.name)
      }
    }
  }
  return result
}

// -- Pages --

const STEPS = { signup: 'Part 1 of 2', 'signup-pricing': 'Part 2 of 2', 'end-features': 'Part 1 of 2', 'end-more': 'Part 2 of 2' }

function showPage(page) {
  for (const section of form.querySelectorAll('[data-page]')) section.hidden = section.dataset.page !== page
  stepLabel.textContent = STEPS[page] ?? ''
  const target = form.querySelector(`[data-page="${page}"]`)
  const first = target.querySelector('h2.apply__title') ?? target.querySelector('input, textarea')
  dialog.scrollTop = 0
  first?.focus({ preventScroll: true })
  if (page === 'apply') renderTurnstile()
}

function currentPage() {
  return form.querySelector('[data-page]:not([hidden])')?.dataset.page ?? 'apply'
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
}

function pageValid(page) {
  for (const field of form.querySelector(`[data-page="${page}"]`).querySelectorAll('input, textarea')) {
    if (!field.checkValidity()) {
      field.reportValidity()
      return false
    }
  }
  return true
}

// -- Sending --

const MESSAGES = {
  verification: "The spam check didn't go through. Please try it again.",
  email: "That email address doesn't look right. Could you check it?",
  too_long: 'One of the answers is too long. Please shorten it.',
  unknown_token: "This survey link doesn't work any more. Write to support@lorevolve.com for a new one.",
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const reply = await response.json().catch(() => ({}))
  return { ok: response.ok, reply }
}

async function sendApplication() {
  const values = form.elements
  const body = {
    email: values.email.value,
    name: values.name.value,
    useCase: values.useCase.value,
    consent: values.consent.checked,
    turnstileToken: widgetId === null ? null : window.turnstile.getResponse(widgetId),
  }
  if (!body.turnstileToken) {
    showError('Please wait a moment for the spam check to finish, then press Send again.')
    return false
  }
  const { ok, reply } = await post('/api/apply', body)
  if (!ok) {
    showError(MESSAGES[reply.error] ?? MESSAGES[reply.field] ?? "Something went wrong and your answers weren't saved. Please try again in a moment.")
    return false
  }
  surveyToken = reply.surveyToken
  surveyPart = 'signup'
  document.getElementById('apply-thanks').textContent =
    `Thanks, ${body.name.trim()}. Invitations go out in small waves, so it may take a little while. ` +
    `I'll write to ${body.email.trim()} when it's your turn.`
  showPage('applied')
  return true
}

async function sendSurvey() {
  const pages = surveyPart === 'end' ? ['end-features', 'end-more'] : ['signup', 'signup-pricing']
  const { ok, reply } = await post('/api/survey', { token: surveyToken, part: surveyPart, answers: answers(pages) })
  if (!ok) {
    showError(MESSAGES[reply.error] ?? "Something went wrong and your answers weren't saved. Please try again in a moment.")
    return false
  }
  showPage('thanks')
  return true
}

async function send(event) {
  event.preventDefault()
  showError('')
  const page = currentPage()
  if (!pageValid(page)) return

  const button = form.querySelector(`[data-page="${page}"] [data-send]`)
  const label = button.textContent
  button.disabled = true
  button.textContent = 'Sending…'
  try {
    if (page === 'apply') await sendApplication()
    else await sendSurvey()
  } catch {
    showError("Your answers couldn't be sent. Check your connection and try again; nothing you typed is lost.")
  } finally {
    button.disabled = false
    button.textContent = label
    // A Turnstile token is good for one check; after a failed send the next try needs a fresh one.
    if (currentPage() === 'apply' && widgetId !== null) window.turnstile.reset(widgetId)
  }
}

// -- Wiring --

dialog.addEventListener('close', () => {
  // Once an application or a survey is sent, or skipped, the next open starts a fresh application.
  // A half-filled application or end-of-alpha survey is kept for when the dialog opens again.
  if (['applied', 'signup', 'signup-pricing', 'thanks', 'badlink'].includes(currentPage())) {
    form.reset()
    for (const box of form.querySelectorAll('.choice__other')) box.hidden = true
    surveyToken = null
    surveyPart = null
    showPage('apply')
    if (widgetId !== null) window.turnstile.reset(widgetId)
  }
})

// A click on the backdrop (the dialog element itself, outside the form) closes it.
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

for (const button of document.querySelectorAll('[data-open-apply]')) button.addEventListener('click', openDialog)
for (const button of dialog.querySelectorAll('[data-close-apply]')) button.addEventListener('click', () => dialog.close())
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

// The end-of-alpha survey: /?survey=<token> opens the dialog on it, greeting the tester by name.
const linkToken = new URLSearchParams(location.search).get('survey')
if (linkToken) {
  fetch(`/api/survey?token=${encodeURIComponent(linkToken)}`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((found) => {
      dialog.showModal()
      if (!found) {
        showPage('badlink')
        return
      }
      surveyToken = linkToken
      surveyPart = 'end'
      document.getElementById('end-greeting').textContent =
        `Thanks for testing LorEvolve, ${found.name}. Rate each part you used. Every question is optional.`
      showPage('end-features')
    })
}

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

// A clip loads and plays only while its row is open. With reduced motion it waits for the viewer's own play.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
for (const clip of document.querySelectorAll('.feature__clip')) {
  const row = clip.closest('details')
  row.addEventListener('toggle', () => {
    if (!row.open) {
      clip.pause()
      return
    }
    if (reduceMotion.matches) clip.controls = true
    else clip.play().catch(() => (clip.controls = true))
  })
}

// A feature picture not made yet is dropped rather than left as an empty frame. Lazy pictures load, and fail, on opening.
document.addEventListener(
  'error',
  (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('feature__shot')) event.target.remove()
  },
  true,
)
for (const shot of document.querySelectorAll('.feature__shot')) {
  if (shot.complete && shot.currentSrc && shot.naturalWidth === 0) shot.remove()
}
