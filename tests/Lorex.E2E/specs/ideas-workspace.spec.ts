import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Refinement 037: Ideas as a fast scratch space, seen from three places - all of the account's ideas, one universe's, and
 * one story's - over the one account-owned idea (ADR 0030 amendment).
 *
 * A one-line capture keeps a thought without leaving the list, placed by where it was typed. A story's Ideas view lists
 * the ideas with an explicit reference to the story or to a scene, arc or beat in it, once each, and only for the owner.
 * An idea from any of the three opens in the one editor, and Back returns to the list as it was left.
 *
 * Each test registers its own account with a throwaway password.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('scratch')
  const email = `${username}@example.test`
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { username, email }
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true)
  return ((await response.json()) as { id: string }).id
}

const Kind = { Story: 1, Scene: 2, PlotArc: 3, PlotBeat: 4 } as const

/** A universe with a story holding a scene, an arc and a beat. */
async function seedWorld(page: Page, storyTitle = 'The Long Winter') {
  const universeId = await post(page, '/api/universes', {
    name: unique('Hollowmere '),
    description: null,
    accentColor: '#4f6bd6',
  })
  const story = await seedStory(page, universeId, storyTitle)
  return { universeId, ...story }
}

async function seedStory(page: Page, universeId: string, title: string) {
  const stories = `/api/universes/${universeId}/stories`
  const storyId = await post(page, stories, { title, premise: null, status: 1 })
  const sceneId = await post(page, `${stories}/${storyId}/scenes`, {
    title: `${title}: the coronation`,
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
    chapterId: null,
  })
  const arcId = await post(page, `${stories}/${storyId}/plot-arcs`, {
    title: `${title}: the fall`,
    description: null,
    notes: null,
  })
  const beatId = await post(page, `${stories}/${storyId}/plot-arcs/${arcId}/beats`, {
    title: `${title}: the will is read`,
    description: null,
    notes: null,
    sceneIds: [],
    entityIds: [],
  })
  return { storyId, sceneId, arcId, beatId }
}

async function seedIdea(
  page: Page,
  title: string,
  universeId: string | null,
  references: { kind: number; id: string }[] = [],
) {
  return post(page, '/api/ideas', {
    title,
    body: '',
    universeId,
    references,
    expectedUpdatedAt: null,
  })
}

function rows(page: Page) {
  return page.getByTestId('idea-row')
}

function row(page: Page, title: string) {
  return page.locator(`[data-testid="idea-row"][data-title="${title}"]`)
}

