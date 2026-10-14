import { expect, test, type Page } from '@playwright/test'

/**
 * The universe's persistent search bar (ADR 0031): on every screen of a universe and on none outside one; lore and
 * articles, stories, chapters, scenes, arcs, beats, manuscripts and the universe's ideas found as they are typed, and each
 * opened where it already lives; the keyboard; only ever the answer to what is in the box; the leave question before
 * unsaved writing is left for a result; the Trash; and a phone to a wide desktop, light and dark.
 *
 * Each test registers its own account and builds its own universe through the API, so nothing depends on data another test
 * left behind, and every word searched for is one no other test writes.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('seeker')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** One API call as the signed-in account, refused loudly. */
async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
) {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

function doc(...paragraphs: string[]) {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  })
}

interface World {
  universeId: string
  entityId: string
  articleEntityId: string
  storyId: string
  chapterId: string
  sceneId: string
  proseSceneId: string
  arcId: string
  beatId: string
  ideaId: string
  unassignedIdeaId: string
  elsewhereIdeaId: string
}

/**
 * A universe holding one of everything the search reads, each found by a word of its own: an entry by its name, another
 * by its article, a story, a chapter, a scene by its summary, a scene's prose, an arc, a beat by its description, and an
 * idea - beside an unassigned idea and another universe that hold the same words and must never be offered.
 */
async function seedWorld(page: Page): Promise<World> {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Searched '),
    description: null,
    accentColor: null,
  })
  const u = `/api/universes/${universe.id}`
  const types = await api<{ id: string; name: string }[]>(page, 'GET', `${u}/entity-types`)
  const character = types.find((type) => type.name === 'Character')!.id

  const entry = async (name: string, summary: string | null = null) =>
    api<{ id: string }>(page, 'POST', `${u}/entities`, {
      entityTypeId: character,
      name,
      summary,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })

  const entity = await entry('Quennell of the Salt Road')
  const articleEntity = await entry('Harbour Keeper')
  await api(page, 'PUT', `${u}/entities/${articleEntity.id}/article`, {
    content: doc('Long before the war the Tarrowmere lamps were lit by hand.'),
    expectedVersion: 0,
  })

  const story = await api<{ id: string }>(page, 'POST', `${u}/stories`, {
    title: 'The Ondrelle Siege',
    premise: 'Told from its last day.',
    status: 0,
  })
  const s = `${u}/stories/${story.id}`
  const chapter = await api<{ id: string }>(page, 'POST', `${s}/chapters`, {
    title: 'Crossing the Veldmark',
    summary: null,
    notes: null,
  })
  const scene = await api<{ id: string }>(page, 'POST', `${s}/scenes`, {
    title: 'The Council',
    summary: 'The nine argue at Brackwater.',
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
    chapterId: chapter.id,
  })
  const proseScene = await api<{ id: string }>(page, 'POST', `${s}/scenes`, {
    title: 'The Gate',
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
    chapterId: chapter.id,
  })
  await api(page, 'PUT', `${s}/scenes/${proseScene.id}/manuscript`, {
    content: 'The hall had emptied long before the Hollowmere bells rang.',
    expectedVersion: 0,
  })
  const arc = await api<{ id: string }>(page, 'POST', `${s}/plot-arcs`, {
    title: 'Fall of Cindervane',
    description: null,
    notes: null,
  })
  const beat = await api<{ id: string }>(page, 'POST', `${s}/plot-arcs/${arc.id}/beats`, {
    title: 'The crown is refused',
    description: 'Mira burns the Pellucid letter.',
    notes: null,
    sceneIds: [],
    entityIds: [],
  })
  const idea = await api<{ id: string }>(page, 'POST', '/api/ideas', {
    title: 'What if Vesperine floats?',
    body: 'Maybe.',
    universeId: universe.id,
    references: [],
    expectedUpdatedAt: null,
  })

  // The same words where the bar must never look.
  const unassignedIdea = await api<{ id: string }>(page, 'POST', '/api/ideas', {
    title: 'Vesperine, unassigned',
    body: 'Quennell Tarrowmere Hollowmere',
    universeId: null,
    references: [],
    expectedUpdatedAt: null,
  })
  const elsewhere = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Elsewhere '),
    description: null,
    accentColor: null,
  })
  const elsewhereIdea = await api<{ id: string }>(page, 'POST', '/api/ideas', {
    title: 'Vesperine elsewhere',
    body: 'Quennell',
    universeId: elsewhere.id,
    references: [],
    expectedUpdatedAt: null,
  })

  return {
    universeId: universe.id,
    entityId: entity.id,
    articleEntityId: articleEntity.id,
    storyId: story.id,
    chapterId: chapter.id,
    sceneId: scene.id,
    proseSceneId: proseScene.id,
    arcId: arc.id,
    beatId: beat.id,
    ideaId: idea.id,
    unassignedIdeaId: unassignedIdea.id,
    elsewhereIdeaId: elsewhereIdea.id,
  }
}

