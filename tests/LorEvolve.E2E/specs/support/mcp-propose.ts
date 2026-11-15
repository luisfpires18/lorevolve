import { createHash, randomBytes } from 'node:crypto'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Staging AI changes the way the only AI entry point left does it: an outside app over MCP (ADR 0046, 0047).
 *
 * The legacy web assistant was the other entry point and the one the proposal specs used to click (M4, issue #157).
 * It is gone, so these helpers put a proposal into Pending AI Changes over the real connection instead: dynamic client
 * registration, PKCE, the person ticking "propose changes" on the consent screen, the code exchange, and then JSON-RPC
 * `tools/call` against the universe's MCP endpoint. Nothing here reaches a model, and nothing here applies a change:
 * the proposal waits for the person to review it, which is what the specs then drive.
 *
 * The operations are the specs' own, in the same shape an AI app sends (`AiChangeOperationInput`), each with the change
 * id the review page shows as its key.
 */

/** Nothing listens here: the authorization code is read off the redirect, as an app's own callback would receive it. */
const CALLBACK = 'http://127.0.0.1:7795/callback'

export type ProposingApp = {
  readonly universeId: string
  /** The universe's MCP endpoint, as a path this origin serves. */
  readonly mcpPath: string
  /** The resource the token was issued for: the MCP endpoint's absolute address. */
  readonly resource: string
  readonly token: string
  readonly clientName: string
}

/** What `get_change_options` says can be proposed here, as much of it as these helpers need. */
export type ChangeOptions = {
  readonly allowed: string[]
  readonly loreTypes: { id: string; name: string; fields: { id: string; required: boolean }[] }[]
  readonly relationshipTypes: { id: string; name: string }[]
  readonly stories: { id: string; title: string }[]
}

type Operation = Record<string, unknown> & { id: string }

/**
 * Registers an app and opens this universe's consent screen for the person signed in on `page`, asking to read and to
 * propose. It stops there: nothing is approved, so a test can read what the screen offers this person's role.
 */
export async function openConsent(page: Page, universeId: string, clientName = 'E2E staging app') {
  const connect = await page.request.get(`/api/universes/${universeId}/mcp`)
  expect(connect.ok(), `GET /api/universes/${universeId}/mcp answered ${connect.status()}`).toBe(
    true,
  )
  const resource = ((await connect.json()) as { mcpUrl: string }).mcpUrl

  const registered = await page.request.post('/oauth/register', {
    data: {
      client_name: clientName,
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: 'none',
    },
  })
  expect(registered.ok(), `POST /oauth/register answered ${registered.status()}`).toBe(true)
  const clientId = ((await registered.json()) as { client_id: string }).client_id

  const verifier = randomBytes(32).toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: 'lorevolve.read lorevolve.propose offline_access',
    state: 'e2e-stage',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource,
  })
  await page.goto(`/oauth/authorize?${params.toString()}`)
  await expect(page.getByTestId('consent-card')).toBeVisible()
  return { clientId, resource, verifier }
}

/**
 * Connects an AI app to one universe with proposals allowed, as the person signed in on `page` would: the consent
 * screen's "propose changes" is unticked by default, so this ticks it. Schema rides on proposing for an owner
 * (ADR 0062), so a proposal of lore types and fields needs no second choice.
 */
export async function connectProposingApp(
  page: Page,
  universeId: string,
  clientName = 'E2E staging app',
): Promise<ProposingApp> {
  const { clientId, resource, verifier } = await openConsent(page, universeId, clientName)
  const choice = page.getByTestId('consent-propose')
  await expect(choice).toBeVisible()
  await choice.check()
  const back = page.waitForRequest((request) => request.url().startsWith(CALLBACK))
  await page.getByTestId('consent-approve').click()
  const returned = await back
  const code = new URL(returned.url()).searchParams.get('code')
  expect(code, 'the consent screen returned an authorization code').toBeTruthy()
  // Nothing listens at the callback, so the browser is on its way to its own error page. Let it arrive before the next
  // address is asked for: a `goto` that starts first is cut short by it.
  await returned.response().catch(() => null)
  await page
    .waitForURL('chrome-error://chromewebdata/', { waitUntil: 'commit', timeout: 5_000 })
    .catch(() => undefined)

  const exchanged = await page.request.post('/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code!,
      code_verifier: verifier,
      redirect_uri: CALLBACK,
      resource,
    },
  })
  expect(exchanged.ok(), `POST /oauth/token answered ${exchanged.status()}`).toBe(true)
  const tokens = (await exchanged.json()) as { access_token: string; scope: string }
  expect(tokens.scope.split(' '), 'the connection may propose').toContain('lorevolve.propose')

  return {
    universeId,
    mcpPath: new URL(resource).pathname,
    resource,
    token: tokens.access_token,
    clientName,
  }
}

/** One JSON-RPC `tools/call`, as a Streamable HTTP client posts it; answers the tool's own JSON body. */
export async function callMcpTool<T>(
  request: APIRequestContext,
  app: ProposingApp,
  name: string,
  args: unknown,
): Promise<T> {
  const response = await request.post(app.mcpPath, {
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-11-25',
      Authorization: `Bearer ${app.token}`,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  expect(response.ok(), `${name} answered ${response.status()}`).toBe(true)
  const body = await response.text()
  // An MCP endpoint may answer either as JSON or as one server-sent event carrying the same message.
  const payload = (response.headers()['content-type'] ?? '').includes('text/event-stream')
    ? body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
    : body
  const message = JSON.parse(payload) as {
    result?: { isError?: boolean; content: { text: string }[] }
    error?: unknown
  }
  expect(message.error, `${name} failed: ${payload}`).toBeUndefined()
  const result = message.result!
  const text = result.content[0].text
  expect(result.isError ?? false, `${name} refused: ${text}`).toBe(false)
  return JSON.parse(text) as T
}

/** What this person may propose in this universe, and the ids to propose it with. */
export function changeOptions(
  request: APIRequestContext,
  app: ProposingApp,
  loreId?: string,
): Promise<ChangeOptions> {
  return callMcpTool<ChangeOptions>(request, app, 'get_change_options', loreId ? { loreId } : {})
}

/** The first lore type an entry can be created in without filling a required field. */
export function openType(options: ChangeOptions) {
  const type = options.loreTypes.find((candidate) => candidate.fields.every((f) => !f.required))
  expect(type, 'a lore type with no required fields').toBeTruthy()
  return type!.id
}

/**
 * Stages the operations for review and answers the proposal's id and the path the person reviews it at. Nothing in the
 * universe has changed when this returns.
 */
export async function stageProposal(
  request: APIRequestContext,
  app: ProposingApp,
  summary: string,
  operations: readonly Operation[],
) {
  const staged = await callMcpTool<{ proposalId: string; status: string; reviewUrl: string }>(
    request,
    app,
    'propose_changes',
    { summary, operations },
  )
  expect(staged.status).toBe('waiting_for_review')
  return { proposalId: staged.proposalId, reviewPath: new URL(staged.reviewUrl).pathname }
}

/** Connects an app, stages the operations and opens the review page, which is how most of these specs start. */
export async function stageAndReview(
  page: Page,
  universeId: string,
  summary: string,
  build: (
    options: ChangeOptions,
    app: ProposingApp,
  ) => readonly Operation[] | Promise<readonly Operation[]>,
) {
  const app = await connectProposingApp(page, universeId)
  const options = await changeOptions(page.request, app)
  const staged = await stageProposal(page.request, app, summary, await build(options, app))
  await page.goto(staged.reviewPath)
  await expect(page.getByTestId('ai-change')).toBeVisible()
  return { ...staged, app, options }
}
