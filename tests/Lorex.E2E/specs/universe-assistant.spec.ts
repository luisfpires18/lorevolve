import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * The universe assistant (ADR 0045), on the local Fake provider: a button beside the search, a drawer that asks no model
 * until a question is sent, answers whose parts say whether they are recorded, inferred or suggested, sources that open
 * where they live, the failure and not-set-up states, the keyboard, a phone and dark mode.
 *
 * The Fake provider reads the universe through the real tools and words its answer by plain rules: it looks up the
 * question's capitalised names, answers an "ideas" question as a suggestion and a "Does..." question as an inference,
 * and says when nothing is recorded. No real model is reached and no key is needed.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('asker')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

interface World {
  universeId: string
  /** Unique per test, so the Fake's search finds this test's entry and no other. */
  name: string
  entityId: string
}

async function seedWorld(page: Page): Promise<World> {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Asked '),
    description: null,
    accentColor: null,
  })
  const u = `/api/universes/${universe.id}`
  const types = await api<{ id: string; name: string }[]>(page, 'GET', `${u}/entity-types`)
  // A capitalised word of its own, so the Fake looks up this entry by name and nothing another test wrote.
  const name = `Mira ${unique('Q')}`
  const entity = await api<{ id: string }>(page, 'POST', `${u}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: "The lighthouse keeper's daughter.",
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  return { universeId: universe.id, name, entityId: entity.id }
}

/** Counts the questions sent - the only requests that reach a model. */
function countQuestions(page: Page) {
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/assistant')) {
      asked.push(request.url())
    }
  })
  return asked
}

async function openAssistant(page: Page) {
  await page.getByRole('button', { name: 'Assistant' }).click()
  await expect(page.getByTestId('assistant-drawer')).toBeVisible()
}

async function ask(page: Page, question: string) {
  await page.getByTestId('assistant-input').fill(question)
  await page.getByTestId('assistant-ask').click()
  await expect(
    page.getByTestId('assistant-turn').last().getByTestId('assistant-answer'),
  ).toBeVisible()
  return page.getByTestId('assistant-turn').last()
}

async function scrollsSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test.describe('universe assistant', () => {
  test('opening it asks nothing; a factual answer is recorded and its source opens the entry', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const asked = countQuestions(page)
    await page.goto(`/app/universes/${world.universeId}`)

    await openAssistant(page)
    const drawer = page.getByTestId('assistant-drawer')
    await expect(drawer.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByTestId('assistant-empty')).toBeVisible()
    await expect(page.getByLabel('Your question')).toBeFocused()
    await expect(page.getByTestId('assistant-prompt')).toHaveCount(3)
    expect(asked, 'no question is sent by opening the assistant').toHaveLength(0)

    const turn = await ask(page, `Who is ${world.name}?`)
    expect(asked).toHaveLength(1)

    const part = turn.getByTestId('assistant-part')
    await expect(part).toHaveCount(1)
    await expect(part).toHaveAttribute('data-kind', 'recorded')
    await expect(part.getByText('Recorded', { exact: true })).toBeVisible()
    await expect(part).toContainText("The lighthouse keeper's daughter.")
    await expect(page.getByTestId('assistant-announcer')).toHaveText('Answered.')

    const source = turn.getByRole('link', { name: `Lore ${world.name}` })
    await expect(source).toBeVisible()
    await source.click()

    await page.waitForURL(`**/app/universes/${world.universeId}/lore/${world.entityId}`)
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: world.name })).toBeVisible()

    // The conversation stays while the universe is open.
    await openAssistant(page)
    await expect(page.getByTestId('assistant-turn')).toHaveCount(1)
  })

  test('an inference, a suggestion and something not recorded each say what they are', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    await page.goto(`/app/universes/${world.universeId}`)
    await openAssistant(page)

    const inferred = await ask(page, `Does ${world.name} know the keeper?`)
    await expect(inferred.getByTestId('assistant-part')).toHaveAttribute('data-kind', 'inference')
    await expect(inferred.getByText('Inference', { exact: true })).toBeVisible()
    await expect(inferred.getByTestId('assistant-source')).toHaveCount(1)

    const suggested = await ask(page, `Give me ideas for ${world.name}`)
    await expect(suggested.getByTestId('assistant-part')).toHaveAttribute('data-kind', 'suggestion')
    await expect(suggested.getByText('Suggestion', { exact: true })).toBeVisible()

    const missing = await ask(page, `Who killed ${unique('Tobias')}?`)
    await expect(missing.getByTestId('assistant-part')).toHaveAttribute('data-kind', 'note')
    await expect(missing).toContainText("LoreX doesn't currently record anything about")
    await expect(missing.getByTestId('assistant-source')).toHaveCount(0)
    await expect(page.getByTestId('assistant-turn')).toHaveCount(3)
  })

  test('a failed answer can be asked again, and a host without the assistant says so', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    await page.goto(`/app/universes/${world.universeId}`)
    await openAssistant(page)

    await page.route('**/api/universes/*/assistant', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 502,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              title: 'No answer',
              detail: "The assistant couldn't answer that. Try again.",
              status: 502,
              code: 'assistant_failed',
            }),
          })
        : route.continue(),
    )

    await page.getByTestId('assistant-input').fill(`Who is ${world.name}?`)
    await page.getByTestId('assistant-ask').click()
    await expect(page.getByRole('alert')).toHaveText(
      "The assistant couldn't answer that. Try again.",
    )

    await page.unroute('**/api/universes/*/assistant')
    await page.getByTestId('assistant-retry').click()
    await expect(page.getByTestId('assistant-answer')).toBeVisible()
    await expect(page.getByTestId('assistant-turn')).toHaveCount(1)
    await expect(page.getByTestId('assistant-error')).toHaveCount(0)

    // A host with no provider: the drawer says so instead of offering a box.
    await page.route('**/api/universes/*/assistant', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"isAvailable":false}',
      }),
    )
    await page.reload()
    await openAssistant(page)
    await expect(page.getByTestId('assistant-unavailable')).toBeVisible()
    await expect(page.getByTestId('assistant-input')).toHaveCount(0)
  })

  test('the keyboard opens, asks and closes it, and the focus comes back', async ({ page }) => {
    await signUp(page)
    const world = await seedWorld(page)
    await page.goto(`/app/universes/${world.universeId}`)

    const trigger = page.getByRole('button', { name: 'Assistant' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Your question')).toBeFocused()

    // A starting point that needs finishing fills the box instead of asking.
    await page.getByTestId('assistant-prompt').nth(1).click()
    await expect(page.getByTestId('assistant-input')).toHaveValue('What is connected to ')
    await expect(page.getByTestId('assistant-input')).toBeFocused()

    await page.getByTestId('assistant-input').fill(`Who is ${world.name}?`)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('assistant-answer')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('assistant-drawer')).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('on a phone in the dark it fills the screen, scrolls, and keeps authored direction', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const world = await seedWorld(page)
    await page.goto(`/app/universes/${world.universeId}`)

    // The button folds to its icon beside the search; its name stays.
    const trigger = page.getByRole('button', { name: 'Assistant' })
    const search = (await page.getByRole('combobox').boundingBox())!
    const button = (await trigger.boundingBox())!
    expect(button.y).toBeLessThan(search.y + search.height)
    expect(button.x + button.width).toBeLessThanOrEqual(390)
    expect(button.width).toBeLessThan(80)

    await openAssistant(page)
    // Measured once the drawer has finished sliding in.
    const drawer = page.getByTestId('assistant-drawer')
    await expect.poll(async () => (await drawer.boundingBox())!.x).toBeLessThanOrEqual(1)
    expect((await drawer.boundingBox())!.width).toBeGreaterThanOrEqual(389)
    expect(await scrollsSideways(page)).toBe(false)
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    for (let asked = 0; asked < 3; asked++) {
      await ask(page, `Who is ${world.name}?`)
    }
    // The newest answer is in view at the foot of the conversation, the box still beneath it.
    await expect(page.getByTestId('assistant-answer').last()).toBeInViewport()
    await expect(page.getByTestId('assistant-input')).toBeInViewport()
    const touch = (await page.getByTestId('assistant-source').last().boundingBox())!
    expect(touch.height).toBeGreaterThanOrEqual(32)

    // A question written right to left reads right to left.
    await page.getByTestId('assistant-input').fill('מי שמר על המגדלור?')
    await page.getByTestId('assistant-ask').click()
    const question = page.getByTestId('assistant-turn').last().locator('.assistantturn__text')
    await expect(question).toHaveText('מי שמר על המגדלור?')
    expect(await question.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl')
    expect(await scrollsSideways(page)).toBe(false)
  })
})
