import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #48: moving between a story's writing (Scenes: chapter -> scene -> manuscript) and the world's chronology
 * (Timeline), over the links the story already keeps - a scene's world date, a moment's stories. Nothing here adds a
 * link: each test seeds through the API and only follows what is drawn. The Plot view is gone (ADR 0070); a scene's beats
 * are its own.
 *
 * The journey is the issue's own: two scenes of chapter one, the first with the beat "The Ring passes to Frodo"; a third
 * scene, a flashback, has no beat.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('journey')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.status(), path).toBe(201)
  return (await response.json()).id as string
}

async function seedScene(
  page: Page,
  u: string,
  story: string,
  title: string,
  chapterId: string | null,
  year: number | null,
) {
  return post(page, `/api/universes/${u}/stories/${story}/scenes`, {
    title,
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: year === null ? null : { eraId: null, year, month: null, day: null },
    entityIds: [],
    chapterId,
  })
}

/** The Fellowship, as far as the issue's journey goes, and a second story with no plot at all. */
async function seedJourney(page: Page) {
  await signUp(page)
  const u = await post(page, '/api/universes', {
    name: unique('Middle-earth '),
    description: null,
    accentColor: null,
  })
  const story = await post(page, `/api/universes/${u}/stories`, {
    title: 'The Fellowship of the Ring',
    premise: null,
    status: 0,
  })
  const chapter = await post(page, `/api/universes/${u}/stories/${story}/chapters`, {
    title: "The Ring's Long Shadow",
    summary: null,
    notes: null,
  })
  const birthday = await seedScene(page, u, story, "Bilbo's birthday and farewell", chapter, 3001)
  const reveal = await seedScene(
    page,
    u,
    story,
    "Gandalf reveals the Ring's identity",
    chapter,
    3018,
  )
  const alliance = await seedScene(
    page,
    u,
    story,
    "The Last Alliance and Sauron's fall",
    chapter,
    null,
  )
  // The scene's own beats (ADR 0070), saved with the scene.
  const scenePath = `/api/universes/${u}/stories/${story}/scenes/${birthday}`
  const read = (await (await page.request.get(scenePath)).json()) as Record<string, unknown>
  const saved = await page.request.put(scenePath, {
    data: {
      title: read.title,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: read.chronology,
      entityIds: [],
      chapterId: chapter,
      expectedVersion: read.version,
      beats: [{ title: 'The Ring passes to Frodo', note: null }],
    },
  })
  expect(saved.ok()).toBe(true)
  await post(page, `/api/universes/${u}/timeline`, {
    title: 'Gandalf hunts for Gollum',
    description: null,
    canonStatus: 2,
    dateKind: 0,
    startYear: 3009,
    startMonth: null,
    startDay: null,
    endYear: null,
    endMonth: null,
    endDay: null,
    eraLabel: null,
    entityIds: [],
    storyIds: [story],
  })
  const unplanned = await post(page, `/api/universes/${u}/stories`, {
    title: 'Unplanned tale',
    premise: null,
    status: 0,
  })
  const lone = await seedScene(page, u, unplanned, 'A lone scene', null, null)

  return { u, story, birthday, reveal, alliance, unplanned, lone }
}

test.describe('story workflow across Scenes, Manuscript and Timeline', () => {
  test("a dated scene's date opens its story's timeline, in world order, and the timeline leads back to the scene's manuscript", async ({
    page,
  }) => {
    const w = await seedJourney(page)
    const base = `/app/universes/${w.u}/stories/${w.story}`
    const timeline = `/app/universes/${w.u}/timeline?story=${w.story}`

    // From the Scenes view.
    await page.goto(base)
    const card = page.locator(`[data-testid="scene"][data-title="Bilbo's birthday and farewell"]`)
    await expect(card.getByTestId('scene-timeline')).toHaveText('3001')
    await card.getByTestId('scene-timeline').click()
    await page.waitForURL(timeline)
    await expect(page.getByTestId('chron-story-scope')).toContainText('The Fellowship of the Ring')
    await expect
      .poll(() =>
        page
          .getByTestId('timeline-item')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-title'))),
      )
      .toEqual([
        "Bilbo's birthday and farewell",
        'Gandalf hunts for Gollum',
        "Gandalf reveals the Ring's identity",
      ])

    // The timeline's scene row leads to the manuscript, as it already did.
    const reveal = page.locator(
      `[data-testid="timeline-item"][data-title="Gandalf reveals the Ring's identity"]`,
    )
    await expect(reveal.getByTestId('timeline-open-plot')).toHaveCount(0)
    await reveal.getByTestId('timeline-open-manuscript').click()
    await page.waitForURL(`${base}/manuscript/${w.reveal}`)

    // And from the manuscript, the same way to the timeline.
    await expect(page.getByTestId('manuscript-timeline')).toHaveText('3018')
    await page.getByTestId('manuscript-timeline').click()
    await page.waitForURL(timeline)

    // An undated scene has no date to follow.
    await page.goto(`${base}/manuscript/${w.alliance}`)
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(
      "The Last Alliance and Sauron's fall",
    )
    await expect(page.getByTestId('manuscript-timeline')).toHaveCount(0)
  })

  test("on a phone a scene's beats are behind Scene details, and the timeline is still reached", async ({
    page,
  }) => {
    const w = await seedJourney(page)
    const base = `/app/universes/${w.u}/stories/${w.story}`
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto(`${base}/manuscript/${w.birthday}`)
    await expect(page.getByTestId('manuscript-beat')).toBeHidden()
    await page.getByTestId('manuscript-details-toggle').click()
    await expect(page.getByTestId('manuscript-beat')).toHaveText(['The Ring passes to Frodo'])
    await expect(page.getByTestId('manuscript-timeline')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
