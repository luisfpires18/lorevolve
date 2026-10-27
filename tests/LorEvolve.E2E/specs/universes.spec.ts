import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'

/**
 * Every test registers its own account, so each one starts from an empty universe list
 * and never depends on data another test left behind.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function registerAndSignIn(page: Page) {
  const username = unique('worldsmith')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function createUniverse(page: Page, name: string, description?: string) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  if (description) {
    await page.getByLabel('Description').fill(description)
  }
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="universe-card"][data-universe-name="${name}"]`)
}

test.describe('universes', () => {
  test('create, open, edit, find, archive and filter', async ({ page }) => {
    await registerAndSignIn(page)

    // A fresh account starts empty.
    await expect(page.getByTestId('universe-empty')).toBeVisible()

    const name = unique('Ashen Reach ')
    await createUniverse(page, name, 'A drowned continent.')
    await expect(page.getByTestId('workspace-name')).toHaveText(name)
    // The front page is the universe's contents: its name as the screen's heading, and a way into
    // each part of it - not a placeholder claiming the lore is somewhere else.
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByTestId('overview-lore')).toHaveAttribute('href', /\/lore$/)
    await expect(page.getByText('Your lore will appear here.')).toHaveCount(0)

    // Back to the list: the new universe is on the grid.
    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await expect(card(page, name)).toBeVisible()

    // Open it from the grid and edit its details.
    await card(page, name).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    await page.getByTestId('workspace-settings').click()

    const renamed = `${name} Redrawn`
    await page.getByLabel('Name').fill(renamed)
    await page.getByLabel('Description').fill('Now mapped.')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByTestId('settings-saved')).toBeVisible()
    await expect(page.getByTestId('workspace-name')).toHaveText(renamed)

    // Search finds the renamed universe.
    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await page.getByLabel('Filter universes').fill('Redrawn')
    await expect(card(page, renamed)).toBeVisible()

    // A search that matches nothing shows the empty state rather than the whole list.
    await page.getByLabel('Filter universes').fill('nothing-matches-this')
    await expect(page.getByTestId('universe-empty')).toBeVisible()
    await page.getByLabel('Filter universes').fill('')
    await expect(card(page, renamed)).toBeVisible()

    // Archive it, and it leaves the active list.
    await card(page, renamed).click()
    await page.getByTestId('workspace-settings').click()
    await page.getByTestId('settings-tab-advanced').click()
    await page.getByTestId('toggle-archive').click()
    await expect(page.getByRole('button', { name: 'Restore universe' })).toBeVisible()

    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await expect(card(page, renamed)).toBeHidden()
    await expect(page.getByTestId('universe-empty')).toBeVisible()

    // The All filter brings it back, marked as archived.
    await page.getByTestId('filter-all').click()
    await expect(card(page, renamed)).toBeVisible()
    await expect(card(page, renamed).getByText('Archived')).toBeVisible()
  })

  test('paginates a long list', async ({ page }) => {
    await registerAndSignIn(page)

    // One over a full page of twelve, so a second page has to exist.
    for (let index = 0; index < 13; index++) {
      await createUniverse(page, `Paged World ${String(index).padStart(2, '0')}`)
      await page.getByRole('link', { name: 'All universes' }).click()
      await page.waitForURL('/app')
    }

    await expect(page.getByTestId('universe-card')).toHaveCount(12)
    await expect(page.getByText('Page 1 of 2')).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await expect(page.getByTestId('universe-card')).toHaveCount(1)
  })

  test('rejects a duplicate name for the same owner', async ({ page }) => {
    await registerAndSignIn(page)

    const name = unique('Only One ')
    await createUniverse(page, name)
    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Create universe' }).click()

    await expect(page.getByText('You already have a universe with that name.')).toBeVisible()
  })

  test('a signed-out visitor cannot open a universe', async ({ page }) => {
    await registerAndSignIn(page)
    await createUniverse(page, unique('Private World '))
    const workspaceUrl = page.url()

    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await clickSignOut(page)
    await page.waitForURL('/login')

    await page.goto(workspaceUrl)
    await expect(page).toHaveURL('/login')
  })

  test('one owner cannot open another owner universe', async ({ page }) => {
    await registerAndSignIn(page)
    await createUniverse(page, unique('Someone Elses World '))
    const workspaceUrl = page.url()

    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await clickSignOut(page)
    await page.waitForURL('/login')

    // A different account may not read the first account's universe by its id.
    await registerAndSignIn(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('universe-missing')).toBeVisible()
  })
})
