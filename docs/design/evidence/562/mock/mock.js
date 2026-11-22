// Mock only: swaps the four screens by hash and the theme by ?theme= or the sidebar button.
const ROWS = [
  ['Ysolde Marrenhal', 'Character', 'Canon', '2 hours ago'],
  ['Harrowmere', 'Settlement', 'Canon', '2 hours ago'],
  ["The Lamplighters' Compact", 'Organization', 'Canon', 'Yesterday'],
  ['Corwin Thatchlow', 'Character', 'Conflict', 'Yesterday'],
  ['The Slack-Tide Lantern', 'Item', 'Canon', '3 days ago'],
  ['Skell Landing', 'Settlement', 'Draft', '3 days ago'],
  ['Brine-Abbot Olmer of the Outer Shoals, Warden of the Ninth Register and Speaker for the Drowned', 'Character', 'Canon', 'Last week'],
  ['The winter of the late fleet', 'Event', 'Canon', 'Last week'],
  ['Shoal-walkers', 'Species', 'Draft', '12 Nov'],
]
const RECENT = [
  ['The Late Fleet, chapter 3', 'Story', '2 hours ago'],
  ['Ysolde Marrenhal', 'Character', '2 hours ago'],
  ['Harrowmere harbour map', 'Map', 'Yesterday'],
  ['A lantern is never lit at slack tide', 'World rule', '3 days ago'],
]
const STAMP = { Canon: 'stamp--ok', Conflict: 'stamp--warn', Draft: '' }

const app = document.getElementById('app')
const screen = document.getElementById('screen')
const slots = { crumbs: document.getElementById('crumbs'), actions: document.getElementById('actions') }
const cell = (text, className = '') => `<td class="${className}">${text}</td>`
const thumb = (name) =>
  `<img class="thumb" alt="" src="https://picsum.photos/seed/${encodeURIComponent(name.slice(0, 12))}/56/56" />`

function fill() {
  const rows = document.getElementById('rows')
  if (rows)
    rows.innerHTML = ROWS.map(
      ([name, type, canon, changed]) =>
        `<tr>${cell(`<a class="table__name" href="#entry">${thumb(name)}<span><bdi>${name}</bdi></span></a>`)}${cell(type, 'wide table__muted')}${cell(`<span class="stamp ${STAMP[canon]}">${canon}</span>`)}${cell(changed, 'wide table__muted')}</tr>`,
    ).join('')
  const recent = document.getElementById('recent')
  if (recent)
    recent.innerHTML = RECENT.map(
      ([name, kind, changed]) =>
        `<tr>${cell(`<a class="table__name" href="#entry"><span>${name}</span></a>`)}${cell(kind, 'wide table__muted')}${cell(changed, 'wide table__muted')}</tr>`,
    ).join('')
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
  const id = `t-${location.hash.slice(1) || 'lore'}`
  const template = document.getElementById(id) ?? document.getElementById('t-lore')
  const under = template.dataset.under && document.getElementById(template.dataset.under)
  if (under) mount(under)
  mount(template, Boolean(under))
  fill()
  for (const item of document.querySelectorAll('.navitem'))
    item.toggleAttribute('aria-current', item.textContent.trim() === template.dataset.nav)
  for (const item of document.querySelectorAll('.navitem[aria-current]')) item.setAttribute('aria-current', 'page')
  app.dataset.nav = new URLSearchParams(location.search).get('nav') ?? 'closed'
  window.lucide.createIcons()
}

document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]')
  if (go) location.hash = go.dataset.go
})
document.getElementById('menu').addEventListener('click', () => {
  app.dataset.nav = app.dataset.nav === 'open' ? 'closed' : 'open'
})
document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
})
const asked = new URLSearchParams(location.search).get('theme')
if (asked) document.documentElement.dataset.theme = asked
window.addEventListener('hashchange', show)
show()
