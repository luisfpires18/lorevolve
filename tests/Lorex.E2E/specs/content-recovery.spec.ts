import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import { entryText } from './support/zip'
import { chooseFromMenu } from './support/rowMenu'

/**
 * Content recovery, end to end (ADR 0029): the three ways Lorex gives writing back, kept apart.
 *
 * Saved versions recover what was saved: a manuscript's history, read in place and put back as the newest version. The
 * Trash recovers what was deleted: a scene and a whole story, gone from the story and back with everything they held.
 * Recovered drafts recover what was never saved: a copy this browser kept of unsaved article and manuscript writing,
 * offered - never applied - the next time the same account opens it, and let go once it is saved, discarded or left
 * behind by choice. The copy never reaches the API or a backup, and no other account is ever offered it.
 *
 * Each test registers its own account and builds its own universe. A tab "dies" with no question asked - as a crash, a
 * dead battery or a force-quit would - by opening another tab on the same browser and closing the first.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('keeper')
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
  await page.waitForURL('/app')
}

async function accountId(page: Page) {
  const response = await page.request.get('/api/auth/me')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { id: string }).id
}

/** Creates a universe through the UI and returns the id it was given. */
async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]

  const created = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name,
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedStory(page: Page, universeId: string, title: string) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise: null, status: 1 },
  })
  expect(story.status()).toBe(201)
  return (await story.json()).id as string
}

async function seedChapter(page: Page, universeId: string, storyId: string, title: string) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/chapters`,
    { data: { title, summary: null, notes: null } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedScene(
  page: Page,
  universeId: string,
  storyId: string,
  title: string,
  chapterId: string | null = null,
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/scenes`,
    {
      data: {
        title,
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId,
      },
    },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

/** A Tiptap document, one paragraph per argument - the shape the editor writes. */
function doc(...paragraphs: string[]) {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  })
}