async function capture(page: Page, text: string) {
  const input = page.getByTestId('idea-capture-input')
  await input.fill(text)
  await input.press('Enter')
  await expect(page.getByTestId('idea-capture-status')).toHaveText(`Captured “${text.trim()}”.`)
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

async function person(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const account = await signUp(page)
  return { context, page, ...account }
}

test.describe('ideas workspace', () => {
  test('all ideas: a line captured stays in the list, opens in the full editor, and Back returns', async ({
    page,
  }) => {
    await signUp(page)
    await page.goto('/app/ideas')
    await expect(page.getByTestId('ideas-empty')).toBeVisible()

    const input = page.getByTestId('idea-capture-input')
    await expect(input).toHaveAttribute('name', 'title')
    await expect(page.getByLabel('Capture an idea')).toHaveAttribute(
      'data-testid',
      'idea-capture-input',
    )

    // Nothing but spaces is refused here, and what was typed stays.
    await input.fill('   ')
    await input.press('Enter')
    await expect(page.getByTestId('idea-capture-error')).toHaveText('Write a few words first.')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveValue('   ')

    await capture(page, 'Maybe this city floats')
    await expect(page).toHaveURL('/app/ideas')
    await expect(page.getByTestId('idea-capture-error')).toHaveCount(0)
    await expect(row(page, 'Maybe this city floats')).toBeVisible()
    await expect(row(page, 'Maybe this city floats').getByTestId('idea-universe-label')).toHaveText(
      'No universe',
    )

    const listed = (await (await page.request.get('/api/ideas')).json()) as {
      items: {
        id: string
        title: string
        excerpt: string
        universe: unknown
        referenceCount: number
      }[]
    }
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]).toMatchObject({ excerpt: '', universe: null, referenceCount: 0 })

    // The full editor is where it grows.
    await row(page, 'Maybe this city floats').getByTestId('idea-open').click()
    await page.waitForURL(`/app/ideas/${listed.items[0].id}`)
    await page.getByTestId('idea-body').fill('Nobody below has seen its underside.')
    await page.getByTestId('idea-save').click()
    await expect
      .poll(async () => {
        const saved = await page.request.get(`/api/ideas/${listed.items[0].id}`)
        return ((await saved.json()) as { body: string }).body
      })
      .toBe('Nobody below has seen its underside.')
    // The page has to know it too: Back while its own save is still in flight is asked about, and the question is
    // dismissed, so the editor would stay where it is.
    await expect(page.getByTestId('idea-status')).toHaveText('Saved')

    await page.goBack()
    await page.waitForURL('/app/ideas')
    await expect(row(page, 'Maybe this city floats').getByTestId('idea-excerpt')).toHaveText(
      'Nobody below has seen its underside.',
    )
  })

  test('a capture that fails keeps its words, and a second Enter while saving keeps one idea', async ({
    page,
  }) => {
    await signUp(page)
    await page.goto('/app/ideas')
    const input = page.getByTestId('idea-capture-input')

    await page.route('**/api/ideas', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, body: '' })
        : route.continue(),
    )
    await input.fill('Lost to a server error')
    await input.press('Enter')
    await expect(page.getByTestId('idea-capture-error')).toContainText('Your words are still here.')
    await expect(input).toHaveValue('Lost to a server error')
    await expect(page).toHaveURL('/app/ideas')
    await page.unrouteAll()

    // Slow the answer down, and press Enter again while it is on its way.
    let posts = 0
    await page.route('**/api/ideas', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      posts++
      await new Promise((resolve) => setTimeout(resolve, 600))
      return route.continue()
    })
    await input.fill('Only once')
    await input.press('Enter')
    await expect(page.getByTestId('idea-capture-submit')).toBeDisabled()
    await input.press('Enter')
    await expect(page.getByTestId('idea-capture-status')).toHaveText('Captured “Only once”.')
    expect(posts).toBe(1)
    await expect(row(page, 'Only once')).toHaveCount(1)
  })

  test('a universe’s capture belongs to the universe and is among all ideas too', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId } = await seedWorld(page)

    await page.goto(`/app/universes/${universeId}/ideas`)
    await capture(page, 'The river remembers')
    await expect(row(page, 'The river remembers')).toBeVisible()

    await page.getByTestId('ideas-all').click()
    await page.waitForURL('/app/ideas')
    const everywhere = row(page, 'The river remembers')
    await expect(everywhere).toBeVisible()
    await expect(everywhere.getByTestId('idea-universe-label')).not.toHaveText('No universe')
    expect(await everywhere.getAttribute('data-universe')).toMatch(/^Hollowmere /)
  })

  test('a story’s Ideas: captured with the story as reference, opened in the editor, and Back returns', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId, storyId } = await seedWorld(page)
    const storyPath = `/app/universes/${universeId}/stories/${storyId}`

    await page.goto(storyPath)
    const views = page.getByRole('navigation', { name: 'Story views' })
    await expect(views.getByRole('link')).toHaveText(['Scenes', 'Plot', 'Manuscript', 'Ideas'])
    await views.getByRole('link', { name: 'Ideas' }).click()
    await page.waitForURL(`${storyPath}/ideas`)
    await expect(views.getByRole('link', { name: 'Ideas' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
    await expect(page.getByTestId('ideas-empty')).toContainText('No ideas for this story yet.')
    await expect(page.getByRole('heading', { name: 'Ideas', level: 2 })).toBeAttached()

    await capture(page, 'What if the council already knows?')
    const captured = row(page, 'What if the council already knows?')
    await expect(captured).toBeVisible()
    await expect(captured).toContainText('1 reference')

    await captured.getByTestId('idea-open').click()
    await page.waitForURL(new RegExp(`/app/universes/${universeId}/ideas/[0-9a-f-]+$`))
    await expect(page.getByTestId('idea-title')).toHaveValue('What if the council already knows?')
    await expect(page.getByTestId('idea-body')).toHaveValue('')
    await expect(page.getByTestId('idea-universe')).toHaveValue(universeId)
    const reference = page.getByTestId('idea-reference')
    await expect(reference).toHaveCount(1)
    await expect(reference).toContainText('The Long Winter')
    await expect(reference).toContainText('Story')

    await page.goBack()
    await page.waitForURL(`${storyPath}/ideas`)
    await expect(row(page, 'What if the council already knows?')).toBeVisible()
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
  })

  test('a story lists ideas naming it or its parts, once each, and no other story’s', async ({
    page,
  }) => {
    await signUp(page)
    const a = await seedWorld(page, 'Story A')
    const b = await seedStory(page, a.universeId, 'Story B')

    await seedIdea(page, 'Via the scene', a.universeId, [{ kind: Kind.Scene, id: a.sceneId }])
    await seedIdea(page, 'Via the beat', a.universeId, [{ kind: Kind.PlotBeat, id: a.beatId }])
    await seedIdea(page, 'Via the arc', a.universeId, [{ kind: Kind.PlotArc, id: a.arcId }])
    await seedIdea(page, 'Story and scene', a.universeId, [
      { kind: Kind.Story, id: a.storyId },
      { kind: Kind.Scene, id: a.sceneId },
    ])
    await seedIdea(page, 'Only Story B', a.universeId, [{ kind: Kind.Story, id: b.storyId }])
    await seedIdea(page, 'Only the universe', a.universeId)
    await seedIdea(page, 'Story A', null)

    await page.goto(`/app/universes/${a.universeId}/stories/${a.storyId}/ideas`)
    await expect(rows(page)).toHaveCount(4)
    for (const title of ['Via the scene', 'Via the beat', 'Via the arc', 'Story and scene']) {
      await expect(row(page, title)).toHaveCount(1)
    }
    await expect(row(page, 'Story and scene')).toContainText('2 references')

    await page.goto(`/app/universes/${a.universeId}/stories/${b.storyId}/ideas`)
    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Only Story B')).toBeVisible()
  })

  test('a story’s Ideas keep their search and page in the address, through reload, Back and Forward', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId, storyId } = await seedWorld(page)
    for (let i = 1; i <= 22; i++) {
      await seedIdea(page, `Tide ${String(i).padStart(2, '0')}`, universeId, [
        { kind: Kind.Story, id: storyId },
      ])
    }
    await seedIdea(page, 'Ember thought', universeId, [{ kind: Kind.Story, id: storyId }])
    const ideasPath = `/app/universes/${universeId}/stories/${storyId}/ideas`

    await page.goto(ideasPath)
    await expect(rows(page)).toHaveCount(20)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(`${ideasPath}?page=2`)
    await expect(rows(page)).toHaveCount(3)

    await page.getByTestId('ideas-search').fill('ember')
    await expect(page).toHaveURL(`${ideasPath}?q=ember`)
    await expect(rows(page)).toHaveCount(1)

    await page.reload()
    await expect(page.getByTestId('ideas-search')).toHaveValue('ember')
    await expect(rows(page)).toHaveCount(1)

    await row(page, 'Ember thought').getByTestId('idea-open').click()
    await page.waitForURL(new RegExp(`/app/universes/${universeId}/ideas/[0-9a-f-]+$`))
    await page.goBack()
    await expect(page).toHaveURL(`${ideasPath}?q=ember`)
    await expect(rows(page)).toHaveCount(1)
    await expect(page.getByTestId('ideas-search')).toHaveValue('ember')

    await page.goForward()
    await page.waitForURL(new RegExp(`/app/universes/${universeId}/ideas/[0-9a-f-]+$`))
    await page.goBack()
    await expect(page).toHaveURL(`${ideasPath}?q=ember`)
  })

  test('a story’s deleted idea waits in its Recently deleted and comes back to the story', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId, storyId, sceneId } = await seedWorld(page)
    const id = await seedIdea(page, 'At the coronation', universeId, [
      { kind: Kind.Scene, id: sceneId },
    ])
    expect((await page.request.delete(`/api/ideas/${id}`)).status()).toBe(204)

    const ideasPath = `/app/universes/${universeId}/stories/${storyId}/ideas`
    await page.goto(ideasPath)
    await expect(page.getByTestId('ideas-empty')).toContainText('No ideas for this story yet.')

    await page.getByTestId('ideas-view-deleted').click()
    await expect(page).toHaveURL(`${ideasPath}?view=deleted`)
    await expect(page.getByTestId('idea-capture')).toHaveCount(0)
    await row(page, 'At the coronation').getByTestId('idea-restore').click()
    await expect(page.getByTestId('ideas-message')).toContainText('is back in your ideas')
    await expect(rows(page)).toHaveCount(0)

    await page.getByTestId('ideas-view-live').click()
    await expect(row(page, 'At the coronation')).toBeVisible()
  })

  test('a collaborator sees no Ideas view in the owner’s story, and no owner’s idea', async ({
    browser,
  }) => {
    const owner = await person(browser)
    const editor = await person(browser)
    const { universeId, storyId } = await seedWorld(owner.page)
    await seedIdea(owner.page, 'Owner’s private thought', universeId, [
      { kind: Kind.Story, id: storyId },
    ])

    const inviteResponse = await owner.page.request.post(
      `/api/universes/${universeId}/invitations`,
      {
        data: { email: editor.email, role: 3 },
      },
    )
    expect(inviteResponse.ok()).toBe(true)
    const { claimToken } = (await inviteResponse.json()) as { claimToken: string }
    expect(
      (
        await editor.page.request.post(
          `/api/invitations/claim/${encodeURIComponent(claimToken)}/accept`,
        )
      ).ok(),
    ).toBe(true)

    const storyPath = `/app/universes/${universeId}/stories/${storyId}`
    await editor.page.goto(storyPath)
    const views = editor.page.getByRole('navigation', { name: 'Story views' })
    await expect(views.getByRole('link')).toHaveText(['Scenes', 'Plot', 'Manuscript'])

    // By address, the view says it is not theirs, and asks for nothing.
    let asked = false
    editor.page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/ideas') asked = true
    })
    await editor.page.goto(`${storyPath}/ideas`)
    await expect(editor.page.getByTestId('role-unavailable')).toBeVisible()
    await expect(editor.page.getByText('Owner’s private thought')).toHaveCount(0)
    expect(asked).toBe(false)

    const listed = await editor.page.request.get(
      `/api/ideas?universeId=${universeId}&storyId=${storyId}`,
    )
    expect(listed.status()).toBe(404)

    await owner.context.close()
    await editor.context.close()
  })

  for (const width of [390, 360]) {
    test(`a story’s four views and its capture fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const { universeId, storyId } = await seedWorld(
        page,
        'A story with a long enough title to wrap',
      )
      await page.goto(`/app/universes/${universeId}/stories/${storyId}/ideas`)

      const views = page.getByTestId('story-views')
      await expect(views.getByRole('link')).toHaveCount(4)
      expect((await views.boundingBox())!.height, 'the four views wrapped').toBeLessThan(60)
      const last = (await views.getByRole('link', { name: 'Ideas' }).boundingBox())!
      expect(last.x + last.width).toBeLessThanOrEqual(width)

      await capture(page, 'A thought typed on a phone, long enough to fill the line')
      await expect(
        row(page, 'A thought typed on a phone, long enough to fill the line'),
      ).toBeVisible()
      await expectNoSidewaysScroll(page, 'story ideas')

      await page.getByTestId('ideas-view-deleted').click()
      await expectNoSidewaysScroll(page, 'story recently deleted')
      await page.goto('/app/ideas')
      await expectNoSidewaysScroll(page, 'all ideas')
    })
  }
})
