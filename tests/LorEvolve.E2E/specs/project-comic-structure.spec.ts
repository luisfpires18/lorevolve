import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #294: Comic hierarchies. Each format's outline offers its own root level, pages hold panels, and the outline
 * survives a reload.
 */

const PASSWORD = 'Test-password-123!'

const FORMATS = [
  { format: 'western-comic', root: 'issue' },
  { format: 'manga', root: 'chapter' },
  { format: 'one-shot', root: 'page' },
  { format: 'webcomic', root: 'episode' },
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('comicst')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function saveEditor(page: Page, title: string) {
  const editor = page.getByTestId('project-node-editor')
  await expect(editor).toBeVisible()
  await editor.getByTestId('project-node-title').fill(title)
  await editor.getByTestId('project-node-save').click()
  await expect(editor).toBeHidden()
}

for (const { format, root } of FORMATS) {
  test(`a ${format} outline adds ${root}, page and panel and keeps them after a reload`, async ({
    page,
  }) => {
    await signUp(page)
    const world = (await (
      await page.request.post('/api/universes', {
        data: { name: unique('Comicworld '), description: null },
      })
    ).json()) as { id: string }
    const created = await page.request.post('/api/projects', {
      data: {
        name: unique('Comic '),
        kind: 4,
        lifecycle: 0,
        subtype: null,
        summary: null,
        universeId: world.id,
        expectedVersion: null,
        format,
      },
    })
    expect(created.ok()).toBe(true)
    const id = ((await created.json()) as { id: string }).id

    await page.goto(`/app/universes/${world.id}/projects/${id}/structure`)
    const outline = page.getByTestId('project-outline')
    await expect(outline).toBeVisible()
    await expect(outline.getByTestId(`project-node-add-${root}`)).toBeVisible()

    await outline.getByTestId(`project-node-add-${root}`).click()
    await saveEditor(page, 'First')
    const rows = outline.getByTestId('project-outline-list-root').locator(':scope > li')
    await expect(rows).toHaveCount(1)
    const rootId = ((await rows.first().getAttribute('data-testid')) ?? '').replace(
      'project-node-',
      '',
    )

    let pageId = rootId
    if (root !== 'page') {
      await outline.getByTestId(`project-node-add-page-${rootId}`).click()
      await saveEditor(page, 'Page One')
      pageId = (
        (await outline.locator('li', { hasText: 'Page One' }).last().getAttribute('data-testid')) ??
        ''
      ).replace('project-node-', '')
    }
    await outline.getByTestId(`project-node-add-panel-${pageId}`).click()
    await saveEditor(page, 'Panel One')

    await page.reload()
    await expect(outline.getByText('First')).toBeVisible()
    await expect(outline.getByText('Panel One')).toBeVisible()
  })
}
