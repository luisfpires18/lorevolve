import { expect, test, type Browser, type Page } from '@playwright/test'
import { invite, PASSWORD, post, unique } from './support/trash'

/**
 * Issue #377: a Series', Film's or Comic's Script view lists every part of its structure beside the part's text, in
 * the Manuscript layout, and saves each part through the node's own route with the version it was read at.
 */

async function person(browser: Browser, prefix: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = unique(prefix)
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { context, page, email }
}

async function world(page: Page) {
  return post(page, '/api/universes', { name: unique('Scriptworld '), description: null })
}

async function newProject(page: Page, universeId: string, kind: number, format: string | null) {
  return post(page, '/api/projects', {
    name: unique('Script '),
    kind,
    lifecycle: 0,
    subtype: null,
    summary: null,
    universeId,
    expectedVersion: null,
    format,
  })
}

async function node(
  page: Page,
  projectId: string,
  level: string,
  title: string,
  parentId: string | null = null,
  summary: string | null = null,
) {
  return post(page, `/api/projects/${projectId}/structure`, { level, title, parentId, summary })
}

type Detail = {
  title: string | null
  summary: string | null
  body: string | null
  version: number
  dialogue: string | null
}

async function read(page: Page, projectId: string, nodeId: string) {
  const response = await page.request.get(`/api/projects/${projectId}/structure/${nodeId}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as Detail
}

const editor = (page: Page) => page.getByTestId('manuscript-editor')

test('a film lists its parts, and a part written and saved keeps its text after a reload', async ({
  browser,
}) => {
  const { page } = await person(browser, 'scriptwr')
  const universeId = await world(page)
  const film = await newProject(page, universeId, 3, 'short-film')
  await node(page, film, 'scene', 'Opening')
  const second = await node(page, film, 'scene', 'Harbour')
  const base = `/app/universes/${universeId}/projects/${film}/script`

  await page.goto(base)
  const parts = page.getByTestId('manuscript-outline-scene')
  await expect(parts).toHaveCount(2)
  // The first part is open by default.
  await expect(page.getByTestId('project-script-title')).toHaveText('Opening')

  await parts.filter({ hasText: 'Harbour' }).click()
  await expect(page).toHaveURL(new RegExp(`script\\?node=${second}$`))
  await expect(page.getByTestId('project-script-title')).toHaveText('Harbour')
  await editor(page).click()
  await page.keyboard.type('The boats come in at dawn.')
  await page.getByTestId('project-script-save').click()
  await expect(page.getByTestId('project-script-save')).toHaveAttribute('data-state', /saved|clean/)

  await page.reload()
  await expect(editor(page)).toContainText('The boats come in at dawn.')
  expect((await read(page, film, second)).body).toBe('The boats come in at dawn.')
})

test('a part changed elsewhere after it was opened is not overwritten', async ({ browser }) => {
  const { page } = await person(browser, 'scriptcf')
  const universeId = await world(page)
  const film = await newProject(page, universeId, 3, 'short-film')
  const scene = await node(page, film, 'scene', 'Opening')

  await page.goto(`/app/universes/${universeId}/projects/${film}/script?node=${scene}`)
  await expect(page.getByTestId('project-script-title')).toHaveText('Opening')
  await editor(page).click()
  await page.keyboard.type('Mine.')

  const stored = await read(page, film, scene)
  const changed = await page.request.put(`/api/projects/${film}/structure/${scene}`, {
    data: { title: 'Opening', summary: null, body: 'Theirs.', expectedVersion: stored.version },
  })
  expect(changed.ok()).toBe(true)

  await page.getByTestId('project-script-save').click()
  await expect(page.getByTestId('project-script-conflict')).toBeVisible()
  await expect(editor(page)).toContainText('Mine.')
  expect((await read(page, film, scene)).body).toBe('Theirs.')
})

test('a part that cannot be read offers Try again, which reads it', async ({ browser }) => {
  const { page } = await person(browser, 'scriptrt')
  const universeId = await world(page)
  const film = await newProject(page, universeId, 3, 'short-film')
  const scene = await node(page, film, 'scene', 'Opening')

  // Every read of the part fails until the server is back.
  let down = true
  await page.route(`**/api/projects/${film}/structure/${scene}`, (route) => {
    if (down && route.request().method() === 'GET') {
      return route.fulfill({ status: 500, body: '' })
    }
    return route.continue()
  })

  await page.goto(`/app/universes/${universeId}/projects/${film}/script?node=${scene}`)
  await expect(page.getByTestId('project-script-part-failed')).toBeVisible()
  down = false
  await page.getByTestId('project-script-part-retry').click()
  await expect(page.getByTestId('project-script-title')).toHaveText('Opening')
  await expect(page.getByTestId('project-script-part-failed')).toHaveCount(0)
})

test('a comic panel shows its four script fields, and a save keeps its title and summary', async ({
  browser,
}) => {
  const { page } = await person(browser, 'scriptpn')
  const universeId = await world(page)
  const comic = await newProject(page, universeId, 4, 'manga')
  const chapter = await node(page, comic, 'chapter', 'Chapter one')
  const sheet = await node(page, comic, 'page', 'Page one', chapter)
  const panel = await node(page, comic, 'panel', 'Wide shot', sheet, 'The harbour at dawn.')

  await page.goto(`/app/universes/${universeId}/projects/${comic}/script?node=${panel}`)
  await expect(page.getByTestId('project-script-title')).toHaveText('Wide shot')
  for (const part of ['dialogue', 'caption', 'sfx', 'notes']) {
    await expect(page.getByTestId(`project-script-panel-${part}`)).toBeVisible()
  }
  await page.getByTestId('project-script-panel-dialogue').fill('Look.')
  await page.getByTestId('project-script-save').click()
  await expect.poll(async () => (await read(page, comic, panel)).dialogue).toBe('Look.')
  const saved = await read(page, comic, panel)
  expect(saved.title).toBe('Wide shot')
  expect(saved.summary).toBe('The harbour at dawn.')
})

test('a project with no format says so and points to Structure', async ({ browser }) => {
  const { page } = await person(browser, 'scriptnf')
  const universeId = await world(page)
  const film = await newProject(page, universeId, 3, null)

  await page.goto(`/app/universes/${universeId}/projects/${film}/script`)
  await expect(page.getByTestId('project-script-no-format')).toBeVisible()
  await page.getByTestId('project-script-structure').click()
  await expect(page).toHaveURL(new RegExp(`${film}/structure$`))
})

test('on a phone the parts fold into a disclosure and the page keeps its width', async ({
  browser,
}) => {
  const { page } = await person(browser, 'scriptph')
  await page.setViewportSize({ width: 375, height: 740 })
  const universeId = await world(page)
  const film = await newProject(page, universeId, 3, 'short-film')
  await node(page, film, 'scene', 'Opening')
  const second = await node(page, film, 'scene', 'Harbour')

  await page.goto(`/app/universes/${universeId}/projects/${film}/script`)
  await expect(page.getByTestId('project-script-title')).toHaveText('Opening')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await page.getByTestId('manuscript-outline-toggle').click()
  await page.getByTestId('manuscript-outline-scene').filter({ hasText: 'Harbour' }).click()
  await expect(page).toHaveURL(new RegExp(`script\\?node=${second}$`))
  await expect(page.getByTestId('project-script-title')).toHaveText('Harbour')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('a collaborator who only reads gets the text and no editor or Save', async ({ browser }) => {
  const owner = await person(browser, 'scriptow')
  const viewer = await person(browser, 'scriptvw')
  const universeId = await world(owner.page)
  const film = await newProject(owner.page, universeId, 3, 'short-film')
  const scene = await node(owner.page, film, 'scene', 'Opening')
  const stored = await read(owner.page, film, scene)
  const saved = await owner.page.request.put(`/api/projects/${film}/structure/${scene}`, {
    data: { title: 'Opening', summary: null, body: 'Read me.', expectedVersion: stored.version },
  })
  expect(saved.ok()).toBe(true)
  await invite(owner.page, viewer.page, `/api/universes/${universeId}/invitations`, viewer.email, 1)

  await viewer.page.goto(`/app/universes/${universeId}/projects/${film}/script`)
  await expect(viewer.page.getByTestId('project-script-read')).toContainText('Read me.')
  await expect(editor(viewer.page)).toHaveCount(0)
  await expect(viewer.page.getByTestId('project-script-save')).toHaveCount(0)
})
