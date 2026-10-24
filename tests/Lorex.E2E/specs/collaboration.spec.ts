import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'

/**
 * Refinement 030 (ADR 0041 amendment): invitations and collaborator management, as two or three people at once in their
 * own browsers. Every membership here is made the real way - an owner invites an address, its account accepts - never
 * written to the database. The API's own rules are proved by the API tests; this proves what a person sees: what an
 * invitation says to whom, that nothing claims an email was sent, and that each role is shown only what it can do.
 */

const Role = { Owner: 0, Viewer: 1, Reviewer: 2, Editor: 3 } as const

interface Person {
  context: BrowserContext
  page: Page
  username: string
  email: string
}

/** A fresh browser with a signed-in account of its own, its address known to the test. */
async function person(browser: Browser, prefix: string): Promise<Person> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = unique(prefix)
  const email = `${username}@example.test`
  await register(page, username, email)
  await page.waitForURL('/app')
  return { context, page, username, email }
}

async function register(page: Page, username: string, email: string) {
  await page.goto('/register')
  await fillRegistration(page, username, email)
}

async function fillRegistration(page: Page, username: string, email: string) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function universe(page: Page, name = unique('Shared World ')) {
  const id = await post(page, '/api/universes', { name, description: null, accentColor: null })
  return { id, name }
}

/** An invitation made and accepted through the API: the same routes the screens use. */
async function share(owner: Page, universeId: string, member: Person, role: number) {
  const invitationId = await post(owner, `/api/universes/${universeId}/invitations`, {
    email: member.email,
    role,
  })
  const accepted = await member.page.request.post(`/api/invitations/${invitationId}/accept`)
  expect(accepted.ok()).toBe(true)
}

