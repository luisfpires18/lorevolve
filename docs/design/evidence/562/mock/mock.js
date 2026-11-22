// Mock only: swaps the four screens by hash and the theme by ?theme= or the sidebar button.
// ?picked=2 opens the Lore list with that many cards selected.
const ENTRIES = [
  ['Ysolde Marrenhal', 'Character', 'Canon', 'Keeper of the Slack-Tide Lantern and the last of the Harrowmere pilots.'],
  ['Harrowmere', 'Settlement', 'Canon', 'A harbour town built on the wreck line, a day south of Skell Landing.'],
  ["The Lamplighters' Compact", 'Organization', 'Canon', 'The guild that decides where a light may burn.'],
  ['Corwin Thatchlow', 'Character', 'Conflict', 'Harbour clerk who keeps two sets of tide registers.'],
  ['The Slack-Tide Lantern', 'Item', 'Canon', 'The lamp that must never be lit when the water lies flat.'],
  ['Skell Landing', 'Settlement', 'Draft', 'The northern landing where the late fleet came home.'],
  [
    'Brine-Abbot Olmer of the Outer Shoals, Warden of the Ninth Register and Speaker for the Drowned',
    'Character',
    'Canon',
    'Head of the shoal monastery, and the only one who reads the ninth register.',
  ],
  ['The winter of the late fleet', 'Event', 'Canon', 'The season the fleet returned eleven days late.'],
  ['Shoal-walkers', 'Species', 'Draft', 'Wading birds the pilots read for the depth of the channel.'],
]
const RECENT = [
  ['The Late Fleet, chapter 3', 'Story, 2 hours ago'],
  ['Ysolde Marrenhal', 'Character, 2 hours ago'],
  ['Harrowmere harbour map', 'Map, yesterday'],
  ['A lantern is never lit at slack tide', 'World rule, 3 days ago'],
]
const TYPE = {
  Character: ['user-round', '#7c8cf0'],
  Settlement: ['castle', '#d19a4a'],
  Organization: ['users-round', '#b98ae6'],
  Item: ['gem', '#e0b24f'],
  Event: ['calendar-days', '#e2795e'],
  Species: ['paw-print', '#5fbf8f'],
}
const BLANK = new Set(['Corwin Thatchlow', 'The winter of the late fleet'])

const app = document.getElementById('app')
const screen = document.getElementById('screen')
const slots = { crumbs: document.getElementById('crumbs'), actions: document.getElementById('actions') }
const params = new URLSearchParams(location.search)

const picture = (name, icon) =>
  BLANK.has(name)
    ? `<span class="card__picture card__picture--blank"><i data-lucide="${icon}"></i></span>`
    : `<img class="card__picture" alt="" src="https://picsum.photos/seed/${encodeURIComponent(name.slice(0, 12))}/192/192" />`

const card = ([name, type, status, summary], index) => {
  const [icon, colour] = TYPE[type]
  const picked = index < Number(params.get('picked') ?? 0) ? 'checked' : ''
  return `<li class="card" style="--type: ${colour}">
  ${picture(name, icon)}
  <div class="card__body">
    <a class="card__name" href="#entry"><bdi>${name}</bdi></a>
    <span class="card__meta">
      <span class="card__type"><i data-lucide="${icon}"></i>${type}</span>
      <span class="status status--${status.toLowerCase()}">${status}</span>
    </span>
    <span class="card__summary">${summary}</span>
  </div>
  <input class="card__pick" type="checkbox" aria-label="Select ${name}" ${picked} />
</li>`
}

function selection() {
  const picks = [...document.querySelectorAll('.card__pick')]
  const bar = document.getElementById('selection')
  if (!bar) return
  const count = picks.filter((pick) => pick.checked).length
  bar.hidden = count === 0
  document.getElementById('picked').textContent = `${count} selected`
  const all = document.getElementById('all')
  all.checked = count === picks.length
  all.indeterminate = count > 0 && count < picks.length
}

function fill() {
  const cards = document.getElementById('rows')
  if (cards) cards.innerHTML = ENTRIES.map(card).join('')
  const recent = document.getElementById('recent')
  if (recent)
    recent.innerHTML = RECENT.map(
      ([name, meta]) =>
        `<li><a class="rows__name" href="#entry">${name}</a><span class="rows__meta">${meta}</span></li>`,
    ).join('')
  selection()
}

function mount(template, keep) {
  if (!keep) screen.replaceChildren()
  const content = template.content.cloneNode(true)
  for (const [name, target] of Object.entries(slots)) {
    const slot = content.querySelector(`[data-slot="${name}"]`)
    if (slot) {
      target.replaceChildren(...slot.childNodes)
      slot.remove()
    }
  }
  screen.append(content)
}

function show() {
  const template = document.getElementById(`t-${location.hash.slice(1) || 'lore'}`) ?? document.getElementById('t-lore')
  const under = template.dataset.under && document.getElementById(template.dataset.under)
  if (under) mount(under)
  mount(template, Boolean(under))
  fill()
  for (const item of document.querySelectorAll('.navitem')) {
    if (item.textContent.trim() === template.dataset.nav) item.setAttribute('aria-current', 'page')
    else item.removeAttribute('aria-current')
  }
  app.dataset.nav = params.get('nav') ?? 'closed'
  window.lucide.createIcons()
}

document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]')
  if (go) location.hash = go.dataset.go
  if (event.target.id === 'clear') {
    for (const pick of document.querySelectorAll('.card__pick')) pick.checked = false
    selection()
  }
})
document.addEventListener('change', (event) => {
  if (event.target.id === 'all')
    for (const pick of document.querySelectorAll('.card__pick')) pick.checked = event.target.checked
  if (event.target.matches('.card__pick, #all')) selection()
})
document.getElementById('menu').addEventListener('click', () => {
  app.dataset.nav = app.dataset.nav === 'open' ? 'closed' : 'open'
})
document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
})
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')
window.addEventListener('hashchange', show)
show()
