import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'

/**
 * Task 043: review comments, as four people in their own browsers. The API's rules are proved by its own tests; this
 * proves what each person sees: a thread started, answered by a Reviewer who still cannot edit, resolved, read as
 * resolved and reopened, a Viewer who reads and cannot take part, and the same drawer on a story and a scene.
 */

const Role = { Viewer: 1, Reviewer: 2, Editor: 3 } as const

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
    name: unique('Review World '),
    description: null,
    accentColor: null,
  })
  const types = (await (
    await owner.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const entryId = await post(owner, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
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
  return { universeId, entryId, storyId, sceneId }
}

const drawer = (page: Page) => page.getByTestId('comments-drawer')
const threads = (page: Page) => drawer(page).getByTestId('comment-thread')

async function openComments(page: Page) {
  await page.getByTestId('comments-trigger').click()
  await expect(drawer(page)).toBeVisible()
}

/**
 * Every read of a subject's comments the page completes, so a test can say none happens before the drawer opens. Only
 * finished ones: the development build mounts each effect twice and cancels the first read.
 */
function watchCommentReads(page: Page) {
  const reads: string[] = []
  page.on('requestfinished', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/comments')) {
      reads.push(request.url())
    }
  })
  return reads
}

async function closeComments(page: Page) {
  await drawer(page).getByTestId('comments-close').click()
  await expect(drawer(page)).toHaveCount(0)
}