function articlePath(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/article`
}

async function readArticle(page: Page, universeId: string, entityId: string) {
  const response = await page.request.get(articlePath(universeId, entityId))
  expect(response.status()).toBe(200)
  return (await response.json()) as { content: string; updatedAt: string | null; version: number }
}

/** Saves an article straight through the API, as another window or device would, over whatever is stored now. */
async function writeArticle(page: Page, universeId: string, entityId: string, content: string) {
  const current = await readArticle(page, universeId, entityId)
  const saved = await page.request.put(articlePath(universeId, entityId), {
    data: { content, expectedVersion: current.version },
  })
  expect(saved.status()).toBe(200)
}

function manuscriptPath(universeId: string, storyId: string, sceneId: string) {
  return `/api/universes/${universeId}/stories/${storyId}/scenes/${sceneId}/manuscript`
}

async function readManuscript(page: Page, universeId: string, storyId: string, sceneId: string) {
  const response = await page.request.get(manuscriptPath(universeId, storyId, sceneId))
  expect(response.status()).toBe(200)
  return (await response.json()) as { content: string; updatedAt: string | null; version: number }
}

/** Saves prose straight through the API, as another window or device would, over whatever is stored now. */
async function writeManuscript(
  page: Page,
  universeId: string,
  storyId: string,
  sceneId: string,
  content: string,
) {
  const current = await readManuscript(page, universeId, storyId, sceneId)
  const saved = await page.request.put(manuscriptPath(universeId, storyId, sceneId), {
    data: { content, expectedVersion: current.version },
  })
  expect(saved.status()).toBe(200)
}

/** Puts the caret at the end of the article and types there. */
async function typeAtEnd(page: Page, text: string) {
  await page.getByTestId('lore-editor').focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

/** Saves through the page and waits until the API has confirmed it and the page says so. */
async function saveWith(page: Page, route: string, status: string, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(route) && response.request().method() === 'PUT' && response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId(status)).toHaveText('Saved')
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

interface RecoveryCopy {
  key: string
  accountId: string
  universeId: string
  kind: string
  contentId: string
  content: string
  baseUpdatedAt: string | null
}

/**
 * The recovery copies this browser holds, read straight from its storage rather than through the app. A database that
 * does not exist yet is not created by looking for it.
 */
function recoveryCopies(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases()
    if (!databases.some((database) => database.name === 'lorex-recovery')) return []

    return new Promise<RecoveryCopy[]>((resolve, reject) => {
      const opened = indexedDB.open('lorex-recovery')
      opened.onerror = () => reject(opened.error)
      opened.onsuccess = () => {
        const database = opened.result
        if (!database.objectStoreNames.contains('drafts')) {
          database.close()
          resolve([])
          return
        }

        const all = database.transaction('drafts', 'readonly').objectStore('drafts').getAll()
        all.onsuccess = () => {
          database.close()
          resolve(all.result as RecoveryCopy[])
        }
        all.onerror = () => reject(all.error)
      }
    })
  })
}

async function copyTexts(page: Page) {
  return (await recoveryCopies(page)).map((copy) => copy.content).join('\n')
}

/** The tab dies with no question asked, and the same page is opened in a new tab on the same browser. */
async function crashAndReopen(page: Page, url: string) {
  const next = await page.context().newPage()
  await page.close()
  await next.goto(url)
  return next
}

test.describe('content recovery', () => {
  test('unsaved article writing comes back as a recovered draft, reaches neither the API nor a backup, and goes once saved or discarded', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Recovery Reach '))
    const entityId = await seedEntity(page, universeId, 'Alenna Vance')
    await writeArticle(page, universeId, entityId, doc('Saved words.'))
    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`
    const unsaved = ' Unsaved: “Ærendel — 北の門” 👩‍👩‍👧'

    await page.goto(entryUrl)
    await page.getByTestId('article-edit').click()
    await expect(page.getByTestId('lore-editor')).toBeFocused()
    await typeAtEnd(page, unsaved)
    await expect(page.getByTestId('article-status')).toHaveText('Unsaved changes')
    await expect.poll(() => copyTexts(page)).toContain('北の門')

    // Kept on this device only: nothing was saved, and a backup holds no trace of it.
    expect((await readArticle(page, universeId, entityId)).content).toBe(doc('Saved words.'))
    const archive = await page.request.get(`/api/universes/${universeId}/export`)
    expect(archive.status()).toBe(200)
    const document = entryText(await archive.body(), 'backup.json')
    expect(document).toContain('Saved words.')
    expect(document).not.toContain('Ærendel')

    // The tab dies. Opened again, the saved article is what is shown - the copy is offered, never applied.
    let tab = await crashAndReopen(page, entryUrl)
    const recovery = tab.getByTestId('article-recovery')
    await expect(recovery).toBeVisible()
    await expect(recovery).toHaveAttribute('data-saved-since', 'false')
    await expect(recovery).toContainText('never saved')
    await expect(tab.getByTestId('article').getByTestId('lore-article').first()).toHaveText(
      'Saved words.',
    )
    await expect(tab.getByTestId('article-edit')).toBeDisabled()
    await expect(tab.getByTestId('article-note')).toContainText('Recover or discard')

    // It can be read before choosing.
    await recovery.getByTestId('article-recovery-preview-toggle').click()
    await expect(recovery.getByTestId('article-recovery-preview')).toContainText('北の門')

    // Recovered: in the editor as unsaved changes, and still not saved.
    await recovery.getByTestId('article-recovery-recover').click()
    const editor = tab.getByTestId('lore-editor')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveText(`Saved words.${unsaved}`)
    await expect(tab.getByTestId('article-status')).toHaveText('Unsaved changes')
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)
    expect((await readArticle(tab, universeId, entityId)).content).toBe(doc('Saved words.'))

    // Saved the normal way: the copy is let go, and nothing is offered again.
    await saveWith(tab, '/article', 'article-status', () => tab.getByTestId('article-save').click())
    expect((await readArticle(tab, universeId, entityId)).content).toContain('北の門')
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)
    await tab.getByTestId('article-done').click()
    await tab.reload()
    await expect(tab.getByTestId('article-edit')).toBeEnabled()
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)

    // Another unsaved change, another dead tab - and this time the copy is discarded.
    await tab.getByTestId('article-edit').click()
    await typeAtEnd(tab, ' Thrown away.')
    await expect.poll(() => copyTexts(tab)).toContain('Thrown away.')
    tab = await crashAndReopen(tab, entryUrl)

    let asked = ''
    tab.once('dialog', (dialog) => {
      asked = dialog.message()
      void dialog.accept()
    })
    await tab.getByTestId('article-recovery-discard').click()
    await expect.poll(() => asked).toContain('Discard the recovered draft')
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)
    await expect(tab.getByTestId('article-edit')).toBeFocused()
    await expect(tab.getByTestId('article').getByTestId('lore-article')).not.toContainText(
      'Thrown away.',
    )
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)

    await tab.reload()
    await expect(tab.getByTestId('article-edit')).toBeEnabled()
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)
  })

  test('a failed or refused article save keeps the recovered draft, and loading the saved version or leaving by choice lets it go', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Refused Article '))
    const entityId = await seedEntity(page, universeId, 'Gatewarden')
    await writeArticle(page, universeId, entityId, doc('Saved words.'))
    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`

    await page.goto(entryUrl)
    await page.getByTestId('article-edit').click()
    await typeAtEnd(page, ' Failing.')

    // The server fails the save: the text stays, and so does its copy.
    await page.route('**/article', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        : route.continue(),
    )
    await page.getByTestId('article-save').click()
    await expect(page.getByTestId('article-error')).toContainText('could not be saved')
    await page.unroute('**/article')
    await expect.poll(() => copyTexts(page)).toContain('Failing.')

    let tab = await crashAndReopen(page, entryUrl)
    await expect(tab.getByTestId('article-recovery')).toHaveAttribute('data-saved-since', 'false')
    await tab.getByTestId('article-recovery-recover').click()
    await expect(tab.getByTestId('lore-editor')).toHaveText('Saved words. Failing.')

    // Another window saves meanwhile: this save is refused, and the copy stays.
    await writeArticle(tab, universeId, entityId, doc('Written elsewhere.'))
    await tab.getByTestId('article-save').click()
    await expect(tab.getByTestId('article-conflict')).toBeVisible()
    await expect.poll(() => copyTexts(tab)).toContain('Failing.')

    // Opened again, the offer says plainly that the article was saved since the copy was made - a copy made later on this
    // device is not therefore newer.
    tab = await crashAndReopen(tab, entryUrl)
    const recovery = tab.getByTestId('article-recovery')
    await expect(recovery).toHaveAttribute('data-saved-since', 'true')
    await expect(recovery.getByTestId('article-recovery-saved-since')).toContainText(
      'saved again since',
    )
    await expect(tab.getByTestId('article').getByTestId('lore-article').first()).toHaveText(
      'Written elsewhere.',
    )

    // Recovered, refused again, and this time the author takes the saved version: the copy goes with their text.
    await recovery.getByTestId('article-recovery-recover').click()
    await expect(tab.getByTestId('lore-editor')).toHaveText('Saved words. Failing.')
    await writeArticle(tab, universeId, entityId, doc('Third.'))
    await tab.getByTestId('article-save').click()
    await expect(tab.getByTestId('article-conflict')).toBeVisible()
    await tab.getByTestId('article-conflict-review').click()
    tab.once('dialog', (dialog) => void dialog.accept())
    await tab.getByTestId('article-conflict-use-latest').click()
    await expect(tab.getByTestId('lore-editor')).toHaveText('Third.')
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)

    // Leaving by choice is a choice: asked once, and the copy goes with the text.
    await typeAtEnd(tab, ' Abandoned.')
    await expect.poll(() => copyTexts(tab)).toContain('Abandoned.')
    const questions: string[] = []
    tab.on('dialog', (dialog) => {
      questions.push(dialog.message())
      void dialog.accept()
    })
    await tab.locator('.entry__crumbs').getByRole('link', { name: 'Lore' }).click()
    await tab.waitForURL(new RegExp(`/universes/${universeId}/lore[?]type=[0-9a-f-]+$`))
    expect(questions).toHaveLength(1)
    expect(questions[0]).toContain('has unsaved changes')
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)

    await tab.goto(entryUrl)
    await expect(tab.getByTestId('article-edit')).toBeEnabled()
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)
    expect(questions).toHaveLength(1)
  })

  test('a manuscript keeps its saved versions to read and put back, a stale restore changes nothing, and unsaved prose comes back as a recovered draft', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Versions Reach '))
    const storyId = await seedStory(page, universeId, 'The Long Winter')
    const sceneId = await seedScene(page, universeId, storyId, 'The Council')
    await writeManuscript(page, universeId, storyId, sceneId, 'First saved version.')
    await writeManuscript(page, universeId, storyId, sceneId, 'Second saved version.')
    const manuscriptUrl = `/app/universes/${universeId}/stories/${storyId}/manuscript/${sceneId}`

    await page.goto(manuscriptUrl)
    const editor = page.getByTestId('manuscript-editor')
    const status = page.getByTestId('manuscript-status')
    await expect(editor).toHaveValue('Second saved version.')

    // The history opens on request, newest first, and a version's text is read only when it is opened.
    const toggle = page.getByTestId('manuscript-history-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = page.getByTestId('manuscript-history-list')
    await expect(list.locator('li')).toHaveCount(2)
    const first = list.locator('[data-version="1"]')
    await expect(first).toContainText('First version')
    await first.getByTestId('manuscript-version-view').click()
    await expect(first.getByTestId('manuscript-version-snapshot')).toHaveText(
      'First saved version.',
    )

    // Unsaved writing holds every restore: putting a version back would replace text that exists nowhere else.
    await editor.fill('Unsaved words.')
    await expect(first.getByTestId('manuscript-version-restore')).toBeDisabled()
    await expect(page.getByTestId('manuscript-history-blocked')).toContainText(
      'Save your changes first',
    )
    await editor.fill('Second saved version.')
    await expect(first.getByTestId('manuscript-version-restore')).toBeEnabled()

    // Put back: saved again as the newest version, recorded as such, and nothing lost.
    let question = ''
    page.once('dialog', (dialog) => {
      question = dialog.message()
      void dialog.accept()
    })
    await first.getByTestId('manuscript-version-restore').click()
    await expect(page.getByTestId('manuscript-history-message')).toContainText('Version 1 is back')
    expect(question).toContain('nothing in the history is lost')
    await expect(editor).toHaveValue('First saved version.')
    await expect(status).toHaveText('Saved')
    await expect(list.locator('li')).toHaveCount(3)
    await expect(list.locator('[data-version="3"]')).toContainText('Restored version 1')
    expect((await readManuscript(page, universeId, storyId, sceneId)).content).toBe(
      'First saved version.',
    )

    // Saved from another window meanwhile: a restore from this page is refused, and nothing is put back.
    await writeManuscript(page, universeId, storyId, sceneId, 'Saved in another window.')
    page.once('dialog', (dialog) => void dialog.accept())
    await list.locator('[data-version="2"]').getByTestId('manuscript-version-restore').click()
    await expect(page.getByTestId('manuscript-history-message')).toContainText(
      'saved somewhere else',
    )
    await expect(editor).toHaveValue('Saved in another window.')
    expect((await readManuscript(page, universeId, storyId, sceneId)).content).toBe(
      'Saved in another window.',
    )

    // Unsaved prose, and a tab that dies.
    const prose = 'Unsaved prose — “北の門”.\n\n\tSecond paragraph, indented.   \n'
    await editor.fill(prose)
    await expect(status).toHaveText('Unsaved changes')
    await expect.poll(() => copyTexts(page)).toContain('北の門')

    const tab = await crashAndReopen(page, manuscriptUrl)
    const reopened = tab.getByTestId('manuscript-editor')
    const recovery = tab.getByTestId('manuscript-recovery')
    await expect(recovery).toBeVisible()
    await expect(reopened).toHaveValue('Saved in another window.')
    await expect(reopened).toHaveAttribute('readonly', '')
    await recovery.getByTestId('manuscript-recovery-preview-toggle').click()
    await expect(recovery.getByTestId('manuscript-recovery-preview')).toContainText(
      'Second paragraph, indented.',
    )

    await recovery.getByTestId('manuscript-recovery-recover').click()
    await expect(reopened).toHaveValue(prose)
    await expect(reopened).toBeFocused()
    await expect(reopened).not.toHaveAttribute('readonly', '')
    await expect(tab.getByTestId('manuscript-status')).toHaveText('Unsaved changes')
    expect((await readManuscript(tab, universeId, storyId, sceneId)).content).toBe(
      'Saved in another window.',
    )

    await saveWith(tab, '/manuscript', 'manuscript-status', () =>
      tab.keyboard.press('ControlOrMeta+s'),
    )
    expect((await readManuscript(tab, universeId, storyId, sceneId)).content).toBe(prose)
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)

    await tab.reload()
    await expect(tab.getByTestId('manuscript-editor')).toHaveValue(prose)
    await expect(tab.getByTestId('manuscript-recovery')).toHaveCount(0)
  })

  test('a refused manuscript save keeps the recovered draft, discarding it keeps what is saved, and choosing to leave lets it go', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Refused Manuscript '))
    const storyId = await seedStory(page, universeId, 'Careful')
    const first = await seedScene(page, universeId, storyId, 'First')
    const second = await seedScene(page, universeId, storyId, 'Second')
    await writeManuscript(page, universeId, storyId, first, 'Saved words.')
    const url = `/app/universes/${universeId}/stories/${storyId}/manuscript/${first}`

    await page.goto(url)
    const editor = page.getByTestId('manuscript-editor')
    await expect(editor).toHaveValue('Saved words.')
    await editor.fill('Mine.')
    await writeManuscript(page, universeId, storyId, first, 'Theirs.')
    await page.getByTestId('manuscript-save').click()
    await expect(page.getByTestId('manuscript-conflict')).toBeVisible()
    await expect.poll(() => copyTexts(page)).toContain('Mine.')

    let tab = await crashAndReopen(page, url)
    const recovery = tab.getByTestId('manuscript-recovery')
    await expect(recovery).toHaveAttribute('data-saved-since', 'true')
    await expect(tab.getByTestId('manuscript-editor')).toHaveValue('Theirs.')

    tab.once('dialog', (dialog) => void dialog.accept())
    await recovery.getByTestId('manuscript-recovery-discard').click()
    await expect(recovery).toHaveCount(0)
    await expect(tab.getByTestId('manuscript-editor')).toHaveValue('Theirs.')
    await expect(tab.getByTestId('manuscript-editor')).toBeFocused()
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)
    expect((await readManuscript(tab, universeId, storyId, first)).content).toBe('Theirs.')

    // Choosing to leave: asked once, and the copy does not come back.
    await tab.getByTestId('manuscript-editor').fill('Left behind.')
    await expect.poll(() => copyTexts(tab)).toContain('Left behind.')
    const questions: string[] = []
    tab.on('dialog', (dialog) => {
      questions.push(dialog.message())
      void dialog.accept()
    })
    await tab.locator('[data-testid="manuscript-outline-scene"][data-title="Second"]').click()
    await tab.waitForURL(new RegExp(`/manuscript/${second}$`))
    expect(questions).toEqual(['“First” has unsaved changes. Leave without saving them?'])
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(0)

    await tab.goto(url)
    await expect(tab.getByTestId('manuscript-editor')).toHaveValue('Theirs.')
    await expect(tab.getByTestId('manuscript-recovery')).toHaveCount(0)
    expect(questions).toHaveLength(1)
  })

  test('a scene and a whole story go to the Trash, leave the story, and come back whole where they can be opened', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Trash Reach '))
    const storyId = await seedStory(page, universeId, 'The Long Winter')
    const arrival = await seedChapter(page, universeId, storyId, 'Arrival')
    const gates = await seedScene(page, universeId, storyId, 'The Gates', arrival)
    const council = await seedScene(page, universeId, storyId, 'The Council', arrival)
    await writeManuscript(page, universeId, storyId, council, 'Prose of the council.')
    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`

    // A scene deleted says where it goes.
    await page.goto(storyUrl)
    let confirmation = ''
    page.once('dialog', (dialog) => {
      confirmation = dialog.message()
      void dialog.accept()
    })
    await chooseFromMenu(scene(page, 'The Council'), 'scene-delete')
    await expect(scene(page, 'The Council')).toHaveCount(0)
    expect(confirmation).toContain('to the Trash')
    expect(confirmation).toContain('restore it from the Trash')

    // Gone from the story's manuscript too.
    await page.goto(`${storyUrl}/manuscript/${gates}`)
    await expect(page.getByTestId('manuscript-editor')).toBeVisible()
    await expect(
      page.locator('[data-testid="manuscript-outline-scene"][data-title="The Council"]'),
    ).toHaveCount(0)

    // In the Trash, saying what it is and where it was.
    await page.getByTestId('workspace-trash').click()
    await page.waitForURL(/\/trash$/)
    const row = page.getByTestId('trash-row-The Council')
    await expect(row).toBeVisible()
    await expect(row.getByTestId('trash-kind')).toHaveText('Scene')
    await expect(row).toContainText('In “The Long Winter”')

    await row.getByRole('button', { name: 'Restore scene “The Council”' }).click()
    await expect(page.getByTestId('trash-message')).toContainText('is back in “The Long Winter”')
    await expect(page.getByTestId('trash-empty')).toBeVisible()

    // The way back lands on it, and its prose came back with it.
    await page.getByTestId('trash-open').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}#scene-${council}$`))
    await expect(scene(page, 'The Council')).toBeFocused()
    await page.goto(`${storyUrl}/manuscript/${council}`)
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('Prose of the council.')

    // A scene thrown away on its own, then its whole story.
    expect(
      (
        await page.request.delete(`/api/universes/${universeId}/stories/${storyId}/scenes/${gates}`)
      ).status(),
    ).toBe(204)
    await page.goto(storyUrl)
    page.once('dialog', (dialog) => {
      confirmation = dialog.message()
      void dialog.accept()
    })
    await chooseFromMenu(page, 'delete-story')
    await page.waitForURL(/\/stories$/)
    expect(confirmation).toContain('to the Trash')
    await expect(
      page.locator('[data-testid="story-row"][data-title="The Long Winter"]'),
    ).toHaveCount(0)

    // The scene waits for its story, and says so; the story does not wait for anything.
    await page.getByTestId('workspace-trash').click()
    await page.waitForURL(/\/trash$/)
    const storyRow = page.getByTestId('trash-row-The Long Winter')
    const gatesRow = page.getByTestId('trash-row-The Gates')
    await expect(storyRow.getByTestId('trash-kind')).toHaveText('Story')
    await expect(gatesRow.getByTestId('trash-waiting')).toContainText('Restore the story first')
    await expect(gatesRow.getByRole('button', { name: 'Restore scene “The Gates”' })).toBeDisabled()

    await storyRow.getByRole('button', { name: 'Restore story “The Long Winter”' }).click()
    await expect(page.getByTestId('trash-message')).toContainText('is back in your stories')
    await expect(gatesRow.getByTestId('trash-waiting')).toHaveCount(0)
    await expect(gatesRow.getByRole('button', { name: 'Restore scene “The Gates”' })).toBeEnabled()

    await page.getByTestId('trash-open').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
    await expect(scene(page, 'The Council')).toBeVisible()
    await expect(scene(page, 'The Gates')).toHaveCount(0)
  })

  test('a recovered draft is never offered to another account on the same browser, and waits for the account that wrote it', async ({
    page,
  }) => {
    const firstAccount = await signUp(page)
    const firstId = await accountId(page)
    const universeId = await newUniverse(page, unique('Private Draft '))
    const entityId = await seedEntity(page, universeId, 'Only Mine')
    await writeArticle(page, universeId, entityId, doc('Saved words.'))
    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`

    await page.goto(entryUrl)
    await page.getByTestId('article-edit').click()
    await typeAtEnd(page, ' For the first account only.')
    await expect.poll(() => copyTexts(page)).toContain('first account only')

    const tab = await crashAndReopen(page, entryUrl)
    await expect(tab.getByTestId('article-recovery')).toBeVisible()

    // Signing out destroys nothing: this tab holds no unsaved writing, so nothing asks, and the copy stays the first
    // account's.
    await clickSignOut(tab)
    await tab.waitForURL(/\/login$/)
    expect((await recoveryCopies(tab)).map((copy) => copy.accountId)).toEqual([firstId])

    // A second account on the same browser sees nothing of it - on its own article, or at the first account's address.
    await signUp(tab)
    const secondId = await accountId(tab)
    expect(secondId).not.toBe(firstId)
    const theirs = await newUniverse(tab, unique('Other World '))
    const theirEntry = await seedEntity(tab, theirs, 'Theirs')
    await writeArticle(tab, theirs, theirEntry, doc('Their words.'))
    await tab.goto(`/app/universes/${theirs}/lore/${theirEntry}`)
    await expect(tab.getByTestId('article').getByTestId('lore-article')).toHaveText('Their words.')
    await expect(tab.getByTestId('article-edit')).toBeEnabled()
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)

    await tab.goto(entryUrl)
    await expect(tab.getByTestId('universe-missing')).toBeVisible()
    await expect(tab.getByTestId('article-recovery')).toHaveCount(0)
    await expect(tab.getByText('first account only')).toHaveCount(0)
    expect((await recoveryCopies(tab)).every((copy) => copy.accountId === firstId)).toBe(true)

    // Back as the first account, the copy is offered again.
    await tab.goto('/app')
    await clickSignOut(tab)
    await tab.waitForURL(/\/login$/)
    await signIn(tab, firstAccount)
    await tab.goto(entryUrl)
    const recovery = tab.getByTestId('article-recovery')
    await expect(recovery).toBeVisible()
    await recovery.getByTestId('article-recovery-preview-toggle').click()
    await expect(recovery.getByTestId('article-recovery-preview')).toContainText(
      'first account only',
    )
  })

  test('recovered drafts, manuscript history and a mixed Trash read from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Recovery '))
    const entityId = await seedEntity(
      page,
      universeId,
      `An entry whose name runs on ${'and on '.repeat(12)}past any sensible length`,
    )
    await writeArticle(
      page,
      universeId,
      entityId,
      doc(`https://example.test/${'unbroken'.repeat(24)}`, 'Saved words.'),
    )
    const storyId = await seedStory(
      page,
      universeId,
      `A story whose title ${'keeps going '.repeat(10)}`,
    )
    const sceneId = await seedScene(page, universeId, storyId, `A scene title ${'x'.repeat(150)}`)
    await writeManuscript(page, universeId, storyId, sceneId, 'First.')
    await writeManuscript(page, universeId, storyId, sceneId, 'Second.')

    const thrownScene = await seedScene(page, universeId, storyId, `Thrown away ${'y'.repeat(160)}`)
    expect(
      (
        await page.request.delete(
          `/api/universes/${universeId}/stories/${storyId}/scenes/${thrownScene}`,
        )
      ).status(),
    ).toBe(204)
    const thrownEntry = await seedEntity(page, universeId, `Thrown entry ${'z'.repeat(140)}`)
    expect(
      (await page.request.delete(`/api/universes/${universeId}/entities/${thrownEntry}`)).status(),
    ).toBe(204)

    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`
    const manuscriptUrl = `/app/universes/${universeId}/stories/${storyId}/manuscript/${sceneId}`
    const trashUrl = `/app/universes/${universeId}/trash`

    // Unsaved writing in both editors, each kept, each left by a tab that dies.
    await page.goto(entryUrl)
    await page.getByTestId('article-edit').click()
    await typeAtEnd(page, ` ${'unbrokenrecoverytext'.repeat(8)}`)
    await expect.poll(() => copyTexts(page)).toContain('unbrokenrecoverytext')

    let tab = await crashAndReopen(page, manuscriptUrl)
    await tab.getByTestId('manuscript-editor').fill(`${'prose'.repeat(60)}\n\nMore.`)
    await expect.poll(async () => (await recoveryCopies(tab)).length).toBe(2)
    tab = await crashAndReopen(tab, trashUrl)

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [1440, 'light'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await tab.emulateMedia({ colorScheme })
      await tab.setViewportSize({ width, height: 900 })

      await tab.goto(entryUrl)
      await expect(tab.getByTestId('article-recovery')).toBeVisible()
      await tab.getByTestId('article-recovery-preview-toggle').click()
      await expect(tab.getByTestId('article-recovery-preview')).toBeVisible()
      expect(await scrollsSideways(tab), `article recovery at ${width}px`).toBe(false)
      for (const control of [
        'article-recovery-recover',
        'article-recovery-discard',
        'article-recovery-preview-toggle',
      ]) {
        const box = (await tab.getByTestId(control).boundingBox())!
        expect(box.x + box.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      if (colorScheme === 'dark') {
        const ground = await tab.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      await tab.goto(manuscriptUrl)
      await expect(tab.getByTestId('manuscript-recovery')).toBeVisible()
      await tab.getByTestId('manuscript-history-toggle').click()
      const list = tab.getByTestId('manuscript-history-list')
      await expect(list.locator('li')).toHaveCount(2)
      await list.locator('[data-version="1"]').getByTestId('manuscript-version-view').click()
      await expect(list.getByTestId('manuscript-version-snapshot')).toHaveText('First.')
      expect(await scrollsSideways(tab), `manuscript recovery and history at ${width}px`).toBe(
        false,
      )
      for (const control of [
        'manuscript-recovery-recover',
        'manuscript-recovery-discard',
        'manuscript-history-toggle',
      ]) {
        const box = (await tab.getByTestId(control).boundingBox())!
        expect(box.x + box.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }
      const restore = (await list.getByTestId('manuscript-version-restore').boundingBox())!
      expect(restore.x + restore.width, `version restore at ${width}px`).toBeLessThanOrEqual(edge)

      await tab.goto(trashUrl)
      await expect(tab.getByTestId('trash-list').locator('li')).toHaveCount(2)
      await expect(tab.getByTestId('trash-list').getByTestId('trash-kind')).toHaveText([
        'Entry',
        'Scene',
      ])
      expect(await scrollsSideways(tab), `trash at ${width}px`).toBe(false)
      for (const button of await tab.getByTestId('trash-list').getByRole('button').all()) {
        const box = (await button.boundingBox())!
        expect(box.x + box.width, `trash restore at ${width}px`).toBeLessThanOrEqual(edge)
      }
    }
  })
})
