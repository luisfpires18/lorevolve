import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import { acceptConfirm, answerConfirms } from './support/confirm'

/**
 * Ideas, end to end (ADR 0030): possibilities kept apart from lore, owned by the account.
 *
 * An idea may belong to no universe or to one, is reached globally and from inside its universe through the same list and
 * editor, may point at its universe's lore and stories, is deleted into Recently deleted and restored from there, and
 * outlives a deleted universe. Unsaved idea writing is kept on this device as a recovery copy, offered and never applied,
 * and never offered to another account.
 *
 * Each test registers its own account. A tab "dies" with no question asked by opening another tab on the same browser
 * and closing the first.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('muser')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function accountId(page: Page) {
  const response = await page.request.get('/api/auth/me')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { id: string }).id
}

async function seedUniverse(page: Page, name: string) {
  const created = await page.request.post('/api/universes', {
    data: { name, description: null, accentColor: '#4f6bd6' },
  })
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
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

async function seedScene(page: Page, universeId: string, storyId: string, title: string) {
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
        chapterId: null,
      },
    },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

interface IdeaRead {
  id: string
  title: string
  body: string
  universe: { id: string; name: string } | null
  references: { kind: number; id: string; name: string; isInTrash: boolean }[]
  updatedAt: string
}

async function seedIdea(
  page: Page,
  title: string,
  body = '',
  universeId: string | null = null,
  references: { kind: number; id: string }[] = [],
) {
  const created = await page.request.post('/api/ideas', {
    data: { title, body, universeId, references, expectedUpdatedAt: null },
  })
  expect(created.status()).toBe(201)
  return (await created.json()) as IdeaRead
}

async function readIdea(page: Page, id: string) {
  const response = await page.request.get(`/api/ideas/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as IdeaRead
}

/** Saves straight through the API, as another window or device would, over whatever is stored now. */
async function writeIdeaBody(page: Page, id: string, body: string) {
  const current = await readIdea(page, id)
  const saved = await page.request.put(`/api/ideas/${id}`, {
    data: {
      title: current.title,
      body,
      universeId: current.universe?.id ?? null,
      references: current.references.map(({ kind, id: target }) => ({ kind, id: target })),
      expectedUpdatedAt: current.updatedAt,
    },
  })
  expect(saved.status()).toBe(200)
}

interface RecoveryCopy {
  key: string
  accountId: string
  universeId: string | null
  kind: string
  contentId: string
  content: string
}

/** The recovery copies this browser holds, read straight from its storage rather than through the app. */
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

async function ideaCopies(page: Page) {
  return (await recoveryCopies(page)).filter((copy) => copy.kind === 'idea')
}

/** The tab dies with no question asked, and the same page is opened in a new tab on the same browser. */
async function crashAndReopen(page: Page, url: string) {
  const next = await page.context().newPage()
  await page.close()
  await next.goto(url)
  return next
}

/** Saves through the page and waits until the API has confirmed it and the page says so. */
async function saveWith(page: Page, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        /\/api\/ideas(\/[0-9a-f-]+)?$/.test(new URL(response.url()).pathname) &&
        ['PUT', 'POST'].includes(response.request().method()) &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('idea-status')).toHaveText('Saved')
}

/**
 * Creates through the page: waits for the API to confirm the new idea, then for the list the author is sent back to,
 * and hands back the new idea's id.
 */
async function createWith(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/ideas' &&
        response.request().method() === 'POST' &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('idea-editor')).toHaveCount(0)
  return ((await response.json()) as { id: string }).id
}

