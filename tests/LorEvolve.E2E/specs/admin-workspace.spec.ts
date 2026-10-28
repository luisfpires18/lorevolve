import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword, openAccountMenu } from './support/account'
import { currentUserId, grantAdmin } from './support/admin'
import { acceptConfirm } from './support/confirm'

/**
 * LorEvolve Admin (#40): a separate workspace only an Admin is offered or let into - by the server, not by a hidden link -
 * with Main, Users and Tracing; accounts as cards, never a table; and a Member block that signs them out at once, is
 * refused at sign-in, and is undone by unblock. Admin is granted outside the app (`grantAdmin`), as the owner does.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page, prefix: string) {
  const username = unique(prefix)
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function signIn(page: Page, username: string) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function newAdmin(browser: Browser) {
  const page = await (await browser.newContext()).newPage()
  const username = await signUp(page, 'admin')
  grantAdmin(await currentUserId(page))
  await page.reload()
  return { page, username }
}

async function newMember(browser: Browser) {
  const page = await (await browser.newContext()).newPage()
  const username = await signUp(page, 'member')
  return { page, username }
}

async function openUser(admin: Page, username: string) {
  await admin.goto('/admin/users')
  await admin.getByTestId('admin-user-search').fill(username)
  const card = admin.locator(`[data-testid="admin-user-card"][data-username="${username}"]`)
  await expect(card).toBeVisible()
  await card.getByTestId('admin-user-open').click()
  await expect(admin.getByTestId('admin-user-title')).toHaveText(username)
}

test.describe('LorEvolve Admin', () => {
  // Each test makes its own account the one Admin, which takes the role from any other: one at a time.
  test.describe.configure({ mode: 'serial' })

  test('a member is offered no Admin entry and is refused at the door and by the API', async ({
    page,
  }) => {
    await signUp(page, 'member')

    await openAccountMenu(page)
    await expect(page.getByTestId('account-menu-workspace')).toBeVisible()
    await expect(page.getByTestId('account-menu-admin')).toHaveCount(0)

    await page.goto('/admin/users')
    await page.waitForURL('/app')

    for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/database-backups']) {
      expect((await page.request.get(path)).status()).toBe(403)
    }
    const block = await page.request.post('/api/admin/users/anyone/block', {
      data: { reason: 'Trying.' },
    })
    expect(block.status()).toBe(403)
    expect((await page.request.post('/api/admin/database-backups/run')).status()).toBe(403)
  })

  test('an admin opens Main, Users and Tracing from the account menu', async ({ browser }) => {
    const { page } = await newAdmin(browser)

    await openAccountMenu(page)
    await page.getByTestId('account-menu-admin').click()
    await page.waitForURL('/admin')
    await expect(page).toHaveTitle(/^Main \| Admin \| LorEvolve$/)

    const nav = page.getByRole('navigation', { name: 'LorEvolve Admin' })
    await expect(nav.getByRole('link', { name: 'Main' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1, name: 'Main' })).toBeVisible()

    // Measured figures are numbers; what LorEvolve does not record says so, never a number.
    await expect(page.getByTestId('stat-accounts-value')).toHaveText(/^\d+$/)
    await expect(page.getByTestId('stat-admins-value')).not.toHaveText('0')
    for (const id of ['stat-new-accounts', 'stat-active', 'stat-requests', 'stat-ai']) {
      await expect(page.getByTestId(`${id}-value`)).toHaveText('Not tracked yet')
    }
    await expect(page.getByTestId('admin-trend').getByRole('listitem')).toHaveCount(6)

    // Database backups (#54) are off on a development server, and the page says so rather than showing a time.
    await expect(page.getByTestId('admin-backups-off')).toContainText('Off on this server')
    await expect(page.getByTestId('admin-backup-run')).toHaveCount(0)

    await nav.getByRole('link', { name: 'Tracing' }).click()
    await expect(page.getByTestId('admin-tracing-empty')).toContainText('not available yet')

    await nav.getByRole('link', { name: 'Users' }).click()
    await expect(page.getByTestId('admin-user-grid')).toBeVisible()
    await expect(page.locator('main table')).toHaveCount(0)
    await expect(page.getByTestId('admin-user-card').first()).toBeVisible()
  })

  test('blocking a member signs them out at once, refuses sign-in, and unblock lets them back', async ({
    browser,
  }) => {
    const { page: admin, username: adminName } = await newAdmin(browser)
    const { page: member, username: memberName } = await newMember(browser)

    await openUser(admin, memberName)
    await expect(admin.getByTestId('admin-user-role')).toHaveText('Member')
    await expect(admin.getByTestId('admin-user-status')).toHaveText('Active')
    await expect(admin.getByTestId('admin-user-last-login')).toHaveText('Not tracked yet')
    await expect(admin.getByTestId('admin-history-empty')).toBeVisible()

    // A reason is required before anything is asked.
    await admin.getByTestId('admin-block').click()
    await expect(admin.getByTestId('admin-reason-error')).toBeVisible()
    await expect(admin.getByTestId('confirm-dialog')).toHaveCount(0)

    await admin.getByTestId('admin-reason').fill('Spam in shared universes.')
    await admin.getByTestId('admin-block').click()
    await acceptConfirm(admin, /signed out everywhere at once/)
    await expect(admin.getByTestId('admin-user-status')).toContainText('Blocked since')
    // The focus stays on the account's action, now Unblock, rather than falling back to the page.
    await expect(admin.getByTestId('admin-unblock')).toBeFocused()
    const history = admin.getByTestId('admin-history-item')
    await expect(history).toHaveCount(1)
    await expect(history.first()).toContainText(`Blocked by ${adminName}`)
    await expect(history.first()).toContainText('Spam in shared universes.')

    // The member's open session ends at its next request; signing in again is refused with the reason it is.
    await member.goto('/app/profile')
    await member.waitForURL('/login')
    await signIn(member, memberName)
    await expect(
      member.getByText('This account has been blocked by a LorEvolve administrator.'),
    ).toBeVisible()
    await expect(member).toHaveURL(/\/login$/)

    await admin.getByTestId('admin-reason').fill('Appeal accepted.')
    await admin.getByTestId('admin-unblock').click()
    await acceptConfirm(admin, /can sign in again/)
    await expect(admin.getByTestId('admin-user-status')).toHaveText('Active')
    await expect(history).toHaveCount(2)

    await signIn(member, memberName)
    // Back to where the ended session was headed.
    await member.waitForURL('/app/profile')
  })

  test('making another account the owner takes the entry and the API from the first', async ({
    browser,
  }) => {
    const { page: first } = await newAdmin(browser)
    await openAccountMenu(first)
    await expect(first.getByTestId('account-menu-admin')).toBeVisible()

    const { page: second } = await newAdmin(browser)

    await first.reload()
    await openAccountMenu(first)
    await expect(first.getByTestId('account-menu-workspace')).toBeVisible()
    await expect(first.getByTestId('account-menu-admin')).toHaveCount(0)
    expect((await first.request.get('/api/admin/overview')).status()).toBe(403)
    await first.goto('/admin')
    await first.waitForURL('/app')

    await openAccountMenu(second)
    await expect(second.getByTestId('account-menu-admin')).toBeVisible()
    expect((await second.request.get('/api/admin/overview')).status()).toBe(200)
  })

  test('a member reports a bug from any page, and only an admin reads it', async ({ browser }) => {
    const member = await newMember(browser)
    await member.page.goto('/app/profile')
    await member.page.getByTestId('feedback-open').click()
    const dialog = member.page.getByTestId('feedback-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('feedback-send').click()
    await expect(dialog.getByTestId('feedback-error')).toBeVisible()
    await dialog.getByTestId('feedback-kind-feature').click()
    await dialog.getByTestId('feedback-text').fill('Insert a description of the request.')
    await dialog.getByTestId('feedback-send').click()
    await expect(dialog).toHaveCount(0)
    await expect(member.page.getByTestId('feedback-sent')).toBeVisible()

    // The list is the Admin's alone.
    expect((await member.page.request.get('/api/admin/feedback')).status()).toBe(403)

    const admin = await newAdmin(browser)
    await admin.page.goto('/admin/feedback')
    const report = admin.page
      .getByTestId('admin-feedback-report')
      .filter({ hasText: member.username })
      .first()
    await expect(report).toContainText('Feature request')
    await expect(report).toContainText('/app/profile')
    await expect(report).toContainText('Insert a description of the request.')
  })

  test('an admin account offers no block, its own included', async ({ browser }) => {
    const { page, username } = await newAdmin(browser)
    await openUser(page, username)
    await expect(page.getByTestId('admin-user-role')).toHaveText('Admin')
    await expect(page.getByTestId('admin-block-unavailable')).toContainText('This is your account.')
    await expect(page.getByTestId('admin-block')).toHaveCount(0)
  })

  test('on a phone the users are one column of cards and nothing scrolls sideways', async ({
    browser,
  }) => {
    const { page } = await newAdmin(browser)
    await page.setViewportSize({ width: 375, height: 812 })

    for (const path of ['/admin', '/admin/users']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    }

    const cards = page.getByTestId('admin-user-card')
    await expect(cards.first()).toBeVisible()
    const lefts = await cards.evaluateAll((all) =>
      all.slice(0, 3).map((card) => Math.round(card.getBoundingClientRect().left)),
    )
    expect(new Set(lefts).size).toBe(1)

    // Every card's action is a named link a keyboard reaches.
    await expect(cards.first().getByRole('link', { name: /^View details for / })).toBeVisible()
  })
})
