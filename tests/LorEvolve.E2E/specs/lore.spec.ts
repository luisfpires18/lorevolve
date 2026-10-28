import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import { addField, showFields } from './support/typeFields'

/**
 * Each test registers its own account and builds its own universe, so nothing depends on
 * data another test left behind.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('loremaster')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function newUniverse(page: Page, name: string) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
}

async function openLore(page: Page) {
  await page.getByTestId('workspace-lore').click()
  await page.waitForURL(/\/lore$/)
}

/** Lore starts at its type catalog; after a type is chosen, navigation stays in the type row. */
async function chooseType(page: Page, name: string) {
  const catalog = page.getByTestId('lore-catalog')
  const nav = page.getByRole('navigation', { name: 'Lore types' })
  await expect(catalog.or(nav).or(page.getByTestId('lore-type-menu')).first()).toBeVisible()
  if (await catalog.isVisible()) {
    await catalog.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`).click()
  } else {
    await nav.getByRole('link', { name, exact: true }).click()
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
}

/**
 * Types an article, waiting for the editor to hold the caret first.
 *
 * "Write the article" replaces the button with an editor that focuses itself once it exists, which is
 * a moment after the click. Typing into the click, as this file used to, races that moment and drops
 * whatever was typed before it: the same wait every other spec that writes prose already does.
 */
async function writeArticle(page: Page, text: string) {
  await expect(page.getByTestId('lore-editor')).toBeFocused()
  await page.keyboard.type(text)
}

test.describe('lore', () => {
  test('build an entry with fields, tags, aliases and an article, then find it again', async ({
    page,
  }) => {
    await signUp(page)
    await newUniverse(page, unique('Ashen Reach '))

    // A new universe ships with the default types, and reading them says nothing went wrong.
    // The screen used to report the read it cancelled itself as a failure the author could see.
    await page.getByTestId('workspace-types').click()
    await expect(page.getByTestId('type-list')).toContainText('Character')
    await expect(page.getByTestId('types-error')).toHaveCount(0)

    // Add a custom type with two structured fields.
    await page.getByTestId('new-type').click()
    await page.getByTestId('type-name').fill('Starship')
    await page.getByTestId('save-type').click()
    await expect(page.locator('[data-type-name="Starship"]')).toBeVisible()

    // Fields lists what the type has - nothing yet - and the form opens only from Add field.
    const fields = await showFields(page, 'Starship')
    await expect(fields).toContainText('No custom fields yet.')
    await expect(page.getByTestId('field-dialog')).toHaveCount(0)

    await addField(page, 'Starship', { name: 'Registry' })
    await expect(page.getByTestId('field-row-Registry')).toBeVisible()

    await addField(page, 'Starship', {
      name: 'Class',
      kind: 'Choose one',
      options: 'Courier, Hauler',
    })
    await expect(page.getByTestId('field-row-Class')).toBeVisible()

    // Write the entry.
    await openLore(page)
    // No type chosen yet: nothing is listed, and the types are the way in.
    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    await chooseType(page, 'Starship')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new\?type=/)

    const name = unique('The Kestrel ')
    await page.getByLabel('Entry type').selectOption({ label: 'Starship' })
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('A courier that outran the blockade.')

    await page.getByLabel('Aliases').fill('The Grey Bird')
    await page.getByLabel('Aliases').press('Enter')
    await page.getByLabel('Tags').fill('Fleet')
    await page.getByLabel('Tags').press('Enter')

    await page.getByLabel('Registry').fill('KR-118')
    await page.getByLabel('Class').selectOption({ label: 'Courier' })

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // The article is written on the entry once it exists, and saved on its own.
    await page.getByTestId('article-write').click()
    await writeArticle(page, 'She was built for running, and never once for fighting.')
    await page.getByTestId('article-save').click()
    await expect(page.getByTestId('article-status')).toHaveText('Saved')
    await page.getByTestId('article-done').click()

    // Everything comes back on the article page.
    await expect(page.getByTestId('entry-name')).toHaveText(name)
    await expect(page.getByTestId('entry-type')).toHaveText('Starship')
    await expect(page.getByTestId('entry-aliases')).toContainText('The Grey Bird')
    await expect(page.getByTestId('entry-summary')).toContainText('outran the blockade')
    await expect(page.getByTestId('entry-tags')).toContainText('Fleet')
    await expect(page.getByTestId('entry-fields')).toContainText('KR-118')
    await expect(page.getByTestId('entry-fields')).toContainText('Courier')
    await expect(page.getByTestId('lore-article')).toContainText('built for running')

    // It shows on the grid, and search finds it.
    await page.getByRole('link', { name: 'Lore', exact: true }).first().click()
    await page.waitForURL(/\/lore$/)
    await chooseType(page, 'Starship')
    await expect(card(page, name)).toBeVisible()

    await page.getByLabel('Filter entries').fill('Grey Bird')
    await expect(card(page, name)).toBeVisible()

    // Words that appear nowhere but inside the article body find it too.
    await page.getByLabel('Filter entries').fill('built for running')
    await expect(card(page, name)).toBeVisible()

    await page.getByLabel('Filter entries').fill('nothing-matches-this')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
  })

  test('edit an entry and walk it from idea to canon, and it survives a reload', async ({
    page,
  }) => {
    await signUp(page)
    await newUniverse(page, unique('Vaultward '))
    await openLore(page)

    const name = unique('Alenna Vance ')
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    const entryUrl = page.url()

    // A new entry starts as an idea.
    await expect(page.getByTestId('canon-idea')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('canon-draft').click()
    await expect(page.getByTestId('canon-draft')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('canon-canon').click()
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    // Edit in place.
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Summary').fill('Warden of the drowned coast, and its last cartographer.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toContainText('last cartographer')

    await page.getByTestId('article-write').click()
    await writeArticle(page, 'She kept the tide ledger by hand.')
    await page.getByTestId('article-save').click()
    await expect(page.getByTestId('article-status')).toHaveText('Saved')

    // Everything persists across a full reload.
    await page.reload()
    await expect(page).toHaveURL(entryUrl)
    await expect(page.getByTestId('entry-name')).toHaveText(name)
    await expect(page.getByTestId('entry-summary')).toContainText('last cartographer')
    await expect(page.getByTestId('lore-article')).toContainText('tide ledger')
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')
  })

  test('filters narrow the grid by type and status', async ({ page }) => {
    await signUp(page)
    await newUniverse(page, unique('Longmoor '))
    await openLore(page)

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Entry type').selectOption({ label: 'Character' })
    await page.getByLabel('Name').fill('A Person')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('canon-canon').click()
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('link', { name: 'Lore', exact: true }).first().click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Entry type').selectOption({ label: 'Location' })
    await page.getByLabel('Name').fill('A Place')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await page.getByRole('link', { name: 'Lore', exact: true }).first().click()
    await page.waitForURL(/\/lore$/)

    // No "All": nothing is listed until a type is chosen.
    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveCount(0)

    await chooseType(page, 'Location')
    await expect(card(page, 'A Place')).toBeVisible()
    await expect(card(page, 'A Person')).toBeHidden()

    await chooseType(page, 'Character')
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Canon' }).click()
    await expect(card(page, 'A Person')).toBeVisible()
    await expect(card(page, 'A Place')).toBeHidden()

    await chooseType(page, 'Location')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
  })

  test('one owner cannot open another owner entry', async ({ page }) => {
    await signUp(page)
    await newUniverse(page, unique('Private World '))
    await openLore(page)

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill('Private Person')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const entryUrl = page.url()

    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await clickSignOut(page)
    await page.waitForURL('/login')

    // A different account may not read the first account's entry by its URL.
    await signUp(page)
    await page.goto(entryUrl)
    await expect(page.getByTestId('universe-missing')).toBeVisible()
  })
})
