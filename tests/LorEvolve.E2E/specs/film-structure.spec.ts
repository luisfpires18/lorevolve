import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #290: Movie and Short Film authoring structures. A Feature Film's outline holds acts with scenes and sequences,
 * a Short Film starts at scenes, order and text survive a reload, and a Film with no format keeps its sequences.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('filmst')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newFilm(page: Page, universeId: string, format: string | null) {
  const response = await page.request.post('/api/projects', {
    data: {
      name: unique('Film '),
      kind: 3,
      lifecycle: 0,
      subtype: null,
      summary: null,
      universeId,
      expectedVersion: null,
      format,
    },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function saveEditor(page: Page, title: string, body?: string) {
  const editor = page.getByTestId('project-node-editor')
  await expect(editor).toBeVisible()
  await editor.getByTestId('project-node-title').fill(title)
  if (body !== undefined) await editor.getByTestId('project-node-body').fill(body)
  await editor.getByTestId('project-node-save').click()
  await expect(editor).toBeHidden()
}

test('a feature film outline adds, reorders, edits and keeps it all after a reload', async ({
  page,
}) => {
  await signUp(page)
  const world = (await (
    await page.request.post('/api/universes', {
      data: { name: unique('Filmworld '), description: null },
    })
  ).json()) as { id: string }
  const film = await newFilm(page, world.id, 'feature-film')

  await page.goto(`/app/universes/${world.id}/projects/${film}/structure`)
  const outline = page.getByTestId('project-outline')
  await expect(outline).toBeVisible()
  await expect(page.getByTestId('project-outline-empty')).toBeVisible()

  // Only acts at the root of a feature film.
  await expect(outline.getByTestId('project-node-add-act')).toBeVisible()
  await expect(outline.getByTestId('project-node-add-scene')).toHaveCount(0)

  await outline.getByTestId('project-node-add-act').click()
  await saveEditor(page, 'Act One')
  await outline.getByTestId('project-node-add-act').click()
  await saveEditor(page, 'Act Two')

  const acts = outline.getByTestId('project-outline-list-root').locator(':scope > li')
  await expect(acts).toHaveCount(2)
  const actOne = acts.filter({ hasText: 'Act One' })
  const actOneId = ((await actOne.getAttribute('data-testid')) ?? '').replace('project-node-', '')

  // An act offers both a sequence and a scene.
  await outline.getByTestId(`project-node-add-scene-${actOneId}`).click()
  await saveEditor(page, 'Arrival', 'EXT. SHORE - DAY')
  await outline.getByTestId(`project-node-add-sequence-${actOneId}`).click()
  await saveEditor(page, 'The Chase')

  // Act Two moves up.
  const actTwo = acts.filter({ hasText: 'Act Two' })
  const actTwoId = ((await actTwo.getAttribute('data-testid')) ?? '').replace('project-node-', '')
  await outline.getByTestId(`project-node-actions-${actTwoId}`).click()
  await outline.getByTestId(`project-node-up-${actTwoId}`).click()
  await expect(acts.first()).toContainText('Act Two')

  await page.reload()
  await expect(acts.first()).toContainText('Act Two')
  await expect(outline.getByTestId(`project-node-${actOneId}`)).toContainText('Arrival')
  await expect(outline.getByTestId(`project-node-${actOneId}`)).toContainText('The Chase')

  // The scene's text was kept.
  const arrival = outline
    .getByTestId(`project-node-${actOneId}`)
    .locator('li')
    .filter({ hasText: 'Arrival' })
  await arrival.getByRole('button', { name: 'Edit' }).first().click()
  await expect(page.getByTestId('project-node-body')).toHaveValue('EXT. SHORE - DAY')
})

test('a short film starts at scenes and a film with no format keeps its sequences', async ({
  page,
}) => {
  await signUp(page)
  const world = (await (
    await page.request.post('/api/universes', {
      data: { name: unique('Shortworld '), description: null },
    })
  ).json()) as { id: string }

  const short = await newFilm(page, world.id, 'short-film')
  await page.goto(`/app/universes/${world.id}/projects/${short}/structure`)
  const outline = page.getByTestId('project-outline')
  await expect(outline.getByTestId('project-node-add-scene')).toBeVisible()
  await expect(outline.getByTestId('project-node-add-act')).toHaveCount(0)

  const legacy = await newFilm(page, world.id, null)
  await page.goto(`/app/universes/${world.id}/projects/${legacy}/structure`)
  await expect(page.getByTestId('project-seasons')).toBeVisible()
  await expect(page.getByTestId('project-outline')).toHaveCount(0)
})