function searchBox(page: Page) {
  return page.getByRole('combobox', { name: 'Search this universe' })
}

function results(page: Page) {
  return page.getByRole('listbox', { name: 'Results' }).getByRole('option')
}

/** The one result of a kind, by the title it shows. */
function result(page: Page, kind: string, title: string) {
  return results(page)
    .filter({ has: page.getByText(kind, { exact: true }) })
    .filter({ has: page.getByText(title, { exact: true }) })
}

/** Types into the bar and waits for the answer to exactly that, shown. */
async function search(page: Page, text: string) {
  const answered = page.waitForResponse(
    (response) =>
      response.url().includes('/search?') &&
      new URL(response.url()).searchParams.get('q') === text.trim(),
  )
  await searchBox(page).fill(text)
  await answered
  await expect(page.getByTestId('universe-search-searching')).toBeHidden()
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('universe search', () => {
  test('the bar is on every screen of a universe, on a desktop and a phone, and on no screen outside one', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`

    for (const path of [
      '',
      '/lore',
      `/lore/${world.entityId}`,
      '/timeline',
      '/stories',
      `/stories/${world.storyId}`,
      `/stories/${world.storyId}/plot`,
      `/stories/${world.storyId}/manuscript/${world.proseSceneId}`,
      '/ideas',
      `/ideas/${world.ideaId}`,
      '/canon',
      '/types',
      '/trash',
      '/settings',
    ]) {
      await page.goto(`${base}${path}`)
      await expect(searchBox(page), `the bar on ${path || 'the overview'}`).toBeVisible()
      await expect(searchBox(page)).toHaveAttribute('placeholder', 'Search this universe')
    }

    // Moving between sections keeps one bar, and what was typed in it.
    await page.goto(`${base}/lore`)
    await searchBox(page).fill('Quennell')
    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(`${base}/stories`)
    await expect(searchBox(page)).toHaveValue('Quennell')
    await expect(page.getByRole('combobox')).toHaveCount(1)

    // No universe, no bar: the account's own screens are not a universe, and nothing pretends otherwise.
    for (const path of ['/app', '/app/ideas', '/app/profile']) {
      await page.goto(path)
      await expect(page.getByRole('heading').first()).toBeVisible()
      await expect(searchBox(page), `no bar on ${path}`).toHaveCount(0)
    }

    // A phone: a real box in a row of its own, under the bar, beside the sections it does not replace.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${base}/stories/${world.storyId}`)
    // Compact under a mouse, as here; a touch screen gets a taller box.
    const box = (await searchBox(page).boundingBox())!
    expect(box.width).toBeGreaterThan(300)
    expect(box.height).toBeGreaterThanOrEqual(36)
    expect(await scrollsSideways(page)).toBe(false)

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-ideas').click()
    await page.waitForURL(`${base}/ideas`)
    await expect(searchBox(page)).toBeVisible()
  })

  test('finds lore, an article, a story, a chapter, a scene, an arc, a beat, a manuscript and an idea, and opens each where it lives', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`
    const story = `${base}/stories/${world.storyId}`
    await page.goto(`${base}/lore`)

    // An entry by its name: the entry.
    await search(page, 'Quennell')
    await expect(results(page)).toHaveCount(1)
    await result(page, 'Lore', 'Quennell of the Salt Road').click()
    await page.waitForURL(`${base}/lore/${world.entityId}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Quennell of the Salt Road')

    // Back returns to where the search was made, with the words still in the box and the list closed.
    await page.goBack()
    await page.waitForURL(`${base}/lore`)
    await expect(searchBox(page)).toHaveValue('Quennell')
    await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'false')

    // An entry by its article: one result, saying so with the words around the match, and it opens at the article.
    await search(page, 'Tarrowmere')
    const article = result(page, 'Lore', 'Harbour Keeper')
    await expect(article).toContainText('In the article')
    await expect(article.locator('mark')).toHaveText('Tarrowmere')
    await article.click()
    await page.waitForURL(`${base}/lore/${world.articleEntityId}#article`)
    await expect(
      page.getByTestId('article').getByRole('heading', { name: 'Article', exact: true }),
    ).toBeFocused()

    // A story, by its title.
    await search(page, 'Ondrelle')
    await result(page, 'Story', 'The Ondrelle Siege').click()
    await page.waitForURL(story)
    await expect(page.getByTestId('story-title')).toHaveText('The Ondrelle Siege')

    // A chapter: the story's Scenes view, landing on the chapter.
    await search(page, 'Veldmark')
    const chapter = result(page, 'Chapter', 'Crossing the Veldmark')
    await expect(chapter).toContainText('Chapter 1 of “The Ondrelle Siege”')
    await chapter.click()
    await page.waitForURL(`${story}#chapter-${world.chapterId}`)
    await expect(page.locator(`#chapter-${world.chapterId}`)).toBeFocused()

    // A scene by its summary: the Scenes view, landing on the scene, marked.
    await search(page, 'Brackwater')
    const scene = result(page, 'Scene', 'The Council')
    await expect(scene).toContainText('In the summary')
    await expect(scene).toContainText('Chapter 1: Crossing the Veldmark')
    await scene.click()
    await page.waitForURL(`${story}#scene-${world.sceneId}`)
    await expect(page.locator(`#scene-${world.sceneId}`)).toBeFocused()
    await expect(page.locator(`#scene-${world.sceneId}`)).toHaveAttribute('data-arrived', 'true')

    // An arc and a beat: the Plot view, landing on each.
    await search(page, 'Cindervane')
    await result(page, 'Arc', 'Fall of Cindervane').click()
    await page.waitForURL(`${story}/plot#arc-${world.arcId}`)
    await expect(page.locator(`#arc-${world.arcId}`)).toBeFocused()

    await search(page, 'Pellucid')
    const beat = result(page, 'Beat', 'The crown is refused')
    await expect(beat).toContainText('In the arc “Fall of Cindervane” of “The Ondrelle Siege”')
    await expect(beat).toContainText('In the description')
    await beat.click()
    await page.waitForURL(`${story}/plot#beat-${world.beatId}`)
    await expect(page.locator(`#beat-${world.beatId}`)).toBeFocused()

    // Saved prose: the scene's writing, open.
    await search(page, 'Hollowmere')
    const prose = result(page, 'Manuscript', 'The Gate')
    await expect(prose).toContainText('In the prose')
    await prose.click()
    await page.waitForURL(`${story}/manuscript/${world.proseSceneId}`)
    await expect(page.getByTestId('manuscript-editor')).toHaveValue(
      'The hall had emptied long before the Hollowmere bells rang.',
    )

    // The universe's idea, in the universe's Ideas - and neither the unassigned one nor another universe's.
    await search(page, 'Vesperine')
    await expect(results(page)).toHaveCount(1)
    await result(page, 'Idea', 'What if Vesperine floats?').click()
    await page.waitForURL(`${base}/ideas/${world.ideaId}`)
    await expect(page.getByTestId('idea-title')).toHaveValue('What if Vesperine floats?')

    // Each result was one step in the history: Back walks them in order.
    await page.goBack()
    await page.waitForURL(`${story}/manuscript/${world.proseSceneId}`)
    await page.goBack()
    await page.waitForURL(`${story}/plot#beat-${world.beatId}`)
  })

  test('an idea result opens that very idea in the universe’s Ideas, at an address that reloads, by pointer and keyboard, on a phone', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`

    // A second idea of this universe answering the same word, with a long title in several scripts.
    const long =
      'Ærendel’s floating 北の門 over المدينة — what if Vesperine’s tower was never on the ground at all, and every map of it lied 🐉'
    const other = await api<{ id: string }>(page, 'POST', '/api/ideas', {
      title: long,
      body: 'Maps lie.',
      universeId: world.universeId,
      references: [],
      expectedUpdatedAt: null,
    })

    // Both of this universe's ideas are offered; the unassigned one and the other universe's are not.
    await page.goto(`${base}/timeline`)
    await search(page, 'Vesperine')
    await expect(results(page)).toHaveCount(2)

    // By pointer: that idea, in the existing editor - its own title and body - and not the list of ideas.
    await result(page, 'Idea', long).click()
    await page.waitForURL(`${base}/ideas/${other.id}`)
    await expect(page.getByTestId('idea-editor')).toBeVisible()
    await expect(page.getByTestId('idea-heading')).toHaveText(long)
    await expect(page.getByTestId('idea-title')).toHaveValue(long)
    await expect(page.getByTestId('idea-body')).toHaveValue('Maps lie.')
    await expect(page.getByTestId('idea-row')).toHaveCount(0)
    await expect(page.getByTestId('workspace-ideas')).toHaveAttribute('aria-current', 'page')

    // The address is the destination: a reload opens the same idea, and Back returns to where the search was made.
    await page.reload()
    await expect(page.getByTestId('idea-title')).toHaveValue(long)
    await page.goBack()
    await page.waitForURL(`${base}/timeline`)

    // By keyboard: the other idea, opened with Enter and said so.
    await search(page, 'Vesperine floats')
    await expect(results(page)).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForURL(`${base}/ideas/${world.ideaId}`)
    await expect(page.getByTestId('idea-title')).toHaveValue('What if Vesperine floats?')
    await expect(page.getByTestId('idea-body')).toHaveValue('Maybe.')
    await expect(page.getByTestId('universe-search-announcer')).toHaveText(
      'Opened Idea “What if Vesperine floats?”.',
    )
    await page.goBack()
    await page.waitForURL(`${base}/timeline`)

    // On a phone: the same, the long title wrapping inside the screen.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${base}/stories/${world.storyId}`)
    await search(page, 'Vesperine')
    await result(page, 'Idea', long).click()
    await page.waitForURL(`${base}/ideas/${other.id}`)
    await expect(page.getByTestId('idea-heading')).toHaveText(long)
    const heading = (await page.getByTestId('idea-heading').boundingBox())!
    expect(heading.x + heading.width).toBeLessThanOrEqual(391)
    expect(await scrollsSideways(page)).toBe(false)
  })

  test('no other idea opens under a universe’s address, and unsaved writing is asked about before an idea result leaves it', async ({
    page,
    browser,
  }, testInfo) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`

    // The account's own ideas from another universe, or from none: nothing of them here, and a way to where they open.
    for (const [id, title] of [
      [world.elsewhereIdeaId, 'Vesperine elsewhere'],
      [world.unassignedIdeaId, 'Vesperine, unassigned'],
    ] as const) {
      await page.goto(`${base}/ideas/${id}`)
      await expect(page.getByTestId('idea-not-in-universe')).toBeVisible()
      await expect(page.getByTestId('idea-editor')).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText(title)
    }
    await page.getByRole('link', { name: 'Open it in all ideas' }).click()
    await page.waitForURL(`/app/ideas/${world.unassignedIdeaId}`)
    await expect(page.getByTestId('idea-title')).toHaveValue('Vesperine, unassigned')

    // An idea that does not exist, and another account's: not here, and nothing of it.
    const strangerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const stranger = await strangerContext.newPage()
    await signUp(stranger)
    const theirs = await api<{ id: string }>(stranger, 'POST', '/api/ideas', {
      title: 'A stranger’s secret idea',
      body: 'Not for anyone else.',
      universeId: null,
      references: [],
      expectedUpdatedAt: null,
    })
    await strangerContext.close()

    for (const id of [theirs.id, '00000000-0000-4000-8000-000000000000']) {
      await page.goto(`${base}/ideas/${id}`)
      await expect(page.getByTestId('idea-missing')).toBeVisible()
      await expect(page.locator('main')).not.toContainText('secret')
    }

    // Unsaved writing in one idea: an idea result elsewhere asks first, staying keeps everything, leaving opens it.
    const questions: string[] = []
    let answer: 'stay' | 'leave' = 'stay'
    page.on('dialog', (dialog) => {
      questions.push(dialog.message())
      void (answer === 'leave' ? dialog.accept() : dialog.dismiss())
    })

    const second = await api<{ id: string }>(page, 'POST', '/api/ideas', {
      title: 'Glassmere drowns',
      body: 'A second thought.',
      universeId: world.universeId,
      references: [],
      expectedUpdatedAt: null,
    })

    await page.goto(`${base}/ideas/${world.ideaId}`)
    await page.getByTestId('idea-body').fill('Maybe - unsaved.')
    await expect(page.getByTestId('idea-status')).toHaveText('Unsaved changes')

    await search(page, 'Glassmere')
    await result(page, 'Idea', 'Glassmere drowns').click()
    await expect.poll(() => questions.length).toBe(1)
    expect(questions[0]).toContain('unsaved')
    await expect(page).toHaveURL(`${base}/ideas/${world.ideaId}`)
    await expect(page.getByTestId('idea-body')).toHaveValue('Maybe - unsaved.')

    answer = 'leave'
    await searchBox(page).press('Enter')
    await expect.poll(() => questions.length).toBe(2)
    await page.waitForURL(`${base}/ideas/${second.id}`)
    await expect(page.getByTestId('idea-title')).toHaveValue('Glassmere drowns')
  })

  test('the keyboard reaches, walks and opens the results, and Escape and Tab close them', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`
    const box = searchBox(page)
    await page.goto(`${base}/timeline`)

    // Reached by Tab like any control, before the screen it sits above.
    await page.getByTestId('workspace-settings').focus()
    await page.keyboard.press('Tab')
    await expect(box).toBeFocused()

    // "the" is in the story, the arc, the beat, the scene and the prose, and so lists several results.
    await search(page, 'the')
    await expect(box).toHaveAttribute('aria-expanded', 'true')
    const count = await results(page).count()
    expect(count).toBeGreaterThan(2)
    await expect(page.getByTestId('universe-search-announcer')).toContainText(`${count} results`)
    await expect(box).not.toHaveAttribute('aria-activedescendant')

    // Down highlights the first, then the second; Up goes back; Up from the first wraps to the last.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const second = results(page).nth(1)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(box).toHaveAttribute('aria-activedescendant', (await second.getAttribute('id'))!)
    await expect(results(page).nth(0)).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(results(page).nth(count - 1)).toHaveAttribute('aria-selected', 'true')
    await expect(box).toBeFocused()

    // Escape closes the list and keeps the words; Down opens it again; Escape twice clears the box.
    await page.keyboard.press('Escape')
    await expect(box).toHaveAttribute('aria-expanded', 'false')
    await expect(box).toHaveValue('the')
    await expect(page).toHaveURL(`${base}/timeline`)
    await page.keyboard.press('ArrowDown')
    await expect(box).toHaveAttribute('aria-expanded', 'true')
    await expect(results(page).nth(0)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(box).toHaveValue('')

    // Enter opens the highlighted result.
    await search(page, 'Cindervane')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForURL(`${base}/stories/${world.storyId}/plot#arc-${world.arcId}`)

    // With nothing highlighted, Enter opens the first result.
    await page.goto(`${base}/lore`)
    await search(page, 'Quennell')
    await searchBox(page).press('Enter')
    await page.waitForURL(`${base}/lore/${world.entityId}`)

    // Tab leaves the bar and closes the list.
    await page.goto(`${base}/lore`)
    await search(page, 'Quennell')
    await expect(searchBox(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await expect(searchBox(page)).not.toBeFocused()
    await expect(page.getByTestId('universe-search-panel')).toBeHidden()
  })

  test('only results for what is in the box are ever shown: searching, nothing found, a failure and a late answer', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    await page.goto(`/app/universes/${world.universeId}/stories`)
    const box = searchBox(page)

    // The answer to a half-typed word is held back; the word is finished before it arrives.
    let held = 0
    await page.route(/\/api\/universes\/[^/]+\/search\?/, async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q')
      if (query === 'Cinder') {
        held++
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      try {
        await route.fulfill({ response: await route.fetch() })
      } catch {
        // Aborted by the page when the newer search replaced it: exactly what is being tested.
      }
    })

    const firstSent = page.waitForRequest((request) => request.url().includes('q=Cinder'))
    await box.fill('Cinder')
    await firstSent
    await expect(page.getByTestId('universe-search-searching')).toBeVisible()
    await expect(results(page)).toHaveCount(0)

    await box.fill('Cindervane letter')
    await expect(page.getByTestId('universe-search-empty')).toBeVisible()
    await box.fill('Cindervane')
    await expect(result(page, 'Arc', 'Fall of Cindervane')).toBeVisible()

    // Long after the held answer would have come back, the list still answers "Cindervane" alone, and nothing failed.
    await page.waitForTimeout(1800)
    expect(held).toBe(1)
    await expect(results(page)).toHaveCount(1)
    await expect(page.getByTestId('universe-search-error')).toHaveCount(0)
    await page.unroute(/\/api\/universes\/[^/]+\/search\?/)

    // Nothing found says so, in words, to a screen reader too.
    await search(page, 'Zyxwvut')
    await expect(page.getByTestId('universe-search-empty')).toHaveText(
      'Nothing in this universe matches “Zyxwvut”.',
    )
    await expect(page.getByTestId('universe-search-announcer')).toHaveText(
      'Nothing in this universe matches “Zyxwvut”.',
    )

    // Punctuation and query syntax are just words: nothing breaks, nothing is run.
    for (const text of ['"', "O'Brien (", 'a OR b*', 'NEAR(x', '🙂']) {
      await search(page, text)
      await expect(page.getByTestId('universe-search-error')).toHaveCount(0)
    }

    // A failure says so and offers a retry, which works once the server does.
    await page.route(/\/api\/universes\/[^/]+\/search\?/, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )
    await box.fill('Veldmark')
    await expect(page.getByTestId('universe-search-error')).toContainText(
      'The search could not be reached.',
    )
    await expect(results(page)).toHaveCount(0)

    await page.unroute(/\/api\/universes\/[^/]+\/search\?/)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(result(page, 'Chapter', 'Crossing the Veldmark')).toBeVisible()
    await expect(box).toBeFocused()
  })

  test('a result in the Trash is gone from the search and back with a restore', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const u = `/api/universes/${world.universeId}`
    await page.goto(`/app/universes/${world.universeId}/lore`)

    await search(page, 'Brackwater')
    await expect(result(page, 'Scene', 'The Council')).toBeVisible()

    await api(page, 'DELETE', `${u}/stories/${world.storyId}/scenes/${world.sceneId}`)
    await searchBox(page).fill('')
    await search(page, 'Brackwater')
    await expect(page.getByTestId('universe-search-empty')).toBeVisible()

    // The story in the Trash takes everything it holds out of the search, though nothing inside it is marked.
    await api(page, 'POST', `${u}/trash/scenes/${world.sceneId}/restore`)
    await api(page, 'DELETE', `${u}/stories/${world.storyId}`)
    for (const word of ['Ondrelle', 'Veldmark', 'Cindervane', 'Pellucid', 'Hollowmere']) {
      await searchBox(page).fill('')
      await search(page, word)
      await expect(page.getByTestId('universe-search-empty'), word).toBeVisible()
    }

    await api(page, 'POST', `${u}/trash/stories/${world.storyId}/restore`)
    await searchBox(page).fill('')
    await search(page, 'Brackwater')
    await expect(result(page, 'Scene', 'The Council')).toBeVisible()

    // A trashed entry and its article, the same.
    await api(page, 'DELETE', `${u}/entities/${world.articleEntityId}`)
    await searchBox(page).fill('')
    await search(page, 'Tarrowmere')
    await expect(page.getByTestId('universe-search-empty')).toBeVisible()
    await api(page, 'POST', `${u}/trash/${world.articleEntityId}/restore`)
    await searchBox(page).fill('')
    await search(page, 'Tarrowmere')
    await expect(result(page, 'Lore', 'Harbour Keeper')).toBeVisible()
  })

  test('unsaved writing in an article, a manuscript or an idea is asked about once before a result leaves it', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const base = `/app/universes/${world.universeId}`

    const questions: string[] = []
    let answer: 'stay' | 'leave' = 'stay'
    page.on('dialog', (dialog) => {
      questions.push(dialog.message())
      void (answer === 'leave' ? dialog.accept() : dialog.dismiss())
    })

    // A manuscript with unsaved prose. A click on a result asks; staying keeps the prose, the page and the list.
    await page.goto(`${base}/stories/${world.storyId}/manuscript/${world.proseSceneId}`)
    const prose = page.getByTestId('manuscript-editor')
    await expect(prose).toHaveValue('The hall had emptied long before the Hollowmere bells rang.')
    await prose.fill('Unsaved prose.')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Unsaved changes')

    await search(page, 'Quennell')
    await result(page, 'Lore', 'Quennell of the Salt Road').click()
    await expect.poll(() => questions.length).toBe(1)
    expect(questions[0]).toContain('unsaved')
    await expect(page).toHaveURL(
      `${base}/stories/${world.storyId}/manuscript/${world.proseSceneId}`,
    )
    await expect(prose).toHaveValue('Unsaved prose.')
    await expect(result(page, 'Lore', 'Quennell of the Salt Road')).toBeVisible()

    // Enter asks the same question, once; leaving goes.
    answer = 'leave'
    await searchBox(page).press('Enter')
    await expect.poll(() => questions.length).toBe(2)
    await page.waitForURL(`${base}/lore/${world.entityId}`)
    // The entry is on screen, so the manuscript it replaced - and its question - are gone.
    await expect(page.getByTestId('entry-name')).toHaveText('Quennell of the Salt Road')
    await expect(page.getByTestId('manuscript-editor')).toHaveCount(0)

    // An article being written: a result elsewhere asks; the same entry's own article asks nothing, because nothing is left.
    answer = 'stay'
    await page.goto(`${base}/lore/${world.articleEntityId}`)
    await page.getByTestId('article-edit').click()
    await expect(page.getByTestId('lore-editor')).toBeFocused()
    await page.keyboard.type(' Unsaved words.')
    await expect(page.getByTestId('article-status')).toHaveText('Unsaved changes')

    await search(page, 'Cindervane')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect.poll(() => questions.length).toBe(3)
    await expect(page).toHaveURL(`${base}/lore/${world.articleEntityId}`)
    await expect(page.getByTestId('article')).toHaveAttribute('data-state', 'editing')

    await search(page, 'Tarrowmere')
    await result(page, 'Lore', 'Harbour Keeper').click()
    await page.waitForURL(`${base}/lore/${world.articleEntityId}#article`)
    expect(questions).toHaveLength(3)
    await expect(page.getByTestId('article')).toHaveAttribute('data-state', 'editing')
    await expect(page.getByTestId('lore-editor')).toContainText('Unsaved words.')

    // Done lets the unsaved words go, by choice - so leaving the page below asks nothing more.
    answer = 'leave'
    await page.getByTestId('article-done').click()
    await expect.poll(() => questions.length).toBe(4)
    await expect(page.getByTestId('article')).toHaveAttribute('data-state', 'reading')

    // An idea with an unsaved body: asked, and leaving by choice goes.
    await page.goto(`${base}/ideas/${world.ideaId}`)
    await page.getByTestId('idea-body').fill('An unsaved thought.')
    await expect(page.getByTestId('idea-status')).toHaveText('Unsaved changes')
    await search(page, 'Veldmark')
    await result(page, 'Chapter', 'Crossing the Veldmark').click()
    await expect.poll(() => questions.length).toBe(5)
    await page.waitForURL(`${base}/stories/${world.storyId}#chapter-${world.chapterId}`)
  })

  test('the results fit and read from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const u = `/api/universes/${world.universeId}`
    const types = await api<{ id: string; name: string }[]>(page, 'GET', `${u}/entity-types`)
    const character = types.find((type) => type.name === 'Character')!.id
    for (const name of [
      'Seraphine Aldous-Montgomery-Ravenscroft, Warden of the Northern Watch and Keeper of the Unbroken Oath of Ninefold Winters Quorra',
      'Quorra' + 'x'.repeat(150),
      'Café Ærendel · 北の門 · المدينة Quorra 🐉',
    ]) {
      await api(page, 'POST', `${u}/entities`, {
        entityTypeId: character,
        name,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      })
    }

    for (const [width, height, colorScheme] of [
      [390, 844, 'dark'],
      [768, 1024, 'light'],
      [1440, 900, 'dark'],
      [1920, 1080, 'light'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      await page.goto(`/app/universes/${world.universeId}/stories/${world.storyId}`)

      await search(page, 'Quorra')
      await expect(results(page)).toHaveCount(3)

      const panel = (await page.getByTestId('universe-search-panel').boundingBox())!
      expect(panel.x, `panel at ${width}px`).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width, `panel at ${width}px`).toBeLessThanOrEqual(width + 1)
      expect(panel.y + panel.height, `panel at ${width}px`).toBeLessThanOrEqual(height)
      for (const option of await results(page).all()) {
        const box = (await option.boundingBox())!
        expect(box.x + box.width, `a result at ${width}px`).toBeLessThanOrEqual(
          panel.x + panel.width + 1,
        )
        await expect(option.getByText('Lore', { exact: true })).toBeVisible()
      }
      expect(await scrollsSideways(page), `no sideways scroll at ${width}px`).toBe(false)

      // The story's first screen still starts with its work beneath the bar.
      await page.keyboard.press('Escape')
      const newScene = (await page.getByTestId('new-scene').boundingBox())!
      expect(newScene.y + newScene.height, `new scene at ${width}px`).toBeLessThanOrEqual(height)
    }
  })
})
