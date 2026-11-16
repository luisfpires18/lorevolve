import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Refinement 037: Ideas as a fast scratch space, seen from one universe's Ideas, over the one account-owned idea
 * (ADR 0030 amendment).
 *
 * A one-line capture keeps a thought without leaving the list, placed in the universe it was typed in. The universe's
 * Ideas are the owner's only. An idea opens in the one editor, and Back returns to the list as it was left.
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

/** A universe with a story holding a scene and an arc. */
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
  return { storyId, sceneId, arcId }
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
  test('a universe’s ideas: a line captured stays in the list, opens in the full editor, and Back returns', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId } = await seedWorld(page)
    const base = `/app/universes/${universeId}/ideas`
    await page.goto(base)
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
    await expect(page).toHaveURL(base)
    await expect(page.getByTestId('idea-capture-error')).toHaveCount(0)
    await expect(row(page, 'Maybe this city floats')).toBeVisible()

    const listed = (await (
      await page.request.get(`/api/ideas?universeId=${universeId}`)
    ).json()) as {
      items: {
        id: string
        title: string
        excerpt: string
        universe: unknown
        referenceCount: number
      }[]
    }
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]).toMatchObject({
      excerpt: '',
      universe: { id: universeId },
      referenceCount: 0,
    })

    // The full editor is where it grows.
    await row(page, 'Maybe this city floats').getByTestId('idea-open').click()
    await page.waitForURL(`${base}/${listed.items[0].id}`)
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
    await page.waitForURL(base)
    await expect(row(page, 'Maybe this city floats').getByTestId('idea-excerpt')).toHaveText(
      'Nobody below has seen its underside.',
    )
  })

  test('a capture that fails keeps its words, and a second Enter while saving keeps one idea', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId } = await seedWorld(page)
    const base = `/app/universes/${universeId}/ideas`
    await page.goto(base)
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
    await expect(page).toHaveURL(base)
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

  test('a universe’s capture belongs to the universe', async ({ page }) => {
    await signUp(page)
    const { universeId } = await seedWorld(page)

    await page.goto(`/app/universes/${universeId}/ideas`)
    await capture(page, 'The river remembers')
    const captured = row(page, 'The river remembers')
    await expect(captured).toBeVisible()
    expect(await captured.getAttribute('data-universe')).toMatch(/^Hollowmere /)
  })

  test('a collaborator sees no owner’s ideas in the owner’s universe', async ({ browser }) => {
    const owner = await person(browser)
    const editor = await person(browser)
    const { universeId, storyId } = await seedWorld(owner.page)
    await seedIdea(owner.page, 'Owner’s private thought', universeId)

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

    // By address, the view says it is not theirs, and asks for nothing.
    let asked = false
    editor.page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/ideas') asked = true
    })
    await editor.page.goto(`/app/universes/${universeId}/ideas`)
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
    test(`a universe’s ideas and its capture fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const { universeId } = await seedWorld(page)
      await page.goto(`/app/universes/${universeId}/ideas`)

      await capture(page, 'A thought typed on a phone, long enough to fill the line')
      await expect(
        row(page, 'A thought typed on a phone, long enough to fill the line'),
      ).toBeVisible()
      await expectNoSidewaysScroll(page, 'universe ideas')

      await page.getByTestId('ideas-view-deleted').click()
      await expectNoSidewaysScroll(page, 'universe recently deleted')
    })
  }
})
