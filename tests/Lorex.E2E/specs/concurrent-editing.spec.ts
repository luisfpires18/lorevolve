import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'

/**
 * Concurrent edit protection (roadmap 044, ADR 0043): two people in their own browsers, working on the same entry or the
 * same scene's prose from the same saved version. The first save lands; the second is refused without losing a character
 * of what its author typed, shows them the latest, and saves only when they deliberately try again. Deterministic: each
 * save happens when the test says so, never in a race.
 */

const Role = { Editor: 3 } as const

interface Person {
  context: BrowserContext
  page: Page
  username: string
  email: string
}

async function person(
  browser: Browser,
  prefix: string,
  viewport?: { width: number; height: number },
): Promise<Person> {
  const context = await browser.newContext(viewport ? { viewport } : {})
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
  return { context, page, username, email }
}

/** A universe of the owner's, shared with an Editor through a real invitation, accepted. */
async function sharedWorld(owner: Person, editor: Person) {
  const id = await post(owner.page, '/api/universes', {
    name: unique('Shared Edits '),
    description: null,
    accentColor: null,
  })
  const invitation = await owner.page.request.post(`/api/universes/${id}/invitations`, {
    data: { email: editor.email, role: Role.Editor },
  })
  expect(invitation.ok()).toBe(true)
  const { claimToken } = (await invitation.json()) as { claimToken: string }
  expect(
    (
      await editor.page.request.post(
        `/api/invitations/claim/${encodeURIComponent(claimToken)}/accept`,
      )
    ).ok(),
  ).toBe(true)
  return id
}