function row(page: Page, title: string) {
  return page.locator(`[data-testid="idea-row"][data-title="${title}"]`)
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('ideas', () => {
  test('an idea is kept with no universe, edited, filtered, given a universe and a reference, and leads to what it references', async ({
    page,
  }) => {
    await signUp(page)
    const worldA = await seedUniverse(page, unique('Floating Reach '))
    const worldB = await seedUniverse(page, unique('Other Shore '))
    const arlen = await seedEntity(page, worldA, 'Arlen Vance')
    await seedIdea(page, 'An idea about the other shore', 'Tides that run uphill.', worldB)

    // Reached from the universes screen, without opening a world.
    await page.goto('/app')
    await page.getByTestId('workspacebar-ideas').click()
    await page.waitForURL('/app/ideas')
    await expect(row(page, 'An idea about the other shore')).toBeVisible()

    await page.getByTestId('new-idea').click()
    await page.waitForURL('/app/ideas/new')
    const title = page.getByTestId('idea-title')
    const body = page.getByTestId('idea-body')
    await expect(title).toBeFocused()
    await expect(page.getByTestId('idea-universe')).toHaveValue('')
    await expect(page.getByTestId('idea-add-reference')).toBeDisabled()
    await expect(page.getByTestId('idea-references-need-universe')).toBeVisible()

    // A title is required, and saying so keeps what was written.
    await body.fill('Nobody below has seen its underside.')
    await page.getByTestId('idea-save').click()
    await expect(page.getByTestId('idea-title-error')).toContainText('Give the idea a title')
    await expect(title).toBeFocused()
    await expect(title).toHaveAttribute('aria-invalid', 'true')

    await title.fill('Maybe this city floats')
    await expect(page.getByTestId('idea-title-error')).toHaveCount(0)
    // Created, and back among all ideas: the list says so, and holds it.
    const ideaId = await createWith(page, () => page.getByTestId('idea-save').click())
    await page.waitForURL('/app/ideas')
    await expect(page.getByTestId('ideas-created-notice')).toContainText(
      'Created “Maybe this city floats”',
    )
    await row(page, 'Maybe this city floats').getByTestId('idea-open').click()
    await page.waitForURL(`/app/ideas/${ideaId}`)
    await expect(page.getByTestId('idea-heading')).toHaveText('Maybe this city floats')

    // Edited and saved with the keyboard.
    await expect(body).not.toHaveAttribute('readonly')
    await body.press('End')
    await body.pressSequentially(' It drifts north each spring.')
    await expect(page.getByTestId('idea-status')).toHaveText('Unsaved changes')
    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))
    expect((await readIdea(page, ideaId)).body).toBe(
      'Nobody below has seen its underside. It drifts north each spring.',
    )

    // The list says which ideas have no universe, in words, and filters by it.
    await page.getByTestId('idea-back').click()
    await page.waitForURL('/app/ideas')
    await expect(row(page, 'Maybe this city floats').getByTestId('idea-universe-label')).toHaveText(
      'No universe',
    )
    await expect(row(page, 'Maybe this city floats').getByTestId('idea-excerpt')).toContainText(
      'drifts north',
    )

    await page.getByTestId('ideas-show').selectOption('unassigned')
    await expect(row(page, 'An idea about the other shore')).toHaveCount(0)
    await expect(row(page, 'Maybe this city floats')).toBeVisible()
    await page.getByTestId('ideas-show').selectOption(worldB)
    await expect(row(page, 'Maybe this city floats')).toHaveCount(0)
    await expect(row(page, 'An idea about the other shore')).toBeVisible()

    // The filter lives in the address, so a reload keeps it.
    await page.reload()
    await expect(page.getByTestId('ideas-show')).toHaveValue(worldB)
    await page.getByTestId('ideas-show').selectOption('')
    await page.getByTestId('ideas-search').fill('underside')
    await expect(page.getByTestId('idea-row')).toHaveCount(1)
    await expect(row(page, 'Maybe this city floats')).toBeVisible()
    await page.getByTestId('ideas-search').fill('nothing matches this')
    await expect(page.getByTestId('ideas-empty')).toContainText('No ideas match')
    await page.getByTestId('ideas-search').fill('')
    await expect(page.getByTestId('idea-row')).toHaveCount(2)

    // Given a universe, and a reference to its lore.
    await row(page, 'Maybe this city floats').getByTestId('idea-open').click()
    await page.waitForURL(`/app/ideas/${ideaId}`)
    await page.getByTestId('idea-universe').selectOption(worldA)
    await page.getByTestId('idea-add-reference').click()
    const picker = page.getByTestId('idea-reference-picker')
    await expect(picker).toBeVisible()
    await expect(page.getByTestId('idea-picker-search')).toBeFocused()
    await page.getByTestId('idea-picker-search').fill('Arl')
    await picker.locator('[data-testid="idea-picker-option"][data-name="Arlen Vance"]').click()
    await expect(picker).toHaveCount(0)
    await expect(page.getByTestId('idea-add-reference')).toBeFocused()

    const reference = page.locator('[data-testid="idea-reference"][data-name="Arlen Vance"]')
    await expect(reference).toHaveAttribute('data-kind', 'Lore')
    await saveWith(page, () => page.getByTestId('idea-save').click())

    const saved = await readIdea(page, ideaId)
    expect(saved.universe?.id).toBe(worldA)
    expect(saved.references.map((one) => one.id)).toEqual([arlen])

    await page.reload()
    await expect(reference).toBeVisible()
    await page.getByTestId('idea-back').click()
    await expect(
      row(page, 'Maybe this city floats').getByTestId('idea-universe-label'),
    ).toContainText('Floating Reach')
    await expect(row(page, 'Maybe this city floats')).toContainText('1 reference')

    // A reference opens what it points at.
    await row(page, 'Maybe this city floats').getByTestId('idea-open').click()
    await reference.getByTestId('idea-reference-open').click()
    await page.waitForURL(`/app/universes/${worldA}/lore/${arlen}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Arlen Vance')
  })

  test('an idea started in a universe starts there, the universe lists only its own, and the picker offers only its content', async ({
    page,
  }) => {
    await signUp(page)
    const worldA = await seedUniverse(page, unique('Ashen Vale '))
    const worldB = await seedUniverse(page, unique('Distant Isle '))
    await seedEntity(page, worldA, 'Alenna')
    await seedEntity(page, worldB, 'Alenna of the Isle')
    const storyId = await seedStory(page, worldA, 'The Long Winter')
    const sceneId = await seedScene(page, worldA, storyId, 'The Council')
    await seedIdea(page, 'An idea for the isle', '', worldB)
    await seedIdea(page, 'A loose thought')

    await page.goto(`/app/universes/${worldA}`)
    await page.getByTestId('workspace-ideas').click()
    await page.waitForURL(`/app/universes/${worldA}/ideas`)
    await expect(page.getByTestId('ideas-empty')).toContainText('No ideas yet')
    await expect(page.getByTestId('ideas-show')).toHaveCount(0)

    await page.getByTestId('new-idea').click()
    await page.waitForURL(`/app/universes/${worldA}/ideas/new`)
    await expect(page.getByTestId('idea-universe')).toHaveValue(worldA)
    await page.getByTestId('idea-title').fill('What if the council lies?')

    // Scenes of this universe, with where they are told.
    await page.getByTestId('idea-add-reference').click()
    const picker = page.getByTestId('idea-reference-picker')
    // By keyboard: a kind is a button, and so is each thing offered.
    await picker.getByTestId('idea-picker-kind-scene').focus()
    await page.keyboard.press('Enter')
    await expect(picker.getByTestId('idea-picker-kind-scene')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const council = picker.locator('[data-testid="idea-picker-option"][data-name="The Council"]')
    await expect(council).toContainText('In “The Long Winter”')
    await council.focus()
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(0)
    await expect(page.getByTestId('idea-add-reference')).toBeFocused()

    // Lore of this universe only: another universe's Alenna is not offered, by any search.
    await page.getByTestId('idea-add-reference').click()
    await page.getByTestId('idea-picker-search').fill('Alenna')
    await expect(picker.getByTestId('idea-picker-option')).toHaveCount(1)
    await expect(picker.getByTestId('idea-picker-option')).toHaveAttribute('data-name', 'Alenna')
    await page.getByTestId('idea-picker-search').fill('Isle')
    await expect(picker.getByTestId('idea-picker-empty')).toBeVisible()
    // Escape clears the search box first, as a search box does, then closes the picker and hands the focus back.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('idea-picker-search')).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(page.getByTestId('idea-add-reference')).toBeFocused()

    const ideaId = await createWith(page, () => page.getByTestId('idea-save').click())
    expect((await readIdea(page, ideaId)).references.map((one) => one.id)).toEqual([sceneId])

    // Created, and back in this universe's ideas - only its own here; every idea globally.
    await page.waitForURL(`/app/universes/${worldA}/ideas`)
    await expect(page.getByTestId('idea-row')).toHaveCount(1)
    await expect(row(page, 'What if the council lies?')).toBeVisible()
    await page.getByTestId('ideas-all').click()
    await page.waitForURL('/app/ideas')
    await expect(page.getByTestId('idea-row')).toHaveCount(3)

    // A reference opens its scene in its story.
    await page.goto(`/app/universes/${worldA}/ideas/${ideaId}`)
    await page
      .locator('[data-testid="idea-reference"][data-name="The Council"]')
      .getByTestId('idea-reference-open')
      .click()
    await page.waitForURL(`/app/universes/${worldA}/stories/${storyId}#scene-${sceneId}`)
    await expect(page.locator('[data-testid="scene"][data-title="The Council"]')).toBeVisible()

    // Moving the idea out of its universe asks, and takes the reference out of the unsaved idea in plain sight.
    await page.goto(`/app/universes/${worldA}/ideas/${ideaId}`)
    await page.getByTestId('idea-universe').selectOption('')
    await acceptConfirm(page, 'references stay inside its universe')
    await expect(page.getByTestId('idea-reference')).toHaveCount(0)
    await expect(page.getByTestId('idea-references-need-universe')).toBeVisible()
    expect((await readIdea(page, ideaId)).references).toHaveLength(1)
    await saveWith(page, () => page.getByTestId('idea-save').click())
    const moved = await readIdea(page, ideaId)
    expect(moved.universe).toBeNull()
    expect(moved.references).toEqual([])
    await expect(page.getByTestId('idea-elsewhere')).toContainText('belongs to no universe')
  })

  test('a universe’s Ideas open only its own ideas: one started there but created elsewhere returns to all ideas', async ({
    page,
  }) => {
    await signUp(page)
    const home = await seedUniverse(page, unique('Home World '))
    const other = await seedUniverse(page, unique('Other World '))

    // Started here and kept here: created, and back in this universe's ideas.
    await page.goto(`/app/universes/${home}/ideas/new`)
    await page.getByTestId('idea-title').fill('A thought that stays')
    await createWith(page, () => page.getByTestId('idea-save').click())
    await page.waitForURL(`/app/universes/${home}/ideas`)
    await expect(row(page, 'A thought that stays')).toBeVisible()

    // Started here but given no universe, or another one: back among all ideas, where it lives.
    const moved: [string, string][] = []
    for (const [title, universe] of [
      ['A thought for nowhere', ''],
      ['A thought for elsewhere', other],
    ] as const) {
      await page.goto(`/app/universes/${home}/ideas/new`)
      await page.getByTestId('idea-title').fill(title)
      await page.getByTestId('idea-universe').selectOption(universe)
      const id = await createWith(page, () => page.getByTestId('idea-save').click())
      await page.waitForURL('/app/ideas')
      await expect(row(page, title)).toBeVisible()
      moved.push([id, title])
    }

    // Neither opens at this universe's address: nothing of it shows, and a link leads to where it does.
    for (const [id, title] of moved) {
      await page.goto(`/app/universes/${home}/ideas/${id}`)
      await expect(page.getByTestId('idea-not-in-universe')).toContainText('does not open here')
      await expect(page.getByTestId('idea-editor')).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText(title)
    }
    await page.getByRole('link', { name: 'Open it in all ideas' }).click()
    await page.waitForURL(`/app/ideas/${moved[1][0]}`)
    await expect(page.getByTestId('idea-heading')).toHaveText('A thought for elsewhere')
  })

  test('unsaved idea writing comes back as a recovered draft, is kept by failed and refused saves, and is never offered to another account', async ({
    page,
  }) => {
    await signUp(page)
    const firstAccount = await accountId(page)
    const idea = await seedIdea(page, 'Saved title', 'Saved body.')
    const ideaUrl = `/app/ideas/${idea.id}`
    const body = page.getByTestId('idea-body')

    await page.goto(ideaUrl)
    // Writing waits, briefly, while this device is asked whether it kept a copy.
    await expect(body).not.toHaveAttribute('readonly')
    await body.press('End')
    await body.pressSequentially(' Unsaved: 北の門 👩‍👩‍👧')
    await expect(page.getByTestId('idea-status')).toHaveText('Unsaved changes')
    await expect
      .poll(async () => (await ideaCopies(page)).map((copy) => [copy.contentId, copy.universeId]))
      .toEqual([[idea.id, null]])
    await expect.poll(async () => (await ideaCopies(page))[0]?.content ?? '').toContain('北の門')
    expect((await readIdea(page, idea.id)).body).toBe('Saved body.')

    // The tab dies. Opened again, the saved idea is what is shown, held; the copy is offered, never applied.
    let tab = await crashAndReopen(page, ideaUrl)
    let recovery = tab.getByTestId('idea-recovery')
    await expect(recovery).toBeVisible()
    await expect(tab.getByTestId('idea-body')).toHaveValue('Saved body.')
    await expect(tab.getByTestId('idea-body')).toHaveAttribute('readonly', '')
    await expect(tab.getByTestId('idea-save')).toBeDisabled()
    await recovery.getByTestId('idea-recovery-preview-toggle').click()
    await expect(recovery.getByTestId('idea-recovery-preview')).toContainText('北の門')

    // Discarded: the saved idea stays, and the copy goes.
    await recovery.getByTestId('idea-recovery-discard').click()
    await acceptConfirm(tab)
    await expect(recovery).toHaveCount(0)
    await expect(tab.getByTestId('idea-body')).toHaveValue('Saved body.')
    await expect.poll(async () => (await ideaCopies(tab)).length).toBe(0)
    expect((await readIdea(tab, idea.id)).body).toBe('Saved body.')

    // Written again, another dead tab, and this time recovered: unsaved, in the form, still not saved.
    await tab.getByTestId('idea-body').press('End')
    await tab.getByTestId('idea-body').pressSequentially(' Kept this time.')
    await expect
      .poll(async () => (await ideaCopies(tab))[0]?.content ?? '')
      .toContain('Kept this time.')
    tab = await crashAndReopen(tab, ideaUrl)
    recovery = tab.getByTestId('idea-recovery')
    await recovery.getByTestId('idea-recovery-recover').click()
    await expect(recovery).toHaveCount(0)
    await expect(tab.getByTestId('idea-body')).toHaveValue('Saved body. Kept this time.')
    await expect(tab.getByTestId('idea-status')).toHaveText('Unsaved changes')
    expect((await readIdea(tab, idea.id)).body).toBe('Saved body.')

    // A failed save keeps the writing and the copy.
    await tab.route(`**/api/ideas/${idea.id}`, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, body: '' })
        : route.fallback(),
    )
    await tab.getByTestId('idea-save').click()
    await expect(tab.getByTestId('idea-error')).toContainText('could not be saved')
    await expect(tab.getByTestId('idea-body')).toHaveValue('Saved body. Kept this time.')
    await tab.unroute(`**/api/ideas/${idea.id}`)
    expect((await ideaCopies(tab))[0]?.content ?? '').toContain('Kept this time.')

    // A refused save - saved from another window meanwhile - keeps them too, until the author chooses.
    await writeIdeaBody(tab, idea.id, 'Saved from another window.')
    await tab.getByTestId('idea-save').click()
    await expect(tab.getByTestId('idea-conflict')).toBeVisible()
    await expect(tab.getByTestId('idea-body')).toHaveValue('Saved body. Kept this time.')
    expect((await ideaCopies(tab))[0]?.content ?? '').toContain('Kept this time.')
    expect((await readIdea(tab, idea.id)).body).toBe('Saved from another window.')

    await saveWith(tab, () => tab.getByTestId('idea-keep-mine').click())
    expect((await readIdea(tab, idea.id)).body).toBe('Saved body. Kept this time.')
    await expect.poll(async () => (await ideaCopies(tab)).length).toBe(0)

    // A new idea's unsaved writing comes back too, at the address it was started from, and goes once created.
    await tab.goto('/app/ideas/new')
    await tab.getByTestId('idea-title').fill('Half a thought')
    await expect
      .poll(async () => (await ideaCopies(tab)).map((copy) => copy.contentId))
      .toEqual(['new'])
    tab = await crashAndReopen(tab, '/app/ideas/new')
    await tab.getByTestId('idea-recovery').getByTestId('idea-recovery-recover').click()
    await expect(tab.getByTestId('idea-title')).toHaveValue('Half a thought')
    await expect(tab.getByTestId('idea-status')).toHaveText('Unsaved changes')
    await createWith(tab, () => tab.getByTestId('idea-save').click())
    await tab.waitForURL('/app/ideas')
    await expect.poll(async () => (await ideaCopies(tab)).length).toBe(0)

    // Another unsaved new idea, a dead tab, and a sign-out from a page with nothing unsaved: the copy stays, the first
    // account's alone.
    await tab.goto('/app/ideas/new')
    await tab.getByTestId('idea-title').fill('A secret of the first account')
    await expect.poll(async () => (await ideaCopies(tab)).length).toBe(1)
    tab = await crashAndReopen(tab, '/app')
    await clickSignOut(tab)
    await tab.waitForURL(/\/login$/)
    expect((await ideaCopies(tab)).map((copy) => copy.accountId)).toEqual([firstAccount])

    // A second account on the same browser is offered nothing - not at the same address, not at the first one's idea.
    await signUp(tab)
    await tab.goto('/app/ideas/new')
    await expect(tab.getByTestId('idea-title')).toBeFocused()
    await expect(tab.getByTestId('idea-title')).toHaveValue('')
    await expect(tab.getByTestId('idea-recovery')).toHaveCount(0)
    await tab.goto(ideaUrl)
    await expect(tab.getByTestId('idea-missing')).toBeVisible()
    await expect(tab.getByTestId('idea-recovery')).toHaveCount(0)
    expect((await ideaCopies(tab)).map((copy) => copy.accountId)).toEqual([firstAccount])
  })

  test('a deleted idea leaves the list, waits in Recently deleted, and opens whole once restored', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedUniverse(page, unique('Binned World '))
    const entity = await seedEntity(page, world, 'Mira')
    const idea = await seedIdea(
      page,
      'What if Mira betrays Arlen?',
      'At the gate, at dusk.',
      world,
      [{ kind: 0, id: entity }],
    )
    await seedIdea(page, 'Still here', '', world)

    await page.goto(`/app/universes/${world}/ideas/${idea.id}`)
    await page.getByTestId('idea-actions').click()
    await page.getByTestId('idea-delete').click()
    await acceptConfirm(page, 'goes to Recently deleted')
    await page.waitForURL(`/app/universes/${world}/ideas`)
    await expect(page.getByTestId('ideas-deleted-notice')).toContainText('was deleted')
    await expect(row(page, 'What if Mira betrays Arlen?')).toHaveCount(0)
    await expect(row(page, 'Still here')).toBeVisible()

    // The Trash points to where deleted ideas wait.
    await page.goto(`/app/universes/${world}/trash`)
    await page.getByTestId('trash-ideas-pointer').getByRole('link').click()
    await page.waitForURL(`/app/universes/${world}/ideas?view=deleted`)
    await expect(page.getByTestId('ideas-view-deleted')).toHaveAttribute('aria-pressed', 'true')
    const deleted = row(page, 'What if Mira betrays Arlen?')
    await expect(deleted).toContainText('Deleted')
    await expect(row(page, 'Still here')).toHaveCount(0)

    await deleted.getByTestId('idea-restore').click()
    await expect(page.getByTestId('ideas-message')).toContainText('is back in your ideas')
    await expect(page.getByTestId('ideas-message').locator('..')).toBeFocused()
    await expect(page.getByTestId('ideas-empty')).toContainText('Nothing recently deleted')

    await page.getByTestId('ideas-open-restored').click()
    await page.waitForURL(`/app/universes/${world}/ideas/${idea.id}`)
    await expect(page.getByTestId('idea-heading')).toHaveText('What if Mira betrays Arlen?')
    await expect(page.getByTestId('idea-body')).toHaveValue('At the gate, at dusk.')
    await expect(page.getByTestId('idea-universe')).toHaveValue(world)
    await expect(page.locator('[data-testid="idea-reference"][data-name="Mira"]')).toBeVisible()
    await expect(page.getByTestId('idea-status')).toHaveText('Saved')
  })

  test('deleting a universe keeps its ideas, with no universe and every word', async ({ page }) => {
    await signUp(page)
    const doomed = await seedUniverse(page, unique('Doomed World '))
    const entity = await seedEntity(page, doomed, 'The Last King')
    const idea = await seedIdea(
      page,
      'An idea that outlives its world',
      'Every word stays.',
      doomed,
      [{ kind: 0, id: entity }],
    )

    await page.goto(`/app/universes/${doomed}/settings?tab=advanced`)
    await page.getByTestId('toggle-archive').click()
    await expect(page.getByTestId('delete-ideas-note')).toContainText(
      'Your ideas about it are kept',
    )
    await page.getByRole('button', { name: 'Delete universe' }).click()
    await page.getByTestId('confirm-delete').click()
    await page.waitForURL('/app')

    await page.getByTestId('workspacebar-ideas').click()
    const kept = row(page, 'An idea that outlives its world')
    await expect(kept.getByTestId('idea-universe-label')).toHaveText('No universe')
    await kept.getByTestId('idea-open').click()
    await page.waitForURL(`/app/ideas/${idea.id}`)
    await expect(page.getByTestId('idea-body')).toHaveValue('Every word stays.')
    await expect(page.getByTestId('idea-universe')).toHaveValue('')
    await expect(page.getByTestId('idea-references-need-universe')).toBeVisible()
  })

  test('asking before unsaved idea writing is left: a link, Back and Forward, and signing out, once each', async ({
    page,
  }) => {
    await signUp(page)
    const idea = await seedIdea(page, 'Guarded', 'Saved words.')
    const ideaUrl = new RegExp(`/app/ideas/${idea.id}$`)

    const questions: string[] = []
    let answer: 'stay' | 'leave' = 'stay'
    await answerConfirms(page, () => answer === 'leave', questions)

    await page.goto('/app/ideas')
    await row(page, 'Guarded').getByTestId('idea-open').click()
    await page.waitForURL(ideaUrl)

    // Nothing unsaved: history moves, and nothing asks.
    await page.goBack()
    await page.waitForURL('/app/ideas')
    await page.goForward()
    await page.waitForURL(ideaUrl)
    await expect.poll(() => questions).toEqual([])

    await page.getByTestId('idea-title').fill('Guarded, and changed')
    await expect(page.getByTestId('idea-status')).toHaveText('Unsaved changes')

    await page.getByTestId('idea-back').click()
    await expect.poll(() => questions.length).toBe(1)
    await expect.poll(() => questions[0]).toContain('“Guarded, and changed” has unsaved changes')
    await expect(page).toHaveURL(ideaUrl)

    await page.goBack()
    await expect.poll(() => questions.length).toBe(2)
    await expect(page).toHaveURL(ideaUrl)
    await expect(page.getByTestId('idea-title')).toHaveValue('Guarded, and changed')

    await clickSignOut(page)
    await expect.poll(() => questions.length).toBe(3)
    await expect(page).toHaveURL(ideaUrl)

    // Leaving by choice lets the writing - and its recovery copy - go.
    await expect.poll(async () => (await ideaCopies(page)).length).toBe(1)
    answer = 'leave'
    await page.goBack()
    await expect.poll(() => questions.length).toBe(4)
    await expect(page.getByTestId('idea-list')).toBeVisible()
    await expect(page).toHaveURL('/app/ideas')
    expect((await readIdea(page, idea.id)).title).toBe('Guarded')
    await expect.poll(async () => (await ideaCopies(page)).length).toBe(0)
    await expect.poll(() => questions).toHaveLength(4)
  })

  test('ideas read from a phone to a wide desktop, light and dark, with long words and other scripts', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedUniverse(
      page,
      unique('A universe whose name runs on for rather longer than any name should '),
    )
    const entity = await seedEntity(page, world, `Entry${'unbroken'.repeat(12)}`)
    const longTitle = `Ærendel—北の門—${'Unbroken'.repeat(22)}`.slice(0, 200)
    const idea = await seedIdea(
      page,
      longTitle,
      `https://example.test/${'unbroken'.repeat(40)}\n\n${'Mira ✦ Arlen — 物語. '.repeat(80)}`,
      world,
      [{ kind: 0, id: entity }],
    )
    await seedIdea(page, 'Short and unassigned')

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [390, 'light'],
      [1440, 'light'],
      [1440, 'dark'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })

      await page.goto('/app/ideas')
      await expect(page.getByTestId('idea-row')).toHaveCount(2)
      expect(await scrollsSideways(page)).toBe(false)

      await page.goto(`/app/universes/${world}/ideas`)
      await expect(page.getByTestId('idea-row')).toHaveCount(1)
      expect(await scrollsSideways(page)).toBe(false)

      await page.goto(`/app/ideas/${idea.id}`)
      await expect(page.getByTestId('idea-heading')).toHaveText(longTitle)
      await expect(page.getByTestId('idea-reference')).toHaveCount(1)
      expect(await scrollsSideways(page)).toBe(false)

      // Save stays on the screen, and the picker fits it.
      await expect(page.getByTestId('idea-save')).toBeInViewport()
      await page.getByTestId('idea-add-reference').click()
      await expect(page.getByTestId('idea-reference-picker')).toBeVisible()
      expect(await scrollsSideways(page)).toBe(false)
      await page.getByTestId('idea-picker-close').click()
      await expect(page.getByTestId('idea-reference-picker')).toHaveCount(0)
    }
  })
})