/** An invitation as the owner's API answers it: its id and the protected token its link carries. */
async function invite(owner: Page, universeId: string, email: string, role: number) {
  const response = await owner.request.post(`/api/universes/${universeId}/invitations`, {
    data: { email, role },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: string; claimToken: string }
}

async function entry(page: Page, universeId: string, name: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as {
    id: string
    name: string
  }[]
  return post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: 'Written by the owner.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('collaborators', () => {
  test('the owner invites by email, changes the pending role, copies the link and revokes - and is never told an email went out', async ({
    browser,
  }) => {
    const owner = await person(browser, 'collabowner')
    const invitee = await person(browser, 'collabinvitee')
    await owner.context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const world = await universe(owner.page)

    await owner.page.goto(`/app/universes/${world.id}/settings`)
    const tabs = owner.page.getByRole('tablist', { name: 'Settings' }).getByRole('tab')
    await expect(tabs).toHaveText(['General', 'Appearance', 'Collaborators', 'Data', 'Advanced'])
    await owner.page.getByRole('tab', { name: 'Collaborators' }).click()
    await expect(owner.page).toHaveURL(/tab=collaborators/)

    // The role picker explains the role, in a line.
    const role = owner.page.getByLabel('Role', { exact: true })
    await expect(role).toHaveValue(String(Role.Editor))
    await expect(owner.page.getByTestId('invite-role-hint')).toHaveText(
      'Can create and edit content, use Trash and restore items. Cannot permanently delete, publish, or manage the universe.',
    )
    await role.selectOption({ label: 'Reviewer' })
    await expect(owner.page.getByTestId('invite-role-hint')).toHaveText(
      'Can read, comment and suggest changes. Cannot edit content directly.',
    )

    // An empty address is refused at the field, tied to it.
    await owner.page.getByTestId('create-invitation').click()
    await expect(owner.page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(owner.page.getByTestId('invite-email-error')).toBeVisible()

    await owner.page.getByLabel('Email').fill(invitee.email.toUpperCase())
    await role.selectOption({ label: 'Viewer' })
    await owner.page.getByTestId('create-invitation').click()

    const created = owner.page.getByTestId('invitation-created')
    await expect(created).toContainText('Invitation created')
    await expect(created).toContainText('can accept it from LoreX if they sign in with this email')
    await expect(created).toContainText('LoreX does not send email')
    await expect(owner.page.getByText(/email (was )?sent/i)).toHaveCount(0)

    const pending = owner.page.getByTestId('pending-invitation-row')
    await expect(pending).toHaveCount(1)
    await expect(pending).toContainText(invitee.email.toUpperCase())
    await expect(pending).toContainText('Expires')

    // The same address again is not a second invitation: the one already there is pointed at.
    await owner.page.getByLabel('Email').fill(invitee.email)
    await owner.page.getByTestId('create-invitation').click()
    await expect(owner.page.getByTestId('invite-email-error')).toContainText(
      'already has a pending invitation',
    )
    await expect(pending).toHaveCount(1)

    // Its role changes before anyone accepts it.
    await pending
      .getByLabel(`Role for ${invitee.email.toUpperCase()}`)
      .selectOption({ label: 'Editor' })
    await expect(owner.page.getByTestId('collaborators-announcer')).toContainText('now for Editor')

    // The link is the page's own origin, and copying it says so.
    await pending.getByTestId('copy-invite-link').click()
    await expect(pending.getByTestId('copy-invite-link-status')).toHaveText('Invite link copied.')
    const link = await owner.page.evaluate(() => navigator.clipboard.readText())
    // A protected claim token, not the invitation's id: the link is what lets an invitation be claimed.
    expect(link).toMatch(
      new RegExp(`^${new URL(owner.page.url()).origin}/invite/[A-Za-z0-9_-]{40,}$`),
    )

    // The invitee, in their own browser, is offered it as Editor - the role it holds now.
    await invitee.page.reload()
    const offered = invitee.page.getByTestId('received-invitation')
    await expect(offered).toContainText(world.name)
    await expect(offered).toContainText('Invited as Editor')

    // Revoked, it is gone from both sides.
    await pending.getByTestId('revoke-invitation').click()
    await expect(pending).toHaveCount(0)
    await expect(owner.page.getByTestId('invitations-empty')).toBeVisible()
    await invitee.page.reload()
    await expect(invitee.page.getByTestId('received-invitations')).toHaveCount(0)

    await owner.context.close()
    await invitee.context.close()
  })

  test('an existing account accepts from My workspace, opens the universe as Editor and writes in it; another declines', async ({
    browser,
  }) => {
    const owner = await person(browser, 'acceptowner')
    const ana = await person(browser, 'acceptana')
    const world = await universe(owner.page)
    const other = await universe(owner.page)
    await post(owner.page, `/api/universes/${world.id}/invitations`, {
      email: ana.email,
      role: Role.Editor,
    })
    await post(owner.page, `/api/universes/${other.id}/invitations`, {
      email: ana.email,
      role: Role.Viewer,
    })

    await ana.page.reload()
    const section = ana.page.getByTestId('received-invitations')
    await expect(section.getByRole('heading', { name: 'Invitations' })).toBeVisible()
    const declined = section.getByTestId('received-invitation').filter({ hasText: other.name })
    await expect(declined).toContainText('Invited as Viewer')
    await declined.getByTestId('decline-invitation').click()
    await expect(ana.page.getByTestId('invitations-announcer')).toContainText('declined')
    await expect(section.getByTestId('received-invitation')).toHaveCount(1)
    await expect(ana.page.getByTestId('universe-card').filter({ hasText: other.name })).toHaveCount(
      0,
    )

    const offered = section.getByTestId('received-invitation').filter({ hasText: world.name })
    await expect(offered).toContainText('Invited as Editor')
    await offered.getByTestId('accept-invitation').click()

    // Accepting opens the universe, and says whose role this is.
    await ana.page.waitForURL(`/app/universes/${world.id}`)
    await expect(ana.page.getByTestId('workspace-role')).toHaveText('Shared · Editor')
    await expect(ana.page.getByTestId('overview-role')).toContainText('Shared with you as Editor.')

    // An Editor writes.
    await ana.page.goto(`/app/universes/${world.id}/lore/new`)
    await ana.page.getByPlaceholder('Name this').fill('Written by Ana')
    await ana.page.getByTestId('save-entity').click()
    await expect(ana.page.getByRole('heading', { name: 'Written by Ana' })).toBeVisible()

    // And My workspace now lists it, quietly marked as shared.
    await ana.page.goto('/app')
    const card = ana.page.locator(
      `[data-testid="universe-card"][data-universe-name="${world.name}"]`,
    )
    await expect(card.getByTestId('universe-card-role')).toHaveText('Shared · Editor')
    await expect(ana.page.getByTestId('received-invitations')).toHaveCount(0)

    // The owner's own card carries no badge.
    await owner.page.goto('/app')
    await expect(
      owner.page
        .locator(`[data-testid="universe-card"][data-universe-name="${world.name}"]`)
        .getByTestId('universe-card-role'),
    ).toHaveCount(0)

    await owner.context.close()
    await ana.context.close()
  })

  test('a link opened signed out says nothing private, and an account made with the invited email comes back to it', async ({
    browser,
  }) => {
    const owner = await person(browser, 'linkowner')
    const world = await universe(owner.page)
    const username = unique('linknew')
    const email = `${username}@example.test`
    const { claimToken } = await invite(owner.page, world.id, email, Role.Reviewer)

    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`/invite/${claimToken}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      "You've been invited to collaborate in LoreX.",
    )
    await expect(page.getByText('Sign in or create an account to continue.')).toBeVisible()
    const body = await page.locator('body').innerText()
    for (const secret of [world.name, owner.username, 'Reviewer', email]) {
      expect(body).not.toContain(secret)
    }

    await page.getByTestId('invitation-register').click()
    await expect(page).toHaveURL('/register')
    await fillRegistration(page, username, email)

    // Back to the invitation, now addressed to this account.
    await page.waitForURL(`/invite/${claimToken}`)

    // The address is unverified, so nothing was offered to the new account on its own: only the link opens it.
    expect(await (await page.request.get('/api/invitations')).json()).toEqual([])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(world.name)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByText("You've been invited as Reviewer.")).toBeVisible()
    await page.getByTestId('invitation-accept').click()

    await page.waitForURL(`/app/universes/${world.id}`)
    await expect(page.getByTestId('workspace-role')).toHaveText('Shared · Reviewer')

    await owner.context.close()
    await context.close()
  })

  test('another signed-in account opening the link learns only that it is for someone else', async ({
    browser,
  }) => {
    const owner = await person(browser, 'wrongowner')
    const stranger = await person(browser, 'wrongstranger')
    const world = await universe(owner.page)
    const invited = `${unique('wronginvited')}@example.test`
    const { claimToken } = await invite(owner.page, world.id, invited, Role.Editor)

    await stranger.page.goto(`/invite/${claimToken}`)
    await expect(stranger.page.getByRole('heading', { level: 1 })).toHaveText(
      'This invitation is for a different account.',
    )
    await expect(stranger.page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(stranger.page.getByTestId('invitation-accept')).toHaveCount(0)
    const body = await stranger.page.locator('body').innerText()
    for (const secret of [world.name, invited, 'Editor', owner.username]) {
      expect(body).not.toContain(secret)
    }
    await stranger.page.getByTestId('invitation-workspace-link').click()
    await expect(stranger.page).toHaveURL('/app')

    await owner.context.close()
    await stranger.context.close()
  })

  test('the owner changes a collaborator role and removes them, asking first', async ({
    browser,
  }) => {
    const owner = await person(browser, 'manageowner')
    const ana = await person(browser, 'manageana')
    const world = await universe(owner.page)
    await share(owner.page, world.id, ana, Role.Editor)

    await owner.page.goto(`/app/universes/${world.id}/settings?tab=collaborators`)
    const member = owner.page.getByTestId('collaborator-row').filter({ hasText: ana.username })
    await expect(member).toContainText('Joined')
    await member.getByLabel(`Role for ${ana.username}`).selectOption({ label: 'Viewer' })
    await expect(owner.page.getByTestId('collaborators-announcer')).toContainText(
      `${ana.username} is now Viewer.`,
    )

    // The change holds on Ana's next request.
    await ana.page.goto(`/app/universes/${world.id}`)
    await expect(ana.page.getByTestId('workspace-role')).toHaveText('Shared · Viewer')

    await member.getByRole('button', { name: `Remove ${ana.username}` }).click()
    const confirm = owner.page.getByTestId('remove-collaborator-confirm')
    await expect(confirm).toBeFocused()
    await expect(confirm).toContainText('Nothing they wrote, changed or trashed is undone')
    await confirm.getByRole('button', { name: 'Keep' }).click()
    await expect(member.getByRole('button', { name: `Remove ${ana.username}` })).toBeFocused()

    await member.getByRole('button', { name: `Remove ${ana.username}` }).click()
    await owner.page.getByTestId('confirm-remove-collaborator').click()
    await expect(owner.page.getByTestId('collaborator-row')).toHaveCount(0)
    await expect(owner.page.getByTestId('collaborators-empty')).toBeVisible()

    await ana.page.reload()
    await expect(ana.page.getByTestId('universe-missing')).toBeVisible()

    await owner.context.close()
    await ana.context.close()
  })
})

test.describe('an Editor restores from the Trash', () => {
  test('something the owner had selected for publication comes back private, without a question', async ({
    browser,
  }) => {
    const owner = await person(browser, 'restoreowner')
    const editor = await person(browser, 'restoreeditor')
    const world = await universe(owner.page)
    await share(owner.page, world.id, editor, Role.Editor)
    const selected = await entry(owner.page, world.id, 'Selected Heir')
    const u = `/api/universes/${world.id}`
    expect((await owner.page.request.post(`${u}/entities/${selected}/publish`)).ok()).toBe(true)
    expect((await owner.page.request.delete(`${u}/entities/${selected}`)).status()).toBe(204)

    await editor.page.goto(`/app/universes/${world.id}/trash`)
    await expect(
      editor.page.getByText('Restored items that were public will be restored privately.'),
    ).toBeVisible()
    await editor.page.getByTestId('restore-Selected Heir').click()

    // No publication question for someone who cannot publish: it is simply restored, private, and says so.
    await expect(editor.page.getByTestId('trash-publication-confirm')).toHaveCount(0)
    await expect(editor.page.getByTestId('trash-message')).toContainText('restored privately')
    const state = (await (
      await owner.page.request.get(`${u}/entities/${selected}/publication`)
    ).json()) as {
      visibility: number
    }
    expect(state.visibility).toBe(0)

    // The owner's own restore still asks, as it always has.
    expect((await owner.page.request.post(`${u}/entities/${selected}/publish`)).ok()).toBe(true)
    expect((await owner.page.request.delete(`${u}/entities/${selected}`)).status()).toBe(204)
    await owner.page.goto(`/app/universes/${world.id}/trash`)
    await owner.page.getByTestId('restore-Selected Heir').click()
    await expect(owner.page.getByTestId('trash-publication-confirm')).toBeVisible()
    await expect(owner.page.getByTestId('trash-confirm-private')).toBeVisible()

    await owner.context.close()
    await editor.context.close()
  })
})

test.describe('each role is shown what it can do', () => {
  test('owner, Editor, Reviewer and Viewer', async ({ browser }) => {
    // Four accounts and every section of a universe, walked once each: longer than one screen's test.
    test.setTimeout(120_000)
    const owner = await person(browser, 'roleowner')
    const editor = await person(browser, 'roleeditor')
    const reviewer = await person(browser, 'rolereviewer')
    const viewer = await person(browser, 'roleviewer')
    const world = await universe(owner.page)
    const kept = await entry(owner.page, world.id, 'Kept Heir')
    const binned = await entry(owner.page, world.id, 'Binned Heir')
    expect(
      (await owner.page.request.delete(`/api/universes/${world.id}/entities/${binned}`)).status(),
    ).toBe(204)
    await share(owner.page, world.id, editor, Role.Editor)
    await share(owner.page, world.id, reviewer, Role.Reviewer)
    await share(owner.page, world.id, viewer, Role.Viewer)

    const base = `/app/universes/${world.id}`
    const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Universe' })

    // The owner: everything as it was.
    await owner.page.goto(base)
    for (const section of ['Trash', 'Publish', 'Settings', 'Ideas']) {
      await expect(sidebar(owner.page).getByRole('link', { name: section })).toBeVisible()
    }
    await expect(owner.page.getByTestId('workspace-role')).toHaveCount(0)
    await owner.page.goto(`${base}/trash`)
    await expect(owner.page.getByTestId('erase-Binned Heir')).toBeVisible()
    await expect(owner.page.getByTestId('trash-select')).toBeVisible()

    // The Editor: every creative control, the Trash without erasing, history - no Publish, no Settings.
    await editor.page.goto(base)
    await expect(sidebar(editor.page).getByRole('link', { name: 'Trash' })).toBeVisible()
    for (const section of ['Publish', 'Settings', 'Ideas']) {
      await expect(sidebar(editor.page).getByRole('link', { name: section })).toHaveCount(0)
    }
    await editor.page.goto(`${base}/lore/${kept}`)
    await expect(editor.page.getByTestId('edit-entity')).toBeVisible()
    await editor.page.getByTestId('entity-actions').click()
    await expect(editor.page.getByTestId('duplicate-entity')).toBeVisible()
    await editor.page.keyboard.press('Escape')
    await expect(editor.page.getByTestId('entry-view-history')).toBeVisible()
    await expect(editor.page.getByTestId('entry-publication-state')).toHaveCount(0)
    await editor.page.goto(`${base}/trash`)
    const row = editor.page
      .getByTestId('trash-list')
      .locator('li')
      .filter({ hasText: 'Binned Heir' })
    await expect(editor.page.getByTestId('erase-Binned Heir')).toHaveCount(0)
    await expect(editor.page.getByTestId('trash-select')).toHaveCount(0)
    await expect(
      editor.page.getByText('Only the owner can delete anything permanently.'),
    ).toBeVisible()
    await row.getByTestId('restore-Binned Heir').click()
    await expect(editor.page.getByTestId('trash-list').locator('li')).toHaveCount(0)
    await editor.page.goto(`${base}/settings`)
    await expect(editor.page.getByTestId('role-unavailable')).toBeVisible()
    await expect(editor.page.getByTestId('export-universe')).toHaveCount(0)
    await editor.page.goto(`${base}/publish`)
    await expect(editor.page.getByTestId('role-unavailable')).toBeVisible()

    // A Reviewer and a Viewer read everything and are offered nothing to change.
    for (const reader of [reviewer, viewer]) {
      const page = reader.page
      await page.goto(base)
      for (const section of ['Trash', 'Publish', 'Settings', 'Ideas']) {
        await expect(sidebar(page).getByRole('link', { name: section })).toHaveCount(0)
      }
      for (const section of [
        'Lore',
        'Timeline',
        'Chronology',
        'World Rules',
        'Stories',
        'Canon',
        'Types',
      ]) {
        await expect(sidebar(page).getByRole('link', { name: section })).toBeVisible()
      }

      await page.goto(`${base}/lore?type=${await characterType(page, world.id)}`)
      await expect(page.getByTestId('entity-grid')).toContainText('Kept Heir')
      await expect(page.getByTestId('new-entity')).toHaveCount(0)
      await expect(page.getByTestId('mass-create')).toHaveCount(0)
      await expect(page.getByTestId('lore-select')).toHaveCount(0)

      await page.goto(`${base}/lore/${kept}`)
      await expect(page.getByRole('heading', { name: 'Kept Heir' })).toBeVisible()
      await expect(page.getByTestId('entry-canon-status')).toHaveText('Canon')
      for (const id of [
        'edit-entity',
        'entity-actions',
        'entry-view-history',
        'article-write',
        'article-edit',
      ]) {
        await expect(page.getByTestId(id)).toHaveCount(0)
      }

      for (const [path, control] of [
        ['timeline', 'new-moment'],
        ['world-rules', 'new-world-rule'],
        ['stories', 'new-story'],
        ['canon', 'evaluate-canon'],
        ['types', 'new-type'],
      ]) {
        await page.goto(`${base}/${path}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByTestId(control)).toHaveCount(0)
      }
      await page.goto(`${base}/chronology`)
      await expect(page.getByTestId('chronology-empty')).toBeVisible()
      await expect(page.getByTestId('add-era')).toHaveCount(0)

      for (const path of ['trash', 'settings', 'publish', 'lore/new', 'ideas']) {
        await page.goto(`${base}/${path}`)
        await expect(page.getByTestId('role-unavailable')).toBeVisible()
      }
    }

    for (const person of [owner, editor, reviewer, viewer]) await person.context.close()
  })
})