/** Waits for a save the page makes to land, not only for the press. */
async function saved(page: Page, path: RegExp, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        path.test(new URL(candidate.url()).pathname) && candidate.request().method() === 'PUT',
    ),
    action(),
  ])
  return response
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('concurrent edits', () => {
  test('an Editor saving over the owner’s newer entry keeps every unsaved word, reviews the latest and saves deliberately', async ({
    browser,
  }) => {
    const owner = await person(browser, 'ceowner')
    const editor = await person(browser, 'ceeditor')
    const universeId = await sharedWorld(owner, editor)
    const types = (await (
      await owner.page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const entityId = await post(owner.page, `/api/universes/${universeId}/entities`, {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name: 'Ember Vale',
      summary: 'The heir.',
      canonStatus: 1,
      aliases: [],
      tags: [],
      fields: [],
    })
    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`
    const entryPath = new RegExp(`/entities/${entityId}$`)

    // Both open the same version and start editing.
    for (const { page } of [owner, editor]) {
      await page.goto(entryUrl)
      await page.getByTestId('edit-entity').click()
      await expect(page.getByTestId('entry-form')).toBeVisible()
    }

    // The owner saves first.
    await owner.page.getByLabel('Summary', { exact: true }).fill('The regent, for now.')
    const first = await saved(owner.page, entryPath, () =>
      owner.page.getByTestId('save-entity').click(),
    )
    expect(first.status()).toBe(200)

    // The Editor, still on the version both opened, saves their own words and is refused.
    const summary = editor.page.getByLabel('Summary', { exact: true })
    await summary.fill('The heir in exile, at least in the southern songs.')
    const refused = await saved(editor.page, entryPath, () =>
      editor.page.getByTestId('save-entity').click(),
    )
    expect(refused.status()).toBe(409)

    const conflict = editor.page.getByTestId('entry-conflict')
    await expect(conflict).toBeVisible()
    await expect(conflict.getByRole('alert')).toContainText(
      'This entry changed while you were editing.',
    )
    await expect(conflict).not.toContainText(/stale|409|version token|conflict/i)
    // Nothing they typed moved, and the form is still open and still unsaved.
    await expect(summary).toHaveValue('The heir in exile, at least in the southern songs.')
    await expect(editor.page.getByTestId('entry-form-status')).toHaveText('Unsaved changes')
    await expect(editor.page).toHaveURL(new RegExp(`/lore/${entityId}$`))

    // They review the latest: the owner's words beside their own, the latest's heading taking the focus.
    await conflict.getByTestId('entry-conflict-review').click()
    await expect(conflict.getByRole('heading', { name: 'Latest saved version' })).toBeFocused()
    const change = conflict.getByTestId('conflict-change')
    await expect(change).toHaveCount(1)
    await expect(change.getByRole('term')).toHaveText('Summary')
    await expect(change.getByTestId('conflict-latest-value')).toHaveText('The regent, for now.')
    await expect(change.getByTestId('conflict-mine-value')).toHaveText(
      'The heir in exile, at least in the southern songs.',
    )

    // Keeping their own saves nothing: the form is as it was, and the save is still theirs to make.
    await conflict.getByTestId('entry-conflict-keep').click()
    await expect(conflict).toHaveCount(0)
    await expect(editor.page.getByTestId('save-entity')).toBeFocused()
    await expect(summary).toHaveValue('The heir in exile, at least in the southern songs.')
    await expect(editor.page.getByTestId('entry-form-status')).toHaveText('Unsaved changes')

    // The owner saves again before the Editor retries: protection holds, and they are refused again.
    await owner.page.getByTestId('edit-entity').click()
    await owner.page.getByLabel('Summary', { exact: true }).fill('The regent, for good.')
    await saved(owner.page, entryPath, () => owner.page.getByTestId('save-entity').click())
    const again = await saved(editor.page, entryPath, () =>
      editor.page.getByTestId('save-entity').click(),
    )
    expect(again.status()).toBe(409)
    await expect(conflict).toBeVisible()
    await expect(summary).toHaveValue('The heir in exile, at least in the southern songs.')

    // Reviewed once more, and kept, the deliberate retry lands.
    await conflict.getByTestId('entry-conflict-review').click()
    await expect(conflict.getByTestId('conflict-latest-value')).toHaveText('The regent, for good.')
    await conflict.getByTestId('entry-conflict-keep').click()
    const retried = await saved(editor.page, entryPath, () =>
      editor.page.getByTestId('save-entity').click(),
    )
    expect(retried.status()).toBe(200)
    await expect(editor.page.getByTestId('entry-summary')).toHaveText(
      'The heir in exile, at least in the southern songs.',
    )

    // History holds the four saves that landed, each with its author - and nothing of the two refused.
    await owner.page.goto(`${entryUrl}/history`)
    const rows = owner.page.getByTestId('history-list').locator('li')
    await expect(rows).toHaveCount(4)
    const actor = (number: number) =>
      owner.page
        .locator(`[data-testid="history-list"] [data-version="${number}"]`)
        .getByTestId('version-actor')
    await expect(actor(4)).toHaveText(`by ${editor.username}`)
    await expect(actor(3)).toHaveText(`by ${owner.username}`)
    await expect(actor(2)).toHaveText(`by ${owner.username}`)

    await owner.context.close()
    await editor.context.close()
  })

  test('an Editor writing a scene’s prose on a phone keeps it exactly through a refused save and saves it after reading the owner’s', async ({
    browser,
  }) => {
    const owner = await person(browser, 'cemsowner')
    const editor = await person(browser, 'cemseditor', { width: 390, height: 844 })
    const universeId = await sharedWorld(owner, editor)
    const storyId = await post(owner.page, `/api/universes/${universeId}/stories`, {
      title: 'The Drowned Heir',
      premise: null,
      status: 1,
    })
    const sceneId = await post(
      owner.page,
      `/api/universes/${universeId}/stories/${storyId}/scenes`,
      {
        title: 'The Causeway',
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId: null,
      },
    )
    const sceneUrl = `/app/universes/${universeId}/stories/${storyId}/manuscript/${sceneId}`
    const manuscriptPath = /\/manuscript$/

    for (const { page } of [owner, editor]) {
      await page.goto(sceneUrl)
      await expect(page.getByTestId('manuscript-editor')).toHaveValue('')
    }

    await owner.page
      .getByTestId('manuscript-editor')
      .fill('The tide came in before she reached the gate.')
    await saved(owner.page, manuscriptPath, () => owner.page.getByTestId('manuscript-save').click())

    // Every line break, space and character the Editor typed is still in the box after the refusal.
    const prose = 'She ran.\n\n  The causeway was already under water; still she ran.\n'
    const box = editor.page.getByTestId('manuscript-editor')
    await box.fill(prose)
    const refused = await saved(editor.page, manuscriptPath, () =>
      editor.page.getByTestId('manuscript-save').click(),
    )
    expect(refused.status()).toBe(409)
    const conflict = editor.page.getByTestId('manuscript-conflict')
    await expect(conflict).toBeVisible()
    await expect(box).toHaveValue(prose)
    await expect(editor.page.getByTestId('manuscript-status')).toHaveText('Unsaved changes')

    // The latest is readable whole, on the phone, without the page scrolling sideways.
    await conflict.getByTestId('manuscript-conflict-review').click()
    await expect(conflict.getByTestId('conflict-latest-text')).toHaveText(
      'The tide came in before she reached the gate.',
    )
    expect(await sideways(editor.page)).toBeLessThanOrEqual(0)
    await expect(box).toHaveValue(prose)

    await conflict.getByTestId('manuscript-conflict-keep').click()
    await expect(conflict).toHaveCount(0)
    await expect(box).toBeFocused()
    await expect(box).toHaveValue(prose)
    const retried = await saved(editor.page, manuscriptPath, () =>
      editor.page.getByTestId('manuscript-save').click(),
    )
    expect(retried.status()).toBe(200)

    // Saved exactly, and the manuscript's history has the owner's version and the Editor's: none for the refused save.
    const stored = (await (
      await owner.page.request.get(
        `/api/universes/${universeId}/stories/${storyId}/scenes/${sceneId}/manuscript`,
      )
    ).json()) as { content: string }
    expect(stored.content).toBe(prose)
    const versions = (await (
      await owner.page.request.get(
        `/api/universes/${universeId}/stories/${storyId}/scenes/${sceneId}/manuscript/revisions`,
      )
    ).json()) as { actorName: string | null }[]
    expect(versions.map((version) => version.actorName)).toEqual([editor.username, owner.username])

    await owner.context.close()
    await editor.context.close()
  })
})
