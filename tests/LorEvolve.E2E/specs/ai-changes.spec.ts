import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { makeTestPassword } from './support/account'
import { dismissConfirm } from './support/confirm'

/**
 * Pending AI Changes (ADR 0047), on the local Fake provider: the Assistant asked, with Propose changes on, prepares changes
 * that wait for review; nothing exists until a person approves; choosing a change chooses what it needs; rejecting one
 * rejects what needs it; an edit is applied exactly; it works on a phone and from the keyboard; a Viewer is offered no
 * proposing; and an AI app's consent asks for proposing separately, unticked.
 *
 * The Fake stages one new entry for every name in double quotes and, for two or more, a relationship of the universe's
 * first kind from the first to the second. No real model is reached.
 */

const CALLBACK = 'http://127.0.0.1:7792/callback'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('reviewer')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  url: string,
  data?: unknown,
) {
  const response = await request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

async function seed(page: Page) {
  const universe = await api<{ id: string }>(page.request, 'POST', '/api/universes', {
    name: unique('Proposed '),
    description: null,
    accentColor: null,
  })
  await api(page.request, 'POST', `/api/universes/${universe.id}/relationship-types`, {
    name: 'Sworn to',
    inverseName: null,
    isSymmetric: true,
    description: null,
    displayOrder: null,
  })
  return universe.id
}

async function names(page: Page, universeId: string, search: string) {
  const found = await api<{ items: { name: string }[] }>(
    page.request,
    'GET',
    `/api/universes/${universeId}/entities?search=${encodeURIComponent(search)}`,
  )
  return found.items.map((item) => item.name)
}

/** Asks the Assistant, with Propose changes on, for one entry per quoted name; answers the review page's path. */
async function propose(page: Page, universeId: string, quoted: string[]) {
  await page.goto(`/app/universes/${universeId}`)
  await page.getByRole('button', { name: 'Assistant' }).click()
  const drawer = page.getByTestId('assistant-drawer')
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('Propose changes').check()
  await drawer
    .getByLabel('The changes you want')
    .fill(`Create ${quoted.map((name) => `"${name}"`).join(' and ')}.`)
  await drawer.getByTestId('assistant-ask').click()
  const review = drawer.getByTestId('assistant-proposal-review')
  await expect(review).toBeVisible()
  await expect(drawer.getByTestId('assistant-proposal')).toContainText('Nothing has changed yet')
  await review.click()
  await expect(page.getByTestId('ai-change')).toBeVisible()
}

/** A change by the Fake's own key: entry-1, entry-2 ... for the names in order, link-1 for the relationship. */
function item(page: Page, key: string) {
  return page.locator(`[data-testid="ai-change-item"][data-key="${key}"]`)
}

function checked(page: Page) {
  return page.locator('[data-testid="ai-change-select"]:checked')
}

async function hasSideScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test.describe('Pending AI Changes', () => {
  test('the Assistant prepares changes that wait, and approving applies them together', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const arin = unique('Arin ')
    const bel = unique('Bel ')
    await propose(page, universeId, [arin, bel])

    await expect(page.getByTestId('ai-change-source')).toHaveText('LorEvolve Assistant')
    await expect(page.getByTestId('ai-change-item')).toHaveCount(3)
    await expect(item(page, 'entry-1')).toContainText(`New Character: ${arin}`)
    await expect(item(page, 'link-1')).toContainText('Needs:')
    expect(await names(page, universeId, arin)).toEqual([])

    // Choosing the relationship chooses the two entries it needs.
    await item(page, 'link-1').getByTestId('ai-change-select').check()
    await expect(checked(page)).toHaveCount(3)

    // While the one request runs, a bar says how far it has got: checking first, then a count read from the server.
    // The request is held here and the count stood in for, so the in-between states can be seen at all.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/approve', async (route) => {
      await held
      await route.continue()
    })
    let count: { done: number; total: number } | null = null
    await page.route('**/approve/*/progress', (route) =>
      count
        ? route.fulfill({ json: count })
        : route.fulfill({ status: 404, json: { title: 'Not found' } }),
    )
    await page.getByTestId('ai-change-approve').click()
    const progress = page.getByTestId('ai-change-progress')
    await expect(progress).toContainText('Checking 3 changes')
    await expect(page.getByTestId('ai-change-approve')).toHaveText('Applying')
    count = { done: 2, total: 3 }
    await expect(progress).toContainText('2 of 3 applied')
    await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    release()

    await expect(page.getByTestId('ai-change-feedback')).toHaveText('3 changes were applied.')
    await expect(progress).toHaveCount(0)
    await page.unrouteAll()
    await expect(page.getByTestId('ai-change-status')).toHaveText('Approved')
    await expect(page.getByTestId('ai-change-outcome').first()).toContainText('Applied')
    expect(await names(page, universeId, arin)).toEqual([arin])

    await item(page, 'entry-1').getByTestId('ai-change-open-item').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(arin)
  })

  test('approving part of a proposal, and rejecting what a change needs, never leaves a link dangling', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const first = unique('Cara ')
    const second = unique('Dane ')
    await propose(page, universeId, [first, second])

    await item(page, 'entry-1').getByTestId('ai-change-select').check()
    await expect(checked(page)).toHaveCount(1)
    await page.getByTestId('ai-change-approve').click()
    await expect(page.getByTestId('ai-change-feedback')).toHaveText('1 change was applied.')
    await expect(page.getByTestId('ai-change-status')).toHaveText('Waiting for review')

    await item(page, 'entry-2').getByTestId('ai-change-select').check()
    await page.getByTestId('ai-change-reject').click()
    await expect(page.getByTestId('ai-change-feedback')).toHaveText(
      'Rejected. Nothing was applied.',
    )
    await expect(item(page, 'link-1').getByTestId('ai-change-outcome')).toContainText('Rejected')
    await expect(page.getByTestId('ai-change-status')).toHaveText('Partly approved')

    expect(await names(page, universeId, first)).toEqual([first])
    expect(await names(page, universeId, second)).toEqual([])
  })

  test('a reviewer edits a change before approving, and exactly the edit is applied', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const named = unique('Eda ')
    await propose(page, universeId, [named])

    const change = item(page, 'entry-1')
    await change.getByTestId('ai-change-edit').click()
    const renamed = unique('Edith ')
    await change.getByTestId('ai-change-edit-name').fill(renamed)
    await change.getByTestId('ai-change-edit-save').click()
    await expect(page.getByTestId('ai-change-feedback')).toContainText('Your edit was saved')
    await expect(item(page, 'entry-1')).toContainText(`New Character: ${renamed}`)

    await page.getByTestId('ai-change-select-all').click()
    await page.getByTestId('ai-change-approve').click()
    await expect(page.getByTestId('ai-change-feedback')).toHaveText('1 change was applied.')
    expect(await names(page, universeId, renamed)).toEqual([renamed])
    expect(await names(page, universeId, named)).toEqual([])
  })

  test('the review works on a phone, from the keyboard, in the dark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await signUp(page)
    const universeId = await seed(page)
    const one = unique('Fen ')
    const two = unique('Gil ')
    await propose(page, universeId, [one, two])

    expect(await hasSideScroll(page)).toBe(false)
    const box = item(page, 'link-1').getByTestId('ai-change-select')
    await box.focus()
    await page.keyboard.press('Space')
    await expect(checked(page)).toHaveCount(3)
    await page.getByTestId('ai-change-approve').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('ai-change-feedback')).toBeFocused()
    await expect(page.getByTestId('ai-change-feedback')).toHaveText('3 changes were applied.')
    expect(await hasSideScroll(page)).toBe(false)
  })

  test('proposals from every universe are listed together, and the workspace bar leaves them to each universe', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const name = unique('Hal ')
    await propose(page, universeId, [name])

    // AI changes is a universe's section, not a workspace tab; the account-wide list keeps its address.
    await page.goto('/app')
    await expect(
      page
        .getByRole('navigation', { name: 'My workspace' })
        .getByRole('link', { name: /AI Changes/ }),
    ).toHaveCount(0)
    await page.goto('/app/ai-changes')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pending AI Changes')
    await expect(page.getByTestId('ai-change-proposal')).toHaveCount(1)
    await expect(page.getByTestId('ai-change-source')).toHaveText('LorEvolve Assistant')

    // A proposal opened from the account-wide list goes back to that list.
    await page.getByTestId('ai-change-proposal').getByRole('link').first().click()
    await page.getByTestId('ai-change-back').click()
    await expect(page).toHaveURL(/\/app\/ai-changes$/)

    // The universe's own section lists it too.
    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-ai-changes').click()
    await expect(page.getByTestId('ai-change-proposal')).toHaveCount(1)
    await page.getByTestId('ai-change-proposal').getByRole('link').click()
    await page.getByTestId('ai-change-reject-all').click()
    await expect(page.getByTestId('ai-change-status')).toHaveText('Rejected')
  })

  test('an unsaved draft is never lost on the way to a review', async ({ page }) => {
    await signUp(page)
    const universeId = await seed(page)
    await page.goto(`/app/universes/${universeId}/lore/new`)
    await page.getByLabel('Name').fill('Half-written entry')
    await expect(page.getByTestId('entry-form-status')).toHaveText('Unsaved changes')

    await page.getByRole('button', { name: 'Assistant' }).click()
    const drawer = page.getByTestId('assistant-drawer')
    await drawer.getByLabel('Propose changes').check()
    await drawer.getByLabel('The changes you want').fill(`Create "${unique('Ivo ')}".`)
    await drawer.getByTestId('assistant-ask').click()
    await expect(drawer.getByTestId('assistant-proposal-review')).toBeVisible()

    // Following the review link asks first, and staying keeps the draft exactly as it was.
    await drawer.getByTestId('assistant-proposal-review').click()
    await dismissConfirm(page)
    await expect(page).toHaveURL(new RegExp(`/app/universes/${universeId}/lore/new$`))
    await expect(page.getByLabel('Name')).toHaveValue('Half-written entry')
  })

  test('a viewer is offered no proposing and no AI changes section; a reviewer is offered the section', async ({
    browser,
  }) => {
    const owner = await newPerson(browser, 'aiowner')
    const viewer = await newPerson(browser, 'aiviewer')
    const reviewer = await newPerson(browser, 'aireviewer')
    const universeId = await seed(owner.page)
    for (const [person, role] of [
      [viewer, 1],
      [reviewer, 2],
    ] as const) {
      const invitation = await api<{ claimToken: string }>(
        owner.page.request,
        'POST',
        `/api/universes/${universeId}/invitations`,
        { email: person.email, role },
      )
      expect(
        (
          await person.page.request.post(
            `/api/invitations/claim/${encodeURIComponent(invitation.claimToken)}/accept`,
          )
        ).ok(),
      ).toBe(true)
    }

    // A reviewer may suggest changes, so AI Changes is offered; Trash needs more than a reviewer has.
    await reviewer.page.goto(`/app/universes/${universeId}`)
    const reviewerSections = reviewer.page.getByRole('navigation', {
      name: 'Universe',
      exact: true,
    })
    await expect(reviewerSections.getByRole('link')).toContainText(['Types', 'AI Changes'])
    await expect(reviewer.page.getByTestId('workspace-trash')).toHaveCount(0)

    // The sections are on screen before the absence is read, so it is not the empty sidebar of a page still loading.
    await viewer.page.goto(`/app/universes/${universeId}`)
    await expect(viewer.page.getByTestId('workspace-types')).toBeVisible()
    await expect(viewer.page.getByTestId('workspace-ai-changes')).toHaveCount(0)
    await viewer.page.getByRole('button', { name: 'Assistant' }).click()
    await expect(viewer.page.getByTestId('assistant-drawer')).toBeVisible()
    await expect(viewer.page.getByTestId('assistant-propose')).toHaveCount(0)
    await expect(
      viewer.page.getByText('It reads this universe and never changes it.'),
    ).toBeVisible()
  })

  test('an AI app asks to propose separately, unticked, and is read-only unless the person ticks it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const resource = (
      await api<{ mcpUrl: string }>(page.request, 'GET', `/api/universes/${universeId}/mcp`)
    ).mcpUrl
    const registered = await page.request.post('/oauth/register', {
      data: {
        client_name: 'E2E proposing client',
        redirect_uris: [CALLBACK],
        token_endpoint_auth_method: 'none',
      },
    })
    const clientId = ((await registered.json()) as { client_id: string }).client_id
    const verifier = randomBytes(32).toString('base64url')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CALLBACK,
      scope: 'lorevolve.read lorevolve.propose offline_access',
      state: 'e2e-propose',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource,
    })

    await page.goto(`/oauth/authorize?${params.toString()}`)
    const choice = page.getByTestId('consent-propose')
    await expect(choice).toBeVisible()
    await expect(choice).not.toBeChecked()
    await expect(page.getByTestId('consent-summary')).toContainText('read-only')

    await choice.check()
    const back = page.waitForRequest((request) => request.url().startsWith(CALLBACK))
    await page.getByTestId('consent-approve').click()
    const returned = await back
    const code = new URL(returned.url()).searchParams.get('code')!
    // Nothing listens at the callback, so the browser is on its way to its own error page. Let it arrive before the
    // next address is asked for: a `goto` that starts first is cut short by it.
    await returned.response().catch(() => null)
    await page
      .waitForURL('chrome-error://chromewebdata/', { waitUntil: 'commit', timeout: 5_000 })
      .catch(() => undefined)
    const token = await page.request.post('/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: CALLBACK,
        resource,
      },
    })
    expect(((await token.json()) as { scope: string }).scope.split(' ')).toContain(
      'lorevolve.propose',
    )

    // Connected apps says so, and turns it off without disconnecting.
    await page.goto('/app/profile?tab=connected-apps#connected-apps')
    const row = page.getByTestId('connected-app').filter({ hasText: 'E2E proposing client' })
    await expect(row).toContainText('Creator')
    await row.getByTestId('stop-app-proposals').click()
    await expect(row.getByTestId('app-proposals-stopped')).toBeVisible()
    await expect(row).toContainText('Reader: reads only')
  })
})

async function newPerson(browser: Browser, prefix: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = unique(prefix)
  const email = `${username}@example.test`
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { page, email }
}
