import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'

/**
 * Task 045: suggested changes, as separate people in their own browsers. The API's rules are proved by its own tests; this
 * proves what each person sees: a Reviewer suggesting through the entry's own form without changing it, the owner reading
 * the suggestion under Review and accepting it as their own edit, a suggestion made before someone else's save that can
 * no longer be accepted, and a story and a scene suggested from their drawers, one rejected and one accepted.
 */

const Role = { Reviewer: 2, Editor: 3 } as const

interface Person {
  context: BrowserContext
  page: Page
  username: string
  email: string
}

async function person(browser: Browser, prefix: string): Promise<Person> {
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
  return { context, page, username, email }
}

async function share(owner: Page, universeId: string, member: Person, role: number) {
  const invitation = await owner.request.post(`/api/universes/${universeId}/invitations`, {
    data: { email: member.email, role },
  })
  expect(invitation.ok()).toBe(true)
  const { claimToken } = (await invitation.json()) as { claimToken: string }
  expect(
    (
      await member.page.request.post(
        `/api/invitations/claim/${encodeURIComponent(claimToken)}/accept`,
      )
    ).ok(),
  ).toBe(true)
}

async function world(owner: Page) {
  const universeId = await post(owner, '/api/universes', {
    name: unique('Suggestion World '),
    description: null,
    accentColor: null,
  })
  const types = (await (
    await owner.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const characterId = types.find((type) => type.name === 'Character')!.id
  const entryId = await post(owner, `/api/universes/${universeId}/entities`, {
    entityTypeId: characterId,
    name: 'Ember Vale',
    summary: 'The drowned heir.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  const storyId = await post(owner, `/api/universes/${universeId}/stories`, {
    title: 'The Drowned Heir',
    premise: null,
    status: 0,
  })
  const sceneId = await post(owner, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
    title: 'The Causeway',
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: null,
    chapterId: null,
  })
  return { universeId, characterId, entryId, storyId, sceneId }
}

const drawer = (page: Page) => page.getByTestId('comments-drawer')
const suggestions = (page: Page) => drawer(page).getByTestId('suggestion')

/** Every read of a subject's suggestions the page completes, so a test can say none happens before the tab is chosen. */
function watchSuggestionReads(page: Page) {
  const reads: string[] = []
  page.on('requestfinished', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/suggestions')) {
      reads.push(request.url())
    }
  })
  return reads
}

async function openSuggestions(page: Page, scope?: Locator) {
  await (scope ?? page).getByTestId('comments-trigger').click()
  await expect(drawer(page)).toBeVisible()
  await drawer(page).getByRole('tab', { name: 'Suggestions' }).click()
}

/** One changed field of a suggestion: its label, then the value before and the value suggested. */
async function expectChange(item: Locator, label: string, before: string, after: string) {
  const row = item.getByTestId('suggestion-change').filter({ hasText: label })
  await expect(row.getByTestId('suggestion-latest-value')).toHaveText(before)
  await expect(row.getByTestId('suggestion-mine-value')).toHaveText(after)
}

/** Waits for the suggestion the page sends to be stored. */
async function sent(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().endsWith('/suggestions'),
    ),
    action(),
  ])
  expect(response.status()).toBe(201)
}

