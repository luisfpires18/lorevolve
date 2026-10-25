import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Connecting an AI app over MCP (ADR 0046), in a real browser: Connect to AI gives the URL to copy, an app's
 * authorization request lands on the consent screen, Approve and Deny each go back to the app, the code becomes a token
 * that reads through the real MCP endpoint, and Profile -> Connected apps lists and disconnects it. The "AI app" is the
 * test itself: it registers like an MCP client (DCR), runs PKCE, and its loopback callback is caught by the test.
 */

const CALLBACK = 'http://127.0.0.1:7777/callback'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('connector')
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

async function newUniverse(page: Page, name = unique('Connected ')) {
  const response = await page.request.post('/api/universes', {
    data: { name, description: null, accentColor: null },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: string; name: string }
}

/** An MCP client's dynamic registration, with a loopback callback the test catches. */
async function registerClient(request: APIRequestContext, name = 'E2E MCP client') {
  const response = await request.post('/oauth/register', {
    data: { client_name: name, redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as { client_id: string }).client_id
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function authorizeUrl(clientId: string, resource: string, challenge: string, state = 'e2e-state') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: 'lorex.read offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
  })
  return `/oauth/authorize?${params.toString()}`
}

/**
 * Where the browser was sent back to the app. Nothing listens on the app's loopback port - the test is the app - so the
 * request itself is what is read: a redirect's target is not something a route handler is given.
 */
function callback(page: Page) {
  return page
    .waitForRequest((request) => request.url().startsWith(CALLBACK))
    .then((request) => new URL(request.url()))
}

async function mcpUrlOf(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/mcp`)
  return ((await response.json()) as { mcpUrl: string }).mcpUrl
}

async function listTools(request: APIRequestContext, universeId: string, token: string) {
  return request.post(`/mcp/universes/${universeId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  })
}

async function hasSideScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test.describe('Connect to AI', () => {
  test('shows the universe URL, copies it, and explains the connection', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    const universe = await newUniverse(page)
    await page.goto(`/app/universes/${universe.id}`)

    await page.getByRole('button', { name: 'Connect to AI' }).click()
    const drawer = page.getByTestId('connect-ai-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: universe.name })).toBeVisible()

    const url = page.getByTestId('connect-ai-url')
    // The friendly address (ADR 0062): the universe's name made readable, and a random suffix.
    await expect(url).toHaveValue(/\/mcp\/u\/[a-z0-9]+(-[a-z0-9]+)*$/)
    await expect(url).toHaveValue(await mcpUrlOf(page, universe.id))
    await expect(drawer).toContainText('can’t create, edit or delete anything')
    await expect(drawer).toContainText('sign in to LoreX')

    await page.getByTestId('connect-ai-copy').click()
    await expect(page.getByTestId('connect-ai-copy-status')).toHaveText('URL copied.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await url.inputValue())

    // Keyboard: Escape closes it and gives the focus back to the button that opened it.
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('button', { name: 'Connect to AI' })).toBeFocused()

    // The way to disconnect leads to the Profile's section.
    await page.getByRole('button', { name: 'Connect to AI' }).click()
    await page.getByTestId('connect-ai-manage').click()
    await page.waitForURL('/app/profile#connected-apps')
    await expect(page.getByTestId('connected-apps-empty')).toBeVisible()
  })

  test('fits a phone, and leaves the search bar its width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signUp(page)
    const universe = await newUniverse(page)
    await page.goto(`/app/universes/${universe.id}`)

    const trigger = page.getByTestId('connect-ai-trigger')
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAccessibleName('Connect to AI')
    expect(await hasSideScroll(page)).toBe(false)
    await trigger.click()
    await expect(page.getByTestId('connect-ai-url')).toBeVisible()
    expect(await hasSideScroll(page)).toBe(false)
  })
})

