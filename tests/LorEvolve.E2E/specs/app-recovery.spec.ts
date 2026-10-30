import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * What the app does when the ground moves under an open tab (2026-10-26 audit, F04/F28/F29):
 * the session ends mid-work, the session probe cannot reach LorEvolve, or a screen's code is gone.
 *
 * What is pinned: an ended session sends the author to sign in and back to where they were; a probe that fails for a
 * reason other than 401 offers a retry instead of signing them out; a screen whose chunk cannot load shows LorEvolve's own
 * reload message, not the router's developer error page.
 */
function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('recover')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { username, password }
}

test.describe('app recovery', () => {
  test('a session that ends mid-work sends the author to sign in, then back where they were', async ({
    page,
    context,
  }) => {
    const account = await signUp(page)
    const created = await page.request.post('/api/universes', {
      data: { name: unique('Ended '), description: null, accentColor: null },
    })
    expect(created.ok()).toBe(true)
    const { id } = (await created.json()) as { id: string }

    await page.goto(`/app/universes/${id}/chronology`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // A workspace read still in flight would meet the missing cookie first and sign out from here, not from Timeline.
    await page.waitForLoadState('networkidle')

    // The cookie goes; the next request the open tab makes is answered 401.
    await context.clearCookies()
    await page
      .getByRole('navigation', { name: 'Universe', exact: true })
      .getByRole('link', { name: 'Timeline' })
      .click()

    await expect(page).toHaveURL('/login')
    await page.getByLabel('Username or email').fill(account.username)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(`/app/universes/${id}/timeline`)
  })

  test('a session probe that cannot reach LorEvolve offers a retry instead of signing out', async ({
    page,
  }) => {
    await signUp(page)

    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 500, body: '' }))
    await page.goto('/app')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('LorEvolve could not be reached')
    await expect(page).toHaveURL('/app')

    await page.unroute('**/api/auth/me')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page).toHaveURL('/app')
  })

  test('a screen whose code cannot load says LorEvolve was updated and offers a reload', async ({
    page,
  }) => {
    await signUp(page)

    // The dev server serves the module by its source path; a build by a hashed chunk name. Either is refused.
    await page.route(/IdeasPage[^/]*\.(tsx|js)(\?.*)?$/, (route) => route.abort())
    await page.goto('/app/ideas')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('LorEvolve was updated while this page was open')
    await expect(alert.getByRole('button', { name: 'Reload' })).toBeVisible()
  })
})