test.describe('who saved each version', () => {
  test('history names the owner and the Editor alike, for both of them, and says when no one was recorded', async ({
    browser,
  }) => {
    const owner = await person(browser, 'attribowner')
    const editor = await person(browser, 'attribeditor')
    const world = await universe(owner.page)
    await share(owner.page, world.id, editor, Role.Editor)
    const id = await entry(owner.page, world.id, 'Ember Vale')
    const entity = `/api/universes/${world.id}/entities/${id}`

    // The owner wrote the entry and the article's first version; the Editor changed both.
    const edited = await editor.page.request.put(entity, {
      data: {
        entityTypeId: await characterType(editor.page, world.id),
        name: 'Ember Vale',
        summary: 'Edited by the Editor.',
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
        expectedVersion: (
          (await (await editor.page.request.get(entity)).json()) as { version: number }
        ).version,
      },
    })
    expect(edited.ok()).toBe(true)
    const doc = (text: string) =>
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })
    const first = await owner.page.request.put(`${entity}/article`, {
      data: { content: doc('By the owner.'), expectedVersion: 0 },
    })
    expect(first.ok()).toBe(true)
    const second = await editor.page.request.put(`${entity}/article`, {
      data: {
        content: doc('By the Editor.'),
        expectedVersion: ((await first.json()) as { version: number }).version,
      },
    })
    expect(second.ok()).toBe(true)

    const entryPage = `/app/universes/${world.id}/lore/${id}`
    const row = (page: Page, list: string, number: number) =>
      page
        .locator(`[data-testid="${list}"] [data-version="${number}"]`)
        .getByTestId('version-actor')

    for (const reader of [owner, editor]) {
      const page = reader.page
      await page.goto(`${entryPage}/history`)
      await expect(row(page, 'history-list', 2)).toHaveText(`by ${editor.username}`)
      await expect(row(page, 'history-list', 1)).toHaveText(`by ${owner.username}`)

      await page.goto(entryPage)
      await page.getByTestId('article-history-toggle').click()
      await expect(row(page, 'article-history-list', 2)).toHaveText(`by ${editor.username}`)
      await expect(row(page, 'article-history-list', 1)).toHaveText(`by ${owner.username}`)

      // Nothing else of either account is on the page.
      for (const email of [owner.email, editor.email]) {
        await expect(page.getByText(email)).toHaveCount(0)
      }
    }

    // A version saved before authors were kept reads plainly, and still opens.
    await owner.page.route('**/revisions', async (route) => {
      const response = await route.fetch()
      const versions = (await response.json()) as { actorName: string | null }[]
      await route.fulfill({
        response,
        json: versions.map((version) => ({ ...version, actorName: null })),
      })
    })
    await owner.page.goto(`${entryPage}/history`)
    await expect(row(owner.page, 'history-list', 1)).toHaveText('author not recorded')
    await owner.page
      .locator('[data-testid="history-list"] [data-version="1"]')
      .getByTestId('version-view')
      .click()
    await expect(owner.page.getByTestId('version-snapshot')).toContainText('Ember Vale')

    for (const person of [owner, editor]) await person.context.close()
  })
})

