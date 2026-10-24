import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { png } from './support/png'
import { entryText } from './support/zip'

/**
 * Restoring a backup as a new universe (ADR 0032), for what only a browser can show: the file chosen from the universes
 * page, checked with a preview, named, restored and opened; what came back visible where an author looks for it - the
 * entry's article and picture, the manuscript, the plot, the idea, the Trash, the search bar; the same file restored again
 * as another universe beside an untouched original; refusals that say what is wrong and create nothing; and the whole
 * flow on a phone, in the dark, with a long right-to-left name.
 *
 * What a restore reconstructs in full, and every refusal it can make, is settled by the API tests. This builds one rich
 * world through the API and exports it for real, so the file uploaded is exactly the file Lorex writes.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('restorer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  const password = makeTestPassword()
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
) {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

function doc(...paragraphs: string[]) {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  })
}

interface Seeded {
  universeId: string
  name: string
}

/**
 * One of each thing the restore screen should bring back into view: an entry with an article and a picture, a story with a
 * chapter, a scene with prose and a scene in the Trash, an arc and a beat, an idea about the universe, and a world rule.
 */
async function seedWorld(page: Page, name: string): Promise<Seeded> {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: 'Restored from a file.',
    accentColor: '#1f8f74',
  })
  const u = `/api/universes/${universe.id}`
  const types = await api<{ id: string; name: string }[]>(page, 'GET', `${u}/entity-types`)
  const character = types.find((type) => type.name === 'Character')!.id

  const entity = await api<{ id: string }>(page, 'POST', `${u}/entities`, {
    entityTypeId: character,
    name: 'Isolde Varrow',
    summary: 'Keeper of the Orlamund light.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  await api(page, 'PUT', `${u}/entities/${entity.id}/article`, {
    content: doc('The Orlamund lamp was never allowed to go out.'),
    expectedVersion: 0,
  })
  const picture = await page.request.put(`${u}/entities/${entity.id}/image`, {
    multipart: {
      file: {
        name: 'isolde.png',
        mimeType: 'image/png',
        buffer: png(96, 64, (x, y) => [x * 2, y * 3, 120]),
      },
    },
  })
  expect(picture.ok()).toBe(true)

  const story = await api<{ id: string }>(page, 'POST', `${u}/stories`, {
    title: 'The Brennquay Winter',
    premise: null,
    status: 1,
  })
  const s = `${u}/stories/${story.id}`
  const chapter = await api<{ id: string }>(page, 'POST', `${s}/chapters`, {
    title: 'Landfall',
    summary: null,
    notes: null,
  })
  const scene = await api<{ id: string }>(page, 'POST', `${s}/scenes`, {
    title: 'The Harbour Council',
    summary: null,
    notes: null,
    povEntityId: entity.id,
    chronology: null,
    entityIds: [entity.id],
    chapterId: chapter.id,
  })
  await api(page, 'PUT', `${s}/scenes/${scene.id}/manuscript`, {
    content: 'Snow fell on the Vellmarch quay while the council argued.',
    expectedVersion: 0,
  })
  const cut = await api<{ id: string }>(page, 'POST', `${s}/scenes`, {
    title: 'A Scene Cut Short',
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
  })
  await api(page, 'DELETE', `${s}/scenes/${cut.id}`)
  const arc = await api<{ id: string }>(page, 'POST', `${s}/plot-arcs`, {
    title: 'The Lamp Goes Dark',
    description: null,
    notes: null,
  })
  await api(page, 'POST', `${s}/plot-arcs/${arc.id}/beats`, {
    title: 'Isolde hides the oil',
    description: null,
    notes: null,
    sceneIds: [scene.id],
    entityIds: [entity.id],
  })
  await api(page, 'POST', '/api/ideas', {
    title: 'What if the lamp is alive?',
    body: 'Only the keeper knows.',
    universeId: universe.id,
    references: [{ kind: 0, id: entity.id }],
    expectedUpdatedAt: null,
  })
  await api(page, 'POST', `${u}/world-rules`, {
    title: 'The Orlamund light never goes out',
    description: 'Not in the Carrowgate storms, and not for any keeper.',
    expectedUpdatedAt: null,
  })

  return { universeId: universe.id, name }
}

