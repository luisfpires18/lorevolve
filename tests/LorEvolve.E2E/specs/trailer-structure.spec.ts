import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #292: Trailer and Teaser structures. A standalone Trailer project holds segments of shots, shot text and
 * order survive a reload.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('trailst')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function saveEditor(page: Page, title: string, body?: string) {
  const editor = page.getByTestId('project-node-editor')
  await expect(editor).toBeVisible()
  await editor.getByTestId('project-node-title').fill(title)
  if (body !== undefined) await editor.getByTestId('project-node-body').fill(body)
  await editor.getByTestId('project-node-save').click()
  await expect(editor).toBeHidden()
}

test('a trailer outline adds segments and shots, reorders them and keeps it all after a reload', async ({
  page,
}) => {
  await signUp(page)
  const world = (await (
    await page.request.post('/api/universes', {
      data: { name: unique('Trailerworld '), description: null },
    })
  ).json()) as { id: string }
  // A standalone promotional project: no film or series chosen.
  const created = await page.request.post('/api/projects', {
    data: {
      name: unique('Trailer '),
      kind: 3,
      lifecycle: 0,
      subtype: null,
      summary: null,
      universeId: world.id,
      expectedVersion: null,
      format: 'trailer',
    },
  })
  expect(created.ok()).toBe(true)
  const id = ((await created.json()) as { id: string }).id

  await page.goto(`/app/universes/${world.id}/projects/${id}/structure`)
  const outline = page.getByTestId('project-outline')
  await expect(outline).toBeVisible()
  await expect(outline.getByTestId('project-node-add-segment')).toBeVisible()
  await expect(outline.getByTestId('project-node-add-shot')).toHaveCount(0)

  await outline.getByTestId('project-node-add-segment').click()
  await saveEditor(page, 'Segment One')
  await outline.getByTestId('project-node-add-segment').click()
  await saveEditor(page, 'Segment Two')
  const segments = outline.getByTestId('project-outline-list-root').locator(':scope > li')
  await expect(segments).toHaveCount(2)
  const idOf = async (title: string) =>
    ((await segments.filter({ hasText: title }).getAttribute('data-testid')) ?? '').replace(
      'project-node-',
      '',
    )
  const one = await idOf('Segment One')
  const two = await idOf('Segment Two')

  await outline.getByTestId(`project-node-add-shot-${one}`).click()
  await saveEditor(page, 'Door', 'She opens it.\nNobody is there.')
  await outline.getByTestId(`project-node-add-shot-${two}`).click()
  await saveEditor(page, 'Title card')

  await outline.getByTestId(`project-node-actions-${two}`).click()
  await outline.getByTestId(`project-node-up-${two}`).click()
  await expect(segments.first()).toContainText('Segment Two')

  await page.reload()
  await expect(segments.first()).toContainText('Segment Two')
  const shot = outline.getByTestId(`project-node-${one}`).locator('li').filter({ hasText: 'Door' })
  await shot.getByRole('button', { name: 'Edit' }).first().click()
  await expect(page.getByTestId('project-node-body')).toHaveValue('She opens it.\nNobody is there.')
})