test.describe('suggested changes', () => {
  test('a Reviewer suggests through the entry form and the owner accepts it as their own edit', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'sgowner')
    const reviewer = await person(browser, 'sgreviewer')
    const { universeId, entryId } = await world(owner.page)
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    const entryPage = `/app/universes/${universeId}/lore/${entryId}`

    // The Reviewer has no Edit, and Suggest changes where it would stand: the same form, saying what it is for.
    await reviewer.page.goto(entryPage)
    await expect(reviewer.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(reviewer.page.getByTestId('edit-entity')).toHaveCount(0)
    await reviewer.page.getByTestId('suggest-entity').click()
    await expect(reviewer.page.getByTestId('entry-suggesting')).toContainText(
      'The entry stays as it is until the owner or an Editor accepts them.',
    )
    const send = reviewer.page.getByTestId('save-entity')
    await expect(send).toHaveText('Send suggestion')
    await expect(send).toBeDisabled()
    await reviewer.page.getByLabel('Name', { exact: true }).fill('Ember of the Vale')
    await reviewer.page.getByLabel('Summary').fill('The heir who came back.')
    await expect(reviewer.page.getByTestId('entry-form-status')).toHaveText('Not sent yet')
    await sent(reviewer.page, () => send.click())

    // Sent, and nothing about the entry changed.
    await expect(reviewer.page.getByTestId('suggestion-sent')).toHaveText(
      'Suggestion sent. It’s waiting under Review.',
    )
    await expect(reviewer.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(reviewer.page.getByTestId('entry-summary')).toHaveText('The drowned heir.')

    // The owner's page reads no suggestions until the Suggestions tab is chosen.
    const reads = watchSuggestionReads(owner.page)
    await owner.page.goto(entryPage)
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(owner.page.getByTestId('comments-trigger')).toHaveAccessibleName('Review')
    await owner.page.getByTestId('comments-trigger').click()
    await expect(drawer(owner.page).getByTestId('comments-empty')).toBeVisible()
    expect(reads).toHaveLength(0)
    await drawer(owner.page).getByRole('tab', { name: 'Suggestions' }).click()
    // Then one page of open suggestions and one of decided ones, both for this entry.
    await expect.poll(() => reads.length).toBe(2)
    expect(reads.every((read) => read.includes(`/entities/${entryId}/suggestions?state=`))).toBe(
      true,
    )

    const item = suggestions(owner.page)
    await expect(item).toHaveCount(1)
    await expect(item.getByTestId('suggestion-author')).toHaveText(reviewer.username)
    await expectChange(item, 'Name', 'Ember Vale', 'Ember of the Vale')
    await expectChange(item, 'Summary', 'The drowned heir.', 'The heir who came back.')
    await expect(item.getByTestId('suggestion-change')).toHaveCount(2)

    // Accepted: said where the focus lands, kept to read under Accepted and rejected, and the entry is the suggestion.
    await item.getByTestId('suggestion-accept').click()
    const feedback = drawer(owner.page).getByTestId('suggestions-feedback')
    await expect(feedback).toHaveText('Suggestion accepted.')
    await expect(feedback).toBeFocused()
    await drawer(owner.page).getByTestId('suggestions-decided-group').locator('summary').click()
    await expect(item).toHaveAttribute('data-status', 'accepted')
    await expect(item.getByTestId('suggestion-resolution')).toContainText(
      `Accepted by ${owner.username}`,
    )
    await owner.page.keyboard.press('Escape')
    await expect(drawer(owner.page)).toHaveCount(0)
    await expect(owner.page.getByTestId('comments-trigger')).toBeFocused()
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember of the Vale')
    await expect(owner.page.getByTestId('entry-summary')).toHaveText('The heir who came back.')

    // History holds the accepted edit as the owner's own, never the Reviewer's.
    await owner.page.goto(`${entryPage}/history`)
    await expect(
      owner.page
        .locator('[data-testid="history-list"] [data-version="2"]')
        .getByTestId('version-actor'),
    ).toHaveText(`by ${owner.username}`)

    // The Reviewer reads it as accepted, with no way to decide anything.
    await reviewer.page.goto(entryPage)
    await expect(reviewer.page.getByTestId('entry-name')).toHaveText('Ember of the Vale')
    await openSuggestions(reviewer.page)
    await drawer(reviewer.page).getByTestId('suggestions-decided-group').locator('summary').click()
    await expect(suggestions(reviewer.page)).toHaveAttribute('data-status', 'accepted')
    await expect(drawer(reviewer.page).getByTestId('suggestion-accept')).toHaveCount(0)
    await expect(drawer(reviewer.page).getByTestId('suggestion-reject')).toHaveCount(0)

    // On a phone the Reviewer's Suggest changes is its icon alone, named, and the drawer never scrolls sideways.
    await reviewer.page.keyboard.press('Escape')
    await reviewer.page.setViewportSize({ width: 390, height: 800 })
    await reviewer.page.goto(entryPage)
    const suggest = reviewer.page.getByTestId('suggest-entity')
    await expect(suggest).toHaveAccessibleName('Suggest changes')
    expect((await suggest.boundingBox())!.width).toBeLessThan(56)
    await openSuggestions(reviewer.page)
    expect(
      await reviewer.page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0)

    for (const someone of [owner, reviewer]) await someone.context.close()
  })

  test('a suggestion made before an Editor saved can be read and rejected but not accepted', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'sgstaleowner')
    const editor = await person(browser, 'sgstaleeditor')
    const reviewer = await person(browser, 'sgstalereviewer')
    const { universeId, characterId, entryId } = await world(owner.page)
    await share(owner.page, universeId, editor, Role.Editor)
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    const entity = `/api/universes/${universeId}/entities/${entryId}`
    const body = (name: string, summary: string, expectedVersion: number) => ({
      entityTypeId: characterId,
      name,
      summary,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
      expectedVersion,
    })

    // Suggested over version 1; the Editor then saves over version 1 too.
    const suggestion = await post(
      reviewer.page,
      `${entity}/suggestions`,
      body('Ember the Reviewer', 'The drowned heir.', 1),
    )
    const saved = await editor.page.request.put(entity, {
      data: body('Ember Vale', 'Rewritten by the Editor.', 1),
    })
    expect(saved.ok()).toBe(true)

    await owner.page.goto(`/app/universes/${universeId}/lore/${entryId}`)
    await expect(owner.page.getByTestId('entry-summary')).toHaveText('Rewritten by the Editor.')
    await openSuggestions(owner.page)
    const item = suggestions(owner.page)
    await expect(item.getByTestId('suggestion-changed')).toHaveText(
      'The entry has changed since this suggestion was made. It can’t be accepted now. Reject it, or make the change yourself.',
    )
    await expectChange(item, 'Name', 'Ember Vale', 'Ember the Reviewer')
    await expect(item.getByTestId('suggestion-accept')).toHaveCount(0)

    // Not through the API either: the Editor's work stands.
    const refused = await owner.page.request.post(
      `/api/universes/${universeId}/suggestions/${suggestion}/accept`,
    )
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { code: string }).code).toBe('suggestion_target_changed')

    await item.getByTestId('suggestion-reject').click()
    await expect(drawer(owner.page).getByTestId('suggestions-feedback')).toHaveText(
      'Suggestion rejected.',
    )
    await drawer(owner.page).getByTestId('suggestions-decided-group').locator('summary').click()
    await expect(item).toHaveAttribute('data-status', 'rejected')
    await expect(item.getByTestId('suggestion-resolution')).toContainText(
      `Rejected by ${owner.username}`,
    )
    await expect(item.getByTestId('suggestion-changed')).toHaveCount(0)
    await owner.page.keyboard.press('Escape')
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(owner.page.getByTestId('entry-summary')).toHaveText('Rewritten by the Editor.')

    for (const someone of [owner, editor, reviewer]) await someone.context.close()
  })

  test('a story and a scene are suggested from their drawers; one is rejected and one accepted', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'sgstoryowner')
    const reviewer = await person(browser, 'sgstoryreviewer')
    const { universeId, storyId, sceneId } = await world(owner.page)
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    const storyPage = `/app/universes/${universeId}/stories/${storyId}`

    // The story, from its ⋯ menu.
    await reviewer.page.goto(storyPage)
    await expect(reviewer.page.getByTestId('story-title')).toHaveText('The Drowned Heir')
    await reviewer.page.getByTestId('story-actions').click()
    await reviewer.page.getByTestId('suggest-story').click()
    const storyForm = reviewer.page.getByTestId('story-form')
    await expect(storyForm).toContainText('Suggesting changes to a story')
    await storyForm.getByTestId('story-title-input').fill('The Heir Returns')
    await sent(reviewer.page, () => storyForm.getByTestId('save-story').click())
    await expect(storyForm).toHaveCount(0)
    await expect(reviewer.page.getByTestId('suggestion-sent')).toBeVisible()
    await expect(reviewer.page.getByTestId('story-title')).toHaveText('The Drowned Heir')

    // The scene, from its ⋯ menu beside its prose.
    await reviewer.page.goto(`${storyPage}/manuscript/${sceneId}`)
    await reviewer.page.getByTestId('manuscript-scene-actions').click()
    await reviewer.page.getByTestId('manuscript-suggest-scene').click()
    const sceneForm = reviewer.page.getByTestId('scene-form')
    await expect(sceneForm).toContainText('Suggesting changes to a scene')
    await sceneForm.getByTestId('scene-title-input').fill('The Causeway at Night')
    await sceneForm.getByTestId('scene-summary-input').fill('She crosses before the tide.')
    await sent(reviewer.page, () => sceneForm.getByTestId('save-scene').click())
    await expect(sceneForm).toHaveCount(0)
    await expect(reviewer.page.getByTestId('manuscript-scene-title')).toHaveText('The Causeway')

    // The owner turns down the story's suggestion...
    await owner.page.goto(storyPage)
    await openSuggestions(owner.page)
    await expectChange(suggestions(owner.page), 'Title', 'The Drowned Heir', 'The Heir Returns')
    await suggestions(owner.page).getByTestId('suggestion-reject').click()
    await expect(drawer(owner.page).getByTestId('suggestions-feedback')).toHaveText(
      'Suggestion rejected.',
    )
    await expect(owner.page.getByTestId('story-title')).toHaveText('The Drowned Heir')

    // The owner may suggest too, from the same tab: the story's own form, sending rather than saving.
    await drawer(owner.page).getByTestId('suggestions-new').click()
    await expect(drawer(owner.page)).toHaveCount(0)
    await expect(owner.page.getByTestId('story-form')).toContainText(
      'Suggesting changes to a story',
    )
    await expect(owner.page.getByTestId('save-story')).toHaveText('Send suggestion')
    await owner.page.getByTestId('cancel-story').click()
    await expect(owner.page.getByTestId('story-form')).toHaveCount(0)

    // ...and takes the scene's.
    await owner.page.goto(`${storyPage}/manuscript/${sceneId}`)
    await openSuggestions(owner.page, owner.page.getByTestId('manuscript-scene'))
    const scene = suggestions(owner.page)
    await expectChange(scene, 'Title', 'The Causeway', 'The Causeway at Night')
    await expectChange(scene, 'Summary', '—', 'She crosses before the tide.')
    await scene.getByTestId('suggestion-accept').click()
    await expect(drawer(owner.page).getByTestId('suggestions-feedback')).toHaveText(
      'Suggestion accepted.',
    )
    await owner.page.keyboard.press('Escape')
    await expect(owner.page.getByTestId('manuscript-scene-title')).toHaveText(
      'The Causeway at Night',
    )

    for (const someone of [owner, reviewer]) await someone.context.close()
  })

  test('every decided suggestion stays reachable past the first page', async ({ browser }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'sgpageowner')
    const reviewer = await person(browser, 'sgpagereviewer')
    const { universeId, characterId, entryId } = await world(owner.page)
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    const entity = `/api/universes/${universeId}/entities/${entryId}`

    // Twenty-one suggestions, oldest first, each turned down: one more than a page holds.
    for (let index = 1; index <= 21; index++) {
      const id = await post(reviewer.page, `${entity}/suggestions`, {
        entityTypeId: characterId,
        name: `Ember ${index}`,
        summary: 'The drowned heir.',
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
        expectedVersion: 1,
      })
      expect(
        (
          await owner.page.request.post(`/api/universes/${universeId}/suggestions/${id}/reject`)
        ).ok(),
      ).toBe(true)
    }

    await owner.page.goto(`/app/universes/${universeId}/lore/${entryId}`)
    await openSuggestions(owner.page)
    const group = drawer(owner.page).getByTestId('suggestions-decided-group')
    await expect(group.locator('summary')).toContainText('Accepted and rejected 20+')
    await group.locator('summary').click()
    await expect(suggestions(owner.page)).toHaveCount(20)
    await expect(suggestions(owner.page).first().getByTestId('suggestion-mine-value')).toHaveText(
      'Ember 21',
    )

    // The oldest is one press away, and then the list is whole.
    await drawer(owner.page).getByTestId('suggestions-more-decided').click()
    await expect(suggestions(owner.page)).toHaveCount(21)
    await expect(suggestions(owner.page).last().getByTestId('suggestion-mine-value')).toHaveText(
      'Ember 1',
    )
    await expect(suggestions(owner.page).last()).toHaveAttribute('data-status', 'rejected')
    await expect(drawer(owner.page).getByTestId('suggestions-more-decided')).toHaveCount(0)
    await expect(group.locator('summary')).toContainText('Accepted and rejected 21')

    for (const someone of [owner, reviewer]) await someone.context.close()
  })
})