async function exportBackup(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/export`)
  expect(response.ok()).toBe(true)
  return response.body()
}

async function universeCount(page: Page) {
  return (await api<{ totalCount: number }>(page, 'GET', '/api/universes?includeArchived=true'))
    .totalCount
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

/** Opens the panel, chooses the file and asks for it to be checked. */
async function chooseAndCheck(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto('/app')
  await page.getByTestId('restore-backup').click()
  await expect(page.getByTestId('restore-panel')).toBeVisible()
  await page.getByLabel('Backup file').setInputFiles(file)
  await page.getByTestId('restore-check').click()
}

test.describe('restore a backup', () => {
  test('a backup is checked, previewed, named and restored as a new universe that opens with everything in it', async ({
    page,
  }) => {
    await signUp(page)
    const source = await seedWorld(page, unique('Orlamund '))
    const archive = await exportBackup(page, source.universeId)
    const sourcePayload = JSON.parse(entryText(archive, 'backup.json')).payload

    await chooseAndCheck(page, {
      name: 'orlamund.zip',
      mimeType: 'application/zip',
      buffer: archive,
    })

    // The preview: what this is, from when, what it holds - and focus is on it.
    const preview = page.getByTestId('restore-preview')
    await expect(preview).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ready to restore' })).toBeFocused()
    await expect(page.getByTestId('restore-universe-name')).toHaveText(source.name)
    await expect(preview).toContainText('Version 27')
    await expect(preview).toContainText('1 world rule')
    await expect(preview).toContainText('1 entry')
    await expect(preview).toContainText('1 picture')
    await expect(preview).toContainText('1 story, 1 chapter, 1 scene')
    await expect(preview).toContainText('1 idea')
    await expect(preview).toContainText('In the Trash')

    // The source still exists, so its name is taken and the author is told so beside the name.
    const nameInput = page.getByLabel('Name of the new universe')
    await expect(nameInput).toHaveValue(source.name)
    await expect(preview).toContainText('You already have a universe with that name')
    await nameInput.fill(`${source.name} restored`)
    await page.getByTestId('restore-submit').click()

    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    const restoredId = page.url().split('/').pop()!
    expect(restoredId).not.toBe(source.universeId)
    await expect(page.getByTestId('workspace-name')).toContainText(`${source.name} restored`)

    const r = `/api/universes/${restoredId}`

    // The entry, its article and its picture.
    const entities = await api<{ items: { id: string; name: string; entityTypeId: string }[] }>(
      page,
      'GET',
      `${r}/entities`,
    )
    const isolde = entities.items.find((item) => item.name === 'Isolde Varrow')!
    await page.goto(`/app/universes/${restoredId}/lore?type=${isolde.entityTypeId}`)
    const portrait = page.getByTestId('entity-portrait').first()
    await expect(portrait).toBeVisible()
    await expect
      .poll(() =>
        portrait.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true)
    await page.goto(`/app/universes/${restoredId}/lore/${isolde.id}`)
    await expect(page.getByTestId('article')).toContainText(
      'The Orlamund lamp was never allowed to go out.',
    )

    // The manuscript, the plot and the idea.
    const stories = await api<{ id: string; title: string }[]>(page, 'GET', `${r}/stories`)
    const story = stories.find((candidate) => candidate.title === 'The Brennquay Winter')!
    const detail = await api<{ scenes: { id: string; title: string }[] }>(
      page,
      'GET',
      `${r}/stories/${story.id}`,
    )
    const council = detail.scenes.find((scene) => scene.title === 'The Harbour Council')!
    await page.goto(`/app/universes/${restoredId}/stories/${story.id}/manuscript/${council.id}`)
    await expect(page.locator('textarea.manuscript__text')).toHaveValue(
      'Snow fell on the Vellmarch quay while the council argued.',
    )
    await page.goto(`/app/universes/${restoredId}/stories/${story.id}/plot`)
    await expect(page.getByText('Isolde hides the oil')).toBeVisible()
    await page.goto(`/app/universes/${restoredId}/ideas`)
    await expect(page.getByText('What if the lamp is alive?')).toBeVisible()

    // The world rule, in the restored universe's World Rules.
    await page.goto(`/app/universes/${restoredId}/world-rules`)
    await expect(
      page.getByTestId('world-rule-row').filter({ hasText: 'The Orlamund light never goes out' }),
    ).toBeVisible()

    // The scene that was in the Trash is in the Trash.
    await page.goto(`/app/universes/${restoredId}/trash`)
    await expect(page.getByTestId('trash-row-A Scene Cut Short')).toBeVisible()

    // Saved words are found by the universe's search bar at once.
    const answered = page.waitForResponse((response) => response.url().includes('/search?'))
    await page.getByRole('combobox', { name: 'Search this universe' }).fill('Vellmarch')
    await answered
    await expect(page.getByRole('listbox', { name: 'Results' }).getByRole('option')).toHaveCount(1)

    // And so are a rule's.
    const ruleAnswered = page.waitForResponse(
      (response) => response.url().includes('/search?') && response.url().includes('Carrowgate'),
    )
    await page.getByRole('combobox', { name: 'Search this universe' }).fill('Carrowgate')
    await ruleAnswered
    const ruleResult = page.getByRole('listbox', { name: 'Results' }).getByRole('option')
    await expect(ruleResult).toHaveCount(1)
    await expect(ruleResult).toContainText('World rule')

    // The same file again is another universe, and the original has not changed.
    await chooseAndCheck(page, {
      name: 'orlamund.zip',
      mimeType: 'application/zip',
      buffer: archive,
    })
    await page.getByLabel('Name of the new universe').fill(`${source.name} again`)
    await page.getByTestId('restore-submit').click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    const againId = page.url().split('/').pop()!
    expect([source.universeId, restoredId]).not.toContain(againId)

    const after = JSON.parse(
      entryText(await exportBackup(page, source.universeId), 'backup.json'),
    ).payload
    expect(after).toEqual(sourcePayload)

    await page.goto('/app')
    await expect(page.getByTestId('universe-grid')).toContainText(`${source.name} restored`)
    await expect(page.getByTestId('universe-grid')).toContainText(`${source.name} again`)
  })

  test('a file that is not a backup, one from a newer Lorex, a damaged one and an invalid one are refused and create nothing', async ({
    page,
  }) => {
    await signUp(page)
    const source = await seedWorld(page, unique('Refused '))
    const archive = await exportBackup(page, source.universeId)
    const before = await universeCount(page)
    const document = JSON.parse(entryText(archive, 'backup.json'))

    const cases: [string, { name: string; mimeType: string; buffer: Buffer }, RegExp][] = [
      [
        'not a backup',
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('shopping list') },
        /not a Lorex backup/,
      ],
      [
        'newer',
        {
          name: 'future.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ ...document, formatVersion: 28 })),
        },
        /newer Lorex/,
      ],
      [
        'damaged',
        {
          name: 'damaged.zip',
          mimeType: 'application/zip',
          buffer: archive.subarray(0, archive.length / 2),
        },
        /incomplete|damaged/,
      ],
      [
        'invalid',
        {
          name: 'invalid.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            JSON.stringify({
              ...document,
              formatVersion: 2,
              payload: {
                ...document.payload,
                entities: document.payload.entities.map((entity: Record<string, unknown>) => ({
                  ...entity,
                  entityTypeId: '00000000-0000-4000-8000-000000000001',
                })),
              },
            }),
          ),
        },
        /entry type the backup does not hold/,
      ],
    ]

    for (const [label, file, message] of cases) {
      await chooseAndCheck(page, file)

      const refused = page.getByTestId('restore-refused')
      await expect(refused, label).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'This backup cannot be restored' }),
      ).toBeFocused()
      await expect(refused, label).toContainText(message)
      await expect(refused).toContainText('No universe was created.')
      expect(await universeCount(page), label).toBe(before)

      // And another file can be chosen straight away.
      await page.getByTestId('restore-choose-another').click()
      await expect(page.getByLabel('Backup file')).toBeFocused()
    }
  })

  test('the whole flow works on a phone, in the dark, by keyboard, with a long right-to-left name', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)

    const longName = unique('مملكة البحر الغارق وأسرار المنارة القديمة التي لا تنطفئ أبدا ')
    const source = await seedWorld(page, longName)
    const archive = await exportBackup(page, source.universeId)

    await page.goto('/app')
    await page.getByTestId('restore-backup').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('restore-panel')).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)

    await page
      .getByLabel('Backup file')
      .setInputFiles({ name: 'rtl.zip', mimeType: 'application/zip', buffer: archive })
    await page.getByTestId('restore-check').focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: 'Ready to restore' })).toBeFocused()
    await expect(page.getByTestId('restore-universe-name')).toHaveText(longName)
    expect(await scrollsSideways(page)).toBe(false)

    const panel = (await page.getByTestId('restore-panel').boundingBox())!
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(391)

    const nameInput = page.getByLabel('Name of the new universe')
    await nameInput.focus()
    await nameInput.fill(`${longName} ٢`)
    await page.keyboard.press('Enter')

    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    expect(page.url()).not.toContain(source.universeId)
    expect(await scrollsSideways(page)).toBe(false)
  })
})
