import { expect, test, type Page } from '@playwright/test'
import { answerConfirms } from './support/confirm'

/**
 * Design refactor 007, the closing polish: the last authored forms that could lose writing without asking - a
 * universe's eras, its details, and a relation being written - now ask the way every other editor does, and the
 * Trash and a scene's point of view speak the same visual language as the rest of LorEvolve. Each test builds its own
 * account and universe.
 */
const PASSWORD = 'Test-password-123!'
const DISCARD = 'Close without saving your changes? They will be lost.'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('polish')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function newUniverse(page: Page, name = unique('World ')) {
  return (await api<{ id: string }>(page, 'POST', '/api/universes', { name, description: null }))!
    .id
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = (await api<{ id: string; name: string }[]>(
    page,
    'GET',
    `/api/universes/${universeId}/entity-types`,
  ))!
  return (await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: null,
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  }))!.id
}

/**
 * Every dialog the page raises, in order, each answered by the next answer queued - dismissed when none is queued. So a
 * test says what it expects to be asked, and a question nobody expected shows up in `asked`.
 */
async function dialogs(page: Page) {
  const asked: string[] = []
  const answers: boolean[] = []
  // A reload or a closed tab is the browser's own prompt; everything else is LorEvolve's confirmation (Issue #50).
  page.on('dialog', (dialog) => {
    asked.push(dialog.type() === 'beforeunload' ? 'beforeunload' : dialog.message())
    void (answers.shift() ? dialog.accept() : dialog.dismiss())
  })
  await answerConfirms(page, () => answers.shift() ?? false, asked)
  return {
    asked,
    answer(...next: boolean[]) {
      answers.push(...next)
    },
  }
}

