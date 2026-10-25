import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #48: moving between a story's plan (Plot: arc -> beat), its writing (Scenes: chapter -> scene -> manuscript) and the
 * world's chronology (Timeline), over the links the story already keeps - a beat's scenes, a scene's world date, a moment's
 * stories. Nothing here adds a link: each test seeds through the API and only follows what is drawn.
 *
 * The journey is the issue's own: The Burden of the Ring -> The Ring passes to Frodo, realised in two scenes of chapter
 * one; a third scene, a flashback, advances no beat.
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
  const arc = await post(page, `/api/universes/${u}/stories/${story}/plot-arcs`, {
    title: 'The Burden of the Ring',
    description: null,
    notes: null,
  })
  const beat = await post(page, `/api/universes/${u}/stories/${story}/plot-arcs/${arc}/beats`, {
    title: 'The Ring passes to Frodo',
    description: null,
    notes: null,
    sceneIds: [birthday, reveal],
    entityIds: [],
  })
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

  return { u, story, birthday, reveal, alliance, beat, unplanned, lone }
}

function beat(page: Page, title: string) {
  return page.locator(`[data-testid="plot-beat"][data-title="${title}"]`)
}

test.describe('story workflow across Plot, Scenes, Manuscript and Timeline', () => {
  test('from a beat, each linked scene shows its chapter and opens on Scenes or straight in its manuscript, which leads back to the beat', async ({
    page,
  }) => {
    const w = await seedJourney(page)
    const base = `/app/universes/${w.u}/stories/${w.story}`

    await page.goto(`${base}/plot`)
    const passes = beat(page, 'The Ring passes to Frodo')
    const chips = passes.getByTestId('plot-beat-scene')
    await expect(chips).toHaveText([
      /Bilbo's birthday and farewell.*Chapter 1/,
      /Gandalf reveals the Ring's identity.*Chapter 1/,
    ])
    // The flashback advances no beat, so the beat does not name it.
    await expect(passes).not.toContainText('The Last Alliance')

    // The scene chip still opens the scene in its chapter on Scenes.
    await expect(chips.first()).toHaveAttribute('href', `${base}#scene-${w.birthday}`)

    // Its manuscript is one step from the beat, named for the scene it opens.
    const write = passes.getByRole('link', {
      name: "Manuscript of “Gandalf reveals the Ring's identity”",
    })
    await expect(write).toHaveAttribute('title', 'Manuscript')
    await write.click()
    await page.waitForURL(`${base}/manuscript/${w.reveal}`)
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(
      "Gandalf reveals the Ring's identity",
    )

    // Writing it, the beat it realises is in sight, and leads back to it on Plot.
    const plot = page.getByTestId('manuscript-plot-beat')
    await expect(plot).toHaveText('The Burden of the Ring → The Ring passes to Frodo')
    await expect(page.getByTestId('manuscript-plot-none')).toHaveCount(0)
    await plot.click()
    await page.waitForURL(`${base}/plot#beat-${w.beat}`)
    await expect(passes).toBeFocused()
  })

  test('a scene no beat links says so on its manuscript, and where to link one; a story with no plot says nothing', async ({
    page,
  }) => {
    const w = await seedJourney(page)
    const base = `/app/universes/${w.u}/stories/${w.story}`

    await page.goto(`${base}/manuscript/${w.alliance}`)
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(
      "The Last Alliance and Sauron's fall",
    )
    const none = page.getByTestId('manuscript-plot-none')
    await expect(none).toHaveText('PlotNo beat links this scene. Open Plot')
    await expect(page.getByTestId('manuscript-plot-beat')).toHaveCount(0)
    await none.getByRole('link', { name: 'Open Plot' }).click()
    await page.waitForURL(`${base}/plot`)
    await expect(beat(page, 'The Ring passes to Frodo')).toBeVisible()

    // A scene need not have a beat: where the story plans none, the manuscript asks for nothing.
    await page.goto(`/app/universes/${w.u}/stories/${w.unplanned}/manuscript/${w.lone}`)
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('A lone scene')
    await expect(page.getByTestId('manuscript-plot-none')).toHaveCount(0)
    await expect(page.getByTestId('manuscript-details-toggle')).toHaveCount(0)
  })

  test("a dated scene's date opens its story's timeline, in world order, and the timeline leads back to the scene's manuscript and beat", async ({
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

    // The timeline's scene row leads to the manuscript and to the plot, as it already did.
    const reveal = page.locator(
      `[data-testid="timeline-item"][data-title="Gandalf reveals the Ring's identity"]`,
    )
    await expect(reveal.getByTestId('timeline-open-plot')).toHaveAttribute(
      'href',
      `${base}/plot#beat-${w.beat}`,
    )
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

  test('on a phone the plot context is behind Scene details, and the beat and the timeline are still reached', async ({
    page,
  }) => {
    const w = await seedJourney(page)
    const base = `/app/universes/${w.u}/stories/${w.story}`
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto(`${base}/plot`)
    await beat(page, 'The Ring passes to Frodo')
      .getByRole('link', { name: "Manuscript of “Bilbo's birthday and farewell”" })
      .click()
    await page.waitForURL(`${base}/manuscript/${w.birthday}`)

    await expect(page.getByTestId('manuscript-plot-beat')).toBeHidden()
    await page.getByTestId('manuscript-details-toggle').click()
    await expect(page.getByTestId('manuscript-plot-beat')).toBeVisible()
    await expect(page.getByTestId('manuscript-timeline')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