test.describe('Consent and connected apps', () => {
  test('approving connects the app, which reads through MCP until it is disconnected', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await newUniverse(page)
    const resource = await mcpUrlOf(page, universe.id)
    const clientId = await registerClient(page.request)
    const { verifier, challenge } = pkce()

    await page.goto(authorizeUrl(clientId, resource, challenge))
    await page.waitForURL(/\/connect\/authorize\?/)

    const details = page.getByTestId('consent-details')
    await expect(page.getByTestId('consent-app')).toHaveText('E2E MCP client')
    await expect(page.getByTestId('consent-unverified')).toBeVisible()
    await expect(page.getByTestId('consent-loopback')).toBeVisible()
    await expect(page.getByTestId('consent-return')).toContainText('127.0.0.1')
    await expect(page.getByTestId('consent-universe')).toHaveText(universe.name)
    await expect(page.getByTestId('consent-scope')).toContainText('Scenes and their manuscripts')
    await expect(details).toContainText('AI service behind it')
    await expect(details).toContainText('context')

    // Keyboard: the decision is reachable and taken with Enter.
    const returned = callback(page)
    await page.getByTestId('consent-approve').focus()
    await page.keyboard.press('Enter')

    const answer = await returned
    expect(answer.searchParams.get('state')).toBe('e2e-state')
    const code = answer.searchParams.get('code')
    expect(code).toBeTruthy()

    const token = await page.request.post('/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code!,
        code_verifier: verifier,
        redirect_uri: CALLBACK,
        resource,
      },
    })
    expect(token.status()).toBe(200)
    const { access_token: accessToken } = (await token.json()) as { access_token: string }

    const tools = await listTools(page.request, universe.id, accessToken)
    expect(tools.status()).toBe(200)
    expect(await tools.text()).toContain('search_universe')

    // This tab went off to the app's address, where nothing listens; the Profile is read in another.
    const profile = await page.context().newPage()
    await profile.goto('/app/profile#connected-apps')
    const row = profile.getByTestId('connected-app')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('E2E MCP client')
    await expect(row).toContainText('Unverified app')
    await expect(row).toContainText(universe.name)
    await expect(row.getByTestId('connected-app-status')).toHaveText('Connected')

    await row.getByTestId('disconnect-app').click()
    await expect(profile.getByTestId('disconnect-app-confirm')).toBeFocused()
    await profile.getByTestId('confirm-disconnect-app').click()
    await expect(profile.getByTestId('connected-app')).toHaveCount(0)
    await expect(profile.getByTestId('connected-apps-announcer')).toContainText('disconnected')

    expect((await listTools(profile.request, universe.id, accessToken)).status()).toBe(401)

    // Disconnecting the app did not sign anyone out of LoreX.
    expect((await profile.request.get('/api/auth/me')).status()).toBe(200)
  })

  test('a post that rides the session without the consent token decides nothing', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await newUniverse(page)
    const clientId = await registerClient(page.request)
    const { challenge } = pkce()
    const params = new URL(
      authorizeUrl(clientId, await mcpUrlOf(page, universe.id), challenge),
      'http://localhost',
    ).searchParams
    const left: string[] = []
    page.on('request', (request) => {
      if (request.url().startsWith(CALLBACK)) left.push(request.url())
    })

    // A forged same-site form: the browser sends the session cookie, but the page never read the consent token.
    await page.goto('/app')
    await page.evaluate(
      (fields) => {
        const form = document.createElement('form')
        form.method = 'post'
        form.action = '/oauth/authorize'
        for (const [name, value] of [...fields, ['lorex_decision', 'approve']]) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = name
          input.value = value
          form.append(input)
        }
        document.body.append(form)
        form.submit()
      },
      [...params.entries()],
    )

    await page.waitForURL(/\/connect\/authorize\?/)
    await expect(page.getByTestId('consent-approve')).toBeVisible()
    expect(left).toEqual([])
    const apps = await page.request.get('/api/profile/connected-apps')
    expect(await apps.json()).toEqual([])
  })

  test('denying sends the app away with nothing', async ({ page }) => {
    await signUp(page)
    const universe = await newUniverse(page)
    const clientId = await registerClient(page.request)
    const { challenge } = pkce()

    await page.goto(
      authorizeUrl(clientId, await mcpUrlOf(page, universe.id), challenge, 'deny-state'),
    )
    const returned = callback(page)
    await page.getByTestId('consent-deny').click()

    const answer = await returned
    expect(answer.searchParams.get('error')).toBe('access_denied')
    expect(answer.searchParams.get('state')).toBe('deny-state')
    expect(answer.searchParams.get('code')).toBeNull()

    // This tab went off to the app's address, where nothing listens; the Profile is read in another.
    const profile = await page.context().newPage()
    await profile.goto('/app/profile')
    await expect(profile.getByTestId('connected-apps-empty')).toBeVisible()
  })

  test('a signed-out person signs in and comes back to the same request', async ({
    page,
    browser,
  }) => {
    const { username, password } = await signUp(page)
    const universe = await newUniverse(page)
    const resource = await mcpUrlOf(page, universe.id)
    const clientId = await registerClient(page.request)
    const { challenge } = pkce()

    const fresh = await browser.newContext()
    const visitor = await fresh.newPage()
    await visitor.goto(authorizeUrl(clientId, resource, challenge))
    await visitor.waitForURL('/login')
    await visitor.getByLabel('Username or email').fill(username)
    await visitor.getByLabel('Password').fill(password)
    await visitor.getByRole('button', { name: 'Sign in' }).click()

    await visitor.waitForURL(/\/connect\/authorize\?/)
    await expect(visitor.getByTestId('consent-universe')).toHaveText(universe.name)
    expect(new URL(visitor.url()).searchParams.get('client_id')).toBe(clientId)
    await fresh.close()
  })

  test('a request for a universe the person cannot read offers only going back', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const universe = await newUniverse(page)
    const resource = await mcpUrlOf(page, universe.id)
    const clientId = await registerClient(page.request)
    const { challenge } = pkce()

    const fresh = await browser.newContext()
    const outsider = await fresh.newPage()
    await signUp(outsider)
    await outsider.goto(authorizeUrl(clientId, resource, challenge))
    await expect(outsider.getByTestId('consent-no-access')).toBeVisible()
    await expect(outsider.getByTestId('consent-approve')).toHaveCount(0)
    await expect(outsider.getByTestId('consent-deny')).toHaveText('Go back to the app')
    await fresh.close()
  })

  test('the consent screen fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signUp(page)
    const universe = await newUniverse(page)
    const clientId = await registerClient(
      page.request,
      'An app with a rather long name for a small screen',
    )
    const { challenge } = pkce()

    await page.goto(authorizeUrl(clientId, await mcpUrlOf(page, universe.id), challenge))
    await expect(page.getByTestId('consent-approve')).toBeVisible()
    expect(await hasSideScroll(page)).toBe(false)
  })

  // Issue 38: a compact card, centred, with the decision on screen - not the sign-in plate with its artwork.
  test('the consent screen is a centred card whose decision is on screen at desktop sizes', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await newUniverse(page)
    const clientId = await registerClient(page.request)
    const { challenge } = pkce()
    await page.goto(authorizeUrl(clientId, await mcpUrlOf(page, universe.id), challenge))
    await expect(page.getByTestId('consent-approve')).toBeVisible()
    await expect(page.locator('.auth__plate')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connect an AI app')

    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height })
      const card = (await page.getByTestId('consent-card').boundingBox())!
      const left = card.x
      const right = width - (card.x + card.width)
      expect(Math.abs(left - right), `centred at ${width}x${height}`).toBeLessThan(2)
      expect(card.width, `compact at ${width}x${height}`).toBeLessThanOrEqual(520)
      await expect(page.getByTestId('consent-approve')).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('consent-deny')).toBeInViewport({ ratio: 1 })
      expect(await hasSideScroll(page)).toBe(false)

      // The gist is on screen before the decision, even in this request's long case (unverified and loopback): who,
      // which universe, read-only, manuscripts, and where the content goes - none of it under the pinned buttons.
      const summary = page.getByTestId('consent-summary')
      await expect(summary).toContainText('read-only')
      await expect(summary).toContainText('manuscripts')
      await expect(summary).toContainText('AI service behind it')
      const actionsTop = (await page.locator('.consent__actions').boundingBox())!.y
      for (const id of [
        'consent-summary',
        'consent-app',
        'consent-unverified',
        'consent-universe',
      ]) {
        await expect(page.getByTestId(id), `${id} at ${width}x${height}`).toBeInViewport({
          ratio: 1,
        })
        const box = (await page.getByTestId(id).boundingBox())!
        expect(
          box.y + box.height,
          `${id} above the actions at ${width}x${height}`,
        ).toBeLessThanOrEqual(actionsTop)
      }
    }
  })

  test('long names wrap on a narrow phone in both themes, and nothing is lost', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await newUniverse(
      page,
      `${unique('Universe')}${'Averyverylongname'.repeat(5)}`,
    )
    const clientId = await registerClient(
      page.request,
      `An app named ${'Unbrokenwordwithoutanyspaces'.repeat(2)}`,
    )
    const { challenge } = pkce()
    const url = authorizeUrl(clientId, await mcpUrlOf(page, universe.id), challenge)

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.evaluate((theme) => localStorage.setItem('lorex-theme', theme), colorScheme)
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 700 })
        await page.goto(url)
        await expect(page.getByTestId('consent-universe')).toHaveText(universe.name)
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
        expect(await hasSideScroll(page), `${width}px ${colorScheme}`).toBe(false)
        for (const id of ['consent-app', 'consent-universe']) {
          const box = (await page.getByTestId(id).boundingBox())!
          expect(box.x + box.width, `${id} at ${width}px`).toBeLessThanOrEqual(width)
        }
        await expect(page.getByTestId('consent-unverified')).toBeVisible()
        await expect(page.getByTestId('consent-scope')).toContainText(
          'Scenes and their manuscripts',
        )
        await expect(page.getByTestId('consent-details')).toContainText('AI service behind it')
        // Pinned to the foot of the screen while the request scrolls past.
        await expect(page.getByTestId('consent-approve')).toBeInViewport({ ratio: 1 })
        await expect(page.getByTestId('consent-deny')).toBeInViewport({ ratio: 1 })
      }
    }
  })
})