test.describe('product-wide polish', () => {
  test("a universe's date periods ask before unsaved changes are left, put back read clean, and a save lets them go", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const settingsUrl = `/app/universes/${universeId}/chronology`
    const LEAVE = 'The chronology has unsaved changes. Leave without saving them?'
    const { asked, answer } = await dialogs(page)

    await page.goto(settingsUrl)
    const chronology = page.getByTestId('chronology-settings')

    // Untouched, leaving asks nothing.
    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(/\/timeline$/)
    await page.getByTestId('workspace-chronology').click()
    await page.waitForURL(/\/chronology$/)
    await expect.poll(() => asked).toEqual([])

    // An era being named is unsaved work: a link asks, and staying keeps it.
    await page.getByTestId('add-era').click()
    await page.getByTestId('era-name').fill('After the Fall')
    await page.getByTestId('workspace-timeline').click()
    await expect.poll(() => asked).toEqual([LEAVE])
    await expect(page).toHaveURL(/\/chronology$/)
    await expect(page.getByTestId('era-name')).toHaveValue('After the Fall')

    // Back asks too, once, and staying keeps the address and the draft.
    await page.goBack()
    await expect.poll(() => asked.length).toBe(2)
    await expect.poll(() => asked).toEqual([LEAVE, LEAVE])
    await expect(page).toHaveURL(/\/chronology$/)
    await expect(page.getByTestId('era-name')).toHaveValue('After the Fall')

    // Leaving the page itself is the browser's own question.
    await page.goto(`/app/universes/${universeId}/lore`).catch(() => undefined)
    await expect.poll(() => asked).toEqual([LEAVE, LEAVE, 'beforeunload'])
    await expect(page.getByTestId('era-name')).toHaveValue('After the Fall')

    // Discarding asks, once; refused, nothing is lost.
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect
      .poll(() => asked.at(-1))
      .toBe('Discard your changes to the chronology? They will be lost.')
    await expect(page.getByTestId('era-name')).toHaveValue('After the Fall')

    // Removed again, the list is what is stored: clean, and leaving asks nothing.
    await page.getByTestId('era-remove').click()
    await expect(page.getByTestId('era')).toHaveCount(0)
    const settled = asked.length
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(settled)

    // A failed save keeps the draft and the question; a saved one lets both go.
    await page.goto(settingsUrl)
    await page.getByTestId('add-era').click()
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-error')).toBeVisible()
    await page.getByTestId('workspace-lore').click()
    await expect.poll(() => asked.at(-1)).toBe(LEAVE)
    await expect(page).toHaveURL(/\/chronology$/)

    await page.getByTestId('era-name').fill('After the Fall')
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')
    const saved = asked.length
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(saved)

    // Answered yes, the author leaves.
    await page.goto(settingsUrl)
    await page.getByTestId('era-name').fill('After the Fall, renamed')
    answer(true)
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
  })

  test("a universe's details ask before unsaved changes are left, and Settings no longer opens inside the name", async ({
    page,
  }) => {
    await signUp(page)
    const name = unique('Harbour ')
    const universeId = await newUniverse(page, name)
    const { asked } = await dialogs(page)

    await page.goto(`/app/universes/${universeId}/settings`)
    const nameField = page.getByLabel('Name', { exact: true }).first()
    await expect(nameField).toHaveValue(name)
    await expect(nameField).not.toBeFocused()

    await page.getByLabel('Description').fill('A town built on the bones of a whale.')
    await page.getByTestId('workspace-lore').click()
    await expect
      .poll(() => asked)
      .toEqual([`“${name}” has unsaved changes. Leave without saving them?`])
    await expect(page).toHaveURL(/\/settings$/)

    // Put back, it is clean again.
    await page.getByLabel('Description').fill('')
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(1)

    // A new universe's form asks on Cancel only once something is written, and creating it asks nothing.
    await page.goto('/app')
    await page.getByTestId('new-universe').click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => asked).toHaveLength(1)
    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Salt '))
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => asked.at(-1)).toBe(DISCARD)
    await expect(page.getByLabel('Name')).toBeVisible()

    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    const created = asked.length
    await page.goto('/app')
    await expect.poll(() => asked).toHaveLength(created)
  })

  test('a relation being written asks before its notes are thrown away', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const base = `/api/universes/${universeId}`
    await api(page, 'POST', `${base}/relationship-types`, {
      name: 'serves',
      inverseName: 'is served by',
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic: 0,
    })
    const entityId = await seedEntity(page, universeId, 'Maren Ashvale')
    const LEAVE = 'This relation has unsaved changes. Leave without saving it?'
    const { asked, answer } = await dialogs(page)

    await page.goto(`/app/universes/${universeId}/lore/${entityId}/relations`)

    // Opened and closed untouched: nothing asked.
    await page.getByTestId('add-relationship').click()
    await page.getByTestId('relationship-form').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('relationship-form')).toHaveCount(0)
    await expect.poll(() => asked).toEqual([])

    await page.getByTestId('add-relationship').click()
    await page.getByTestId('relation-notes').fill('Sworn at the Spire.')

    // Leaving by a link asks, and staying keeps the notes.
    await page.getByTestId('workspace-lore').click()
    await expect.poll(() => asked).toEqual([LEAVE])
    await expect(page.getByTestId('relation-notes')).toHaveValue('Sworn at the Spire.')

    // Cancel asks once; refused, the notes stay.
    await page.getByTestId('relationship-form').getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => asked).toEqual([LEAVE, DISCARD])
    await expect(page.getByTestId('relation-notes')).toHaveValue('Sworn at the Spire.')

    // Accepted, the form closes and nothing is left standing.
    answer(true)
    await page.getByTestId('relationship-form').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('relationship-form')).toHaveCount(0)
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(3)
  })

  test("the Trash says what each thing was in words beside a decorative tile, and a scene's point of view is a tile, not an initial", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const base = `/api/universes/${universeId}`
    const maren = await seedEntity(page, universeId, 'Maren Ashvale')
    const doomed = await seedEntity(page, universeId, 'Forgotten Soldier')
    await api(page, 'DELETE', `${base}/entities/${doomed}`)

    await page.goto(`/app/universes/${universeId}/trash`)
    const row = page.getByTestId('trash-row-Forgotten Soldier')
    await expect(row.getByTestId('trash-kind')).toHaveText('Entry')
    await expect(row.locator('.trash__meta')).toContainText('Entry · Character')
    // The tile repeats what the words say, so it is hidden from assistive technology.
    await expect(row.locator('.trash__tile')).toHaveAttribute('aria-hidden', 'true')
    await expect(
      row.getByRole('button', { name: 'Restore entry “Forgotten Soldier”' }),
    ).toBeVisible()

    const story = (await api<{ id: string }>(page, 'POST', `${base}/stories`, {
      title: 'The Archive Forgets',
      premise: null,
      status: 0,
    }))!.id
    await api(page, 'POST', `${base}/stories/${story}/scenes`, {
      title: 'The door that should be shut',
      summary: null,
      notes: null,
      povEntityId: maren,
      chronology: null,
      entityIds: [],
      chapterId: null,
    })

    await page.goto(`/app/universes/${universeId}/stories/${story}`)
    const pov = page.getByTestId('scene-pov')
    await expect(pov.getByRole('link', { name: 'Maren Ashvale' })).toBeVisible()
    // No picture: the type's tile, not the first letter of the name drawn as a stand-in.
    await expect(pov.getByTestId('entity-portrait-blank')).toBeVisible()
    await expect(pov.getByTestId('entity-portrait-blank')).toHaveText('')
  })
})