test.describe('review comments', () => {
  test('a thread is started, answered by a Reviewer, resolved, reopened, and read by a Viewer', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'reviewowner')
    const editor = await person(browser, 'revieweditor')
    const reviewer = await person(browser, 'reviewreviewer')
    const viewer = await person(browser, 'reviewviewer')
    const { universeId, entryId } = await world(owner.page)
    await share(owner.page, universeId, editor, Role.Editor)
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    await share(owner.page, universeId, viewer, Role.Viewer)
    const entryPage = `/app/universes/${universeId}/lore/${entryId}`

    // The owner opens the review layer on an entry and starts a thread. The page reads no comments until it is opened.
    const ownerReads = watchCommentReads(owner.page)
    await owner.page.goto(entryPage)
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(owner.page.getByTestId('comments-trigger')).toHaveAccessibleName('Review')
    expect(ownerReads).toHaveLength(0)
    await openComments(owner.page)
    await expect.poll(() => ownerReads.length).toBe(1)
    await expect(drawer(owner.page).getByRole('heading', { name: 'Ember Vale' })).toBeVisible()
    await expect(drawer(owner.page).getByTestId('comments-empty')).toHaveText('No comments yet.')
    await drawer(owner.page)
      .getByLabel('New comment')
      .fill('Is the tide year right?\nIt reads one off.')
    await drawer(owner.page).getByTestId('comment-new-post').click()
    await expect(threads(owner.page)).toHaveCount(1)
    await expect(threads(owner.page).getByTestId('comment-author')).toHaveText(owner.username)
    await expect(threads(owner.page).getByTestId('comment-body')).toHaveText(
      'Is the tide year right?\nIt reads one off.',
    )
    await closeComments(owner.page)
    expect(ownerReads).toHaveLength(1)

    // The Reviewer still cannot edit the entry, and answers the thread.
    await reviewer.page.goto(entryPage)
    await expect(reviewer.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(reviewer.page.getByTestId('edit-entity')).toHaveCount(0)
    await expect(reviewer.page.getByTestId('entity-actions')).toHaveCount(0)
    await openComments(reviewer.page)
    await expect(threads(reviewer.page).getByTestId('comment-resolve')).toHaveCount(0)
    await threads(reviewer.page).getByTestId('comment-reply').click()
    await threads(reviewer.page).getByLabel('Reply').fill('Yes, chapter two says so.')
    await threads(reviewer.page).getByTestId('comment-reply-post').click()
    await expect(threads(reviewer.page).getByTestId('comment')).toHaveCount(2)
    await expect(threads(reviewer.page).getByTestId('comment-author').nth(1)).toHaveText(
      reviewer.username,
    )

    // The Editor resolves it: it leaves the open threads and is kept under Resolved.
    await editor.page.goto(entryPage)
    await openComments(editor.page)
    await threads(editor.page).getByTestId('comment-resolve').click()
    await expect(drawer(editor.page).getByTestId('comments-open')).toHaveCount(0)
    await drawer(editor.page).getByTestId('comments-resolved-group').locator('summary').click()
    await expect(threads(editor.page).getByTestId('comment-resolved')).toContainText(
      `Resolved by ${editor.username}`,
    )
    await closeComments(editor.page)

    // The owner reads it as resolved, every word kept, and reopens it.
    await owner.page.reload()
    await openComments(owner.page)
    const resolved = drawer(owner.page).getByTestId('comments-resolved-group')
    await resolved.locator('summary').click()
    await expect(resolved.getByTestId('comment')).toHaveCount(2)
    await resolved.getByTestId('comment-reopen').click()
    await expect(
      drawer(owner.page).getByTestId('comments-open').getByTestId('comment'),
    ).toHaveCount(2)
    await expect(drawer(owner.page).getByTestId('comments-resolved-group')).toHaveCount(0)

    // The Viewer reads the thread and is offered nothing to write or change.
    await viewer.page.goto(entryPage)
    await openComments(viewer.page)
    await expect(threads(viewer.page).getByTestId('comment-body')).toHaveText([
      'Is the tide year right?\nIt reads one off.',
      'Yes, chapter two says so.',
    ])
    await expect(drawer(viewer.page).getByTestId('comments-read-only')).toBeVisible()
    await expect(drawer(viewer.page).getByLabel('New comment')).toHaveCount(0)
    await expect(drawer(viewer.page).getByTestId('comment-reply')).toHaveCount(0)
    await expect(drawer(viewer.page).getByTestId('comment-resolve')).toHaveCount(0)

    // Escape closes the drawer and hands the focus back to the button that opened it.
    await viewer.page.keyboard.press('Escape')
    await expect(drawer(viewer.page)).toHaveCount(0)
    await expect(viewer.page.getByTestId('comments-trigger')).toBeFocused()

    // Nothing private of anyone is on the page.
    for (const someone of [owner, editor, reviewer]) {
      await expect(viewer.page.getByText(someone.email)).toHaveCount(0)
    }

    for (const someone of [owner, editor, reviewer, viewer]) await someone.context.close()
  })

  test('the same review layer on a story and on a scene, from the keyboard and on a phone', async ({
    browser,
  }) => {
    const owner = await person(browser, 'reviewstoryowner')
    const reviewer = await person(browser, 'reviewstoryreviewer')
    const { universeId, entryId, storyId, sceneId } = await world(owner.page)
    await post(owner.page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
      title: 'The Lantern',
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: null,
    })
    await share(owner.page, universeId, reviewer, Role.Reviewer)
    const storyPage = `/app/universes/${universeId}/stories/${storyId}`

    // The story, as a whole, from the line of facts under its title.
    await reviewer.page.goto(storyPage)
    await expect(reviewer.page.getByTestId('edit-story')).toHaveCount(0)
    await reviewer.page.getByTestId('comments-trigger').focus()
    await reviewer.page.keyboard.press('Enter')
    await expect(drawer(reviewer.page)).toBeVisible()
    await expect(drawer(reviewer.page)).toContainText('On this story')
    await drawer(reviewer.page).getByLabel('New comment').fill('The pacing drags in the middle.')
    await drawer(reviewer.page).getByTestId('comment-new-post').click()
    await expect(threads(reviewer.page)).toHaveCount(1)
    await closeComments(reviewer.page)

    // One scene, beside its prose.
    await reviewer.page.goto(`${storyPage}/manuscript/${sceneId}`)
    const sceneTools = reviewer.page.getByTestId('manuscript-scene')
    await sceneTools.getByTestId('comments-trigger').click()
    await expect(drawer(reviewer.page)).toContainText('On this scene')
    await expect(drawer(reviewer.page).getByRole('heading', { name: 'The Causeway' })).toBeVisible()
    await drawer(reviewer.page).getByLabel('New comment').fill('Who holds the lantern here?')
    await drawer(reviewer.page).getByTestId('comment-new-post').click()
    await expect(threads(reviewer.page)).toHaveCount(1)
    await closeComments(reviewer.page)

    // The owner finds each where it was left, and the two never mix. A story of two scenes, its Scenes view and its
    // Manuscript view read no comments until one drawer is opened, and then only that subject's.
    const ownerReads = watchCommentReads(owner.page)
    await owner.page.goto(storyPage)
    await expect(owner.page.getByTestId('scene')).toHaveCount(2)
    await owner.page.goto(`${storyPage}/manuscript/${sceneId}`)
    await expect(owner.page.getByTestId('manuscript-scene-title')).toHaveText('The Causeway')
    expect(ownerReads).toHaveLength(0)
    await owner.page.getByTestId('manuscript-scene').getByTestId('comments-trigger').click()
    await expect(threads(owner.page).getByTestId('comment-body')).toHaveText(
      'Who holds the lantern here?',
    )
    expect(ownerReads).toEqual([expect.stringContaining(`/scenes/${sceneId}/comments`)])
    await closeComments(owner.page)

    // On a phone the entry's tools keep to one line: Review is its icon alone, named, on the views' line.
    await owner.page.setViewportSize({ width: 390, height: 800 })
    await owner.page.goto(`/app/universes/${universeId}/lore/${entryId}`)
    const entryTrigger = owner.page.getByTestId('comments-trigger')
    await expect(entryTrigger).toHaveAccessibleName('Review')
    expect((await entryTrigger.boundingBox())!.width).toBeLessThan(48)
    const edit = (await owner.page.getByTestId('edit-entity').boundingBox())!
    const more = (await owner.page.getByTestId('entity-actions').boundingBox())!
    expect(more.y, 'the entry menu wrapped under Edit').toBeLessThan(edit.y + edit.height)

    // The story's line of facts has room for the word; the drawer takes the screen without scrolling sideways.
    await owner.page.goto(storyPage)
    const trigger = owner.page.getByTestId('comments-trigger')
    await expect(trigger).toHaveAccessibleName('Review')
    await expect(trigger).toContainText('Review')
    await trigger.click()
    const box = await drawer(owner.page).boundingBox()
    expect(box?.width).toBeGreaterThan(380)
    expect(
      await owner.page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0)

    for (const someone of [owner, reviewer]) await someone.context.close()
  })
})
