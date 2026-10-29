// The application dialog: two steps, Next and Back keep what was typed, Send posts everything to /api/apply.
// Turnstile is loaded the first time the dialog opens, so the page itself talks to nobody but its own host.

const dialog = document.getElementById('apply')
const form = document.getElementById('apply-form')
const stepLabel = document.getElementById('apply-step')
const errorBox = document.getElementById('apply-error')
const sendButton = form.querySelector('[data-send]')
const payOther = form.elements.payOther

let turnstileReady = null
let widgetId = null

function showPage(page) {
  for (const section of form.querySelectorAll('[data-page]')) section.hidden = section.dataset.page !== page
  stepLabel.textContent = page === 'done' ? '' : `Step ${page} of 2`
  const target = form.querySelector(`[data-page="${page}"]`)
  const first = page === 'done' ? target.querySelector('.apply__title') : target.querySelector('input, textarea')
  dialog.scrollTop = 0
  first?.focus({ preventScroll: true })
  if (page === '2') renderTurnstile()
}

function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = !message
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
  loadTurnstile().catch(() => {})
}

function currentPage() {
  return form.querySelector('[data-page]:not([hidden])')?.dataset.page ?? '1'
}

function stepOneValid() {
  for (const field of form.querySelector('[data-page="1"]').querySelectorAll('input, textarea')) {
    if (!field.checkValidity()) {
      field.reportValidity()
      return false
    }
  }
  return true
}

function payload() {
  const values = form.elements
  return {
    email: values.email.value,
    name: values.name.value,
    useCase: values.useCase.value,
    consent: values.consent.checked,
    payPreference: values.payPreference.value || null,
    payOther: values.payOther.value,
    priceTooCheap: values.priceTooCheap.value,
    priceTooExpensive: values.priceTooExpensive.value,
    suggestion: values.suggestion.value,
    turnstileToken: widgetId === null ? null : window.turnstile.getResponse(widgetId),
  }
}

const MESSAGES = {
  verification: "The spam check didn't go through. Please try it again.",
  email: "That email address doesn't look right. Go back and check it?",
  too_long: 'One of the answers is too long. Please shorten it.',
}

async function send(event) {
  event.preventDefault()
  showError('')
  // Enter in a step 1 field submits the form; there it means Next.
  if (currentPage() === '1') {
    if (stepOneValid()) showPage('2')
    return
  }
  if (!stepOneValid()) {
    showPage('1')
    return
  }
  for (const field of form.querySelector('[data-page="2"]').querySelectorAll('input, textarea')) {
    if (!field.checkValidity()) {
      field.reportValidity()
      return
    }
  }
  const body = payload()
  if (!body.turnstileToken) {
    showError('Please wait a moment for the spam check to finish, then press Send again.')
    return
  }

  sendButton.disabled = true
  sendButton.textContent = 'Sending…'
  try {
    const response = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) {
      document.getElementById('apply-thanks').textContent =
        `Thanks, ${body.name.trim()}. Invitations go out in small waves, so it may take a little while. ` +
        `I'll write to ${body.email.trim()} when it's your turn.`
      showPage('done')
      return
    }
    const problem = await response.json().catch(() => ({}))
    showError(
      MESSAGES[problem.error] ??
        MESSAGES[problem.field] ??
        "Something went wrong and your answers weren't saved. Please try again in a moment.",
    )
  } catch {
    showError("Your answers couldn't be sent. Check your connection and try again; nothing you typed is lost.")
  } finally {
    sendButton.disabled = false
    sendButton.textContent = 'Send'
    // A token is good for one check; after a failed send the next try needs a fresh one.
    if (currentPage() !== 'done' && widgetId !== null) window.turnstile.reset(widgetId)
  }
}

function closeDialog() {
  dialog.close()
}

// After a successful send, the next open starts a fresh application.
dialog.addEventListener('close', () => {
  if (!form.querySelector('[data-page="done"]').hidden) {
    form.reset()
    payOther.hidden = true
    showPage('1')
    if (widgetId !== null) window.turnstile.reset(widgetId)
  }
})

// The Discord invite: paste it here and every Discord link on the page appears. Empty keeps them hidden.
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

// A click on the backdrop (the dialog element itself, outside the form) closes it.
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog()
})

for (const button of document.querySelectorAll('[data-open-apply]')) button.addEventListener('click', openDialog)
for (const button of dialog.querySelectorAll('[data-close-apply]')) button.addEventListener('click', closeDialog)

form.querySelector('[data-next]').addEventListener('click', () => {
  if (stepOneValid()) showPage('2')
})
form.querySelector('[data-back]').addEventListener('click', () => {
  showError('')
  showPage('1')
})
form.addEventListener('submit', send)

form.addEventListener('change', (event) => {
  if (event.target.name !== 'payPreference') return
  payOther.hidden = event.target.value !== 'other'
  if (!payOther.hidden) payOther.focus()
})
