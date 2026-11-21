// Run with `node --test uiContract/menuItems.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the rows of every `...` menu on their shared parts (#456): ActionMenuItem draws an item,
// RowMenu draws the Edit, items and Remove of a row. Each list below only shrinks, and a stale
// entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, elements, read, tsxFiles } from './support.ts'

// Files that write `actionmenu__item` in a class prop by hand, with the reason. ActionMenu.tsx builds
// the class in the part, outside any class prop.
const HAND_WRITTEN_ITEMS = new Map<string, string>([
  ['src/components/lore/TypeLevelMenus.tsx', 'a type switcher with its own look, not a menu item'],
])

// Files whose menu items carry no icon, with the reason.
const ITEMS_WITHOUT_ICON = new Map<string, string>([
  ['src/components/LoreFieldFilters.tsx', 'a list of field names to pick from'],
  ['src/components/ProjectEntitiesView.tsx', 'a list of type names to pick from'],
])

// Files with one menu that draws Edit and then Remove by hand, with the reason it is no RowMenu.
const HAND_WRITTEN_ROW_MENUS = new Map<string, string>([
  [
    'src/components/maps/MapHeader.tsx',
    'its panel carries panelTestId (map-actions-panel), which RowMenu does not take',
  ],
  ['src/components/projects/ComicCollectionItem.tsx', 'Edit comes after the move and add items'],
  ['src/components/stories/StoryBar.tsx', 'Timeline and Suggest come before Edit'],
])

const writesItemClass = (source: string) =>
  classStrings(source).some((value) => /(^|\s)actionmenu__item(\s|-|$)/.test(value))

// The `icon={...}` names of each ActionMenuItem in one menu, in order.
const iconsOf = (menu: string) =>
  elements(menu, 'ActionMenuItem').map(({ tag }) => /\bicon=\{(\w+)\}/.exec(tag)?.[1] ?? '')

const menuItemWithoutIcon = (source: string) =>
  elements(source, 'ActionMenuItem').some(({ tag }) => !/\bicon=\{/.test(tag))

const writesEditThenRemove = (source: string) =>
  elements(source, 'ActionMenu').some(({ body }) => {
    const icons = iconsOf(body)
    const edit = icons.indexOf('Pencil')
    return edit >= 0 && icons.slice(edit + 1).some((icon) => /^Trash\d?$/.test(icon))
  })

const filesWhere = (check: (source: string) => boolean) =>
  tsxFiles.filter((file) => check(read(file)))

function onlyAllowed(found: string[], allowed: Map<string, string>) {
  const names = [...allowed.keys()]
  assert.deepEqual(
    found.filter((file) => !names.includes(file)),
    [],
    'New offender: use the shared part, see docs/design/ui-components.md',
  )
  assert.deepEqual(
    names.filter((file) => !found.includes(file)),
    [],
    'No longer an exception: remove it from the list',
  )
}

test('the guards fail on a bad snippet', () => {
  assert.equal(writesItemClass('<button className="actionmenu__item">Go</button>'), true)
  assert.equal(
    writesItemClass('<button className="actionmenu__item actionmenu__item--danger">Go</button>'),
    true,
  )
  assert.equal(writesItemClass('<Link className={`actionmenu__item ${extra}`}>Go</Link>'), true)
  assert.equal(
    writesItemClass("<button className={['actionmenu__item', extra].join(' ')}>Go</button>"),
    true,
  )
  assert.equal(writesItemClass('<div className="actionmenu__itemlist">'), false)
  assert.equal(writesItemClass('<ActionMenuItem icon={X} onClick={go}>Go</ActionMenuItem>'), false)
  assert.equal(menuItemWithoutIcon('<ActionMenuItem onClick={go}>Go</ActionMenuItem>'), true)
  assert.equal(
    menuItemWithoutIcon('<ActionMenuItem icon={X} onClick={() => go()}>Go</ActionMenuItem>'),
    false,
  )
  const editThenRemove = `<ActionMenu label="x">
    <ActionMenuItem icon={Pencil} onClick={edit}>Edit</ActionMenuItem>
    <ActionMenuItem icon={Trash2} tone="danger" onClick={remove}>Remove</ActionMenuItem>
  </ActionMenu>`
  assert.equal(writesEditThenRemove(editThenRemove), true)
  assert.equal(
    writesEditThenRemove(
      `<ActionMenu label="x"><ActionMenuItem icon={Trash} onClick={remove}>Remove</ActionMenuItem></ActionMenu>`,
    ),
    false,
  )
  assert.equal(
    writesEditThenRemove(
      `<ActionMenu label="x"><ActionMenuItem icon={Trash} onClick={a}>A</ActionMenuItem><ActionMenuItem icon={Pencil} onClick={b}>B</ActionMenuItem></ActionMenu>`,
    ),
    false,
  )
})

test('actionmenu__item is written by ActionMenu and the listed files only', () => {
  onlyAllowed(filesWhere(writesItemClass), HAND_WRITTEN_ITEMS)
})

test('every ActionMenuItem has an icon, except the listed files', () => {
  onlyAllowed(filesWhere(menuItemWithoutIcon), ITEMS_WITHOUT_ICON)
})

test('a menu with Edit then Remove is a RowMenu, except the listed files', () => {
  onlyAllowed(filesWhere(writesEditThenRemove), HAND_WRITTEN_ROW_MENUS)
})