test.describe('collaboration on a phone', () => {
  for (const width of [640, 390, 360]) {
    test(`Collaborators, an invitation and a shared card at ${width}px`, async ({ browser }) => {
      const owner = await person(browser, 'phoneowner')
      const ana = await person(browser, 'phoneana')
      const world = await universe(owner.page)
      await share(owner.page, world.id, ana, Role.Editor)
      const long = `${unique('a-very-long-invited-address-that-keeps-going-')}.and-going@an-equally-long-domain-name.example.test`
      const { claimToken } = await invite(owner.page, world.id, long, Role.Viewer)

      await owner.page.setViewportSize({ width, height: 800 })
      await owner.page.goto(`/app/universes/${world.id}/settings?tab=collaborators`)
      const pending = owner.page.getByTestId('pending-invitation-row')
      await expect(pending).toContainText(long)
      expect(await sideways(owner.page)).toBeLessThanOrEqual(1)

      // The row's controls are all reachable and usable at this width.
      await pending.getByLabel(`Role for ${long}`).selectOption({ label: 'Reviewer' })
      await expect(owner.page.getByTestId('collaborators-announcer')).toContainText(
        'now for Reviewer',
      )
      const member = owner.page.getByTestId('collaborator-row').filter({ hasText: ana.username })
      await member.getByRole('button', { name: `Remove ${ana.username}` }).scrollIntoViewIfNeeded()
      await expect(member.getByRole('button', { name: `Remove ${ana.username}` })).toBeInViewport({
        ratio: 1,
      })
      await expect(pending.getByTestId('revoke-invitation')).toBeVisible()
      for (const control of [
        pending.getByTestId('revoke-invitation'),
        pending.getByTestId('copy-invite-link'),
        member.getByTestId('collaborator-role'),
      ]) {
        const box = (await control.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }

      // Another invitation, on the invitee's phone.
      await post(owner.page, `/api/universes/${(await universe(owner.page)).id}/invitations`, {
        email: ana.email,
        role: Role.Viewer,
      })
      await ana.page.setViewportSize({ width, height: 800 })
      await ana.page.goto('/app')
      await expect(ana.page.getByTestId('received-invitation')).toBeVisible()
      await expect(ana.page.getByTestId('accept-invitation')).toBeInViewport()
      const card = ana.page.locator(
        `[data-testid="universe-card"][data-universe-name="${world.name}"]`,
      )
      await expect(card.getByTestId('universe-card-role')).toBeVisible()
      expect(await sideways(ana.page)).toBeLessThanOrEqual(1)

      // The link's page on a phone, as someone else.
      await ana.page.goto(`/invite/${claimToken}`)
      await expect(ana.page.getByRole('heading', { level: 1 })).toHaveText(
        'This invitation is for a different account.',
      )
      expect(await sideways(ana.page)).toBeLessThanOrEqual(1)

      await owner.context.close()
      await ana.context.close()
    })
  }
})

async function characterType(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as {
    id: string
    name: string
  }[]
  return types.find((type) => type.name === 'Character')!.id
}
