import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseLoreType } from './support/lore'
import { expectWritten, writtenSelection } from './support/manuscript'

/**
 * Titles and names written right to left, or mixing scripts, drawn in their own direction.
 *
 * LorEvolve's interface is left to right and stays that way. What an author wrote is isolated in a `<bdi>`: inside it
 * the browser lays the text out in the direction of its first strong letter, so an Arabic or Hebrew title keeps
 * its words, numbers and brackets in the order they were written, while the header, card or row around it keeps
 * LorEvolve's layout exactly - nothing of the application turns right to left, nothing is reordered and nothing moves
 * aside. A title field is `dir="auto"` itself, since text in a field cannot be isolated from inside.
 *
 * The invariants: the authored text's own direction, the left-to-right layout around it, the accessible text
 * unchanged, and no screen scrolling sideways at 1440px or at 390px. Credentials here are obviously synthetic.
 */
const PASSWORD = 'Test-password-123!'

const Canon = { idea: 0, draft: 1, canon: 2 } as const

/** Realistic mixed-direction names: the cases where an inherited left-to-right direction reorders the text. */
const Text = {
  arabic: 'آكرون رايت',
  hebrew: 'אהרן רייט',
  rtlThenLatin: 'آكرون Wright',
  latinThenRtl: 'Wright آكرون',
  numbers: 'آكرون — 12 / Wright',
  brackets: 'آكرون (Wright)',
  long: 'آكرون رايت من البيت السابع، حداد وقاضٍ وأب متردد لسلالة Wright التي عملت الحديد لأحد عشر جيلاً (12)',
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('scribe')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

// ---------- Setup through the API: the specs are about how things are drawn, not how they are made ----------

async function post<T = { id: string }>(page: Page, url: string, data: unknown) {
  const response = await page.request.post(url, { data })
  expect(response.ok(), `${url} answered ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

async function seedUniverse(page: Page, name: string) {
  return (await post(page, '/api/universes', { name, description: null, accentColor: null })).id
}

async function seedType(page: Page, universeId: string, name: string) {
  return (
    await post(page, `/api/universes/${universeId}/entity-types`, {
      name,
      description: null,
      icon: null,
      accentColor: null,
      displayOrder: null,
      // A person type, so its entries keep the Family tree action the header tests measure.
      familyTreeEligible: true,
    })
  ).id
}

async function characterTypeId(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return types.find((type) => type.name === 'Character')!.id
}

async function seedEntity(
  page: Page,
  universeId: string,
  name: string,
  { typeId, aliases = [] }: { typeId?: string; aliases?: string[] } = {},
) {
  return (
    await post(page, `/api/universes/${universeId}/entities`, {
      entityTypeId: typeId ?? (await characterTypeId(page, universeId)),
      name,
      summary: null,
      canonStatus: Canon.canon,
      aliases,
      tags: [],
      fields: [],
    })
  ).id
}

async function seedKind(page: Page, universeId: string, name: string, inverseName: string) {
  return (
    await post(page, `/api/universes/${universeId}/relationship-types`, {
      name,
      inverseName,
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic: 1,
    })
  ).id
}

async function seedLink(page: Page, universeId: string, kindId: string, from: string, to: string) {
  await post(page, `/api/universes/${universeId}/relationships`, {
    relationshipTypeId: kindId,
    sourceEntityId: from,
    targetEntityId: to,
    canonStatus: Canon.canon,
    startDate: null,
    endDate: null,
    notes: null,
  })
}

async function seedStory(page: Page, universeId: string, title: string) {
  return (
    await post(page, `/api/universes/${universeId}/stories`, { title, premise: null, status: 0 })
  ).id
}

// ---------- What is asserted ----------

function computedDirection(element: Locator) {
  return element.evaluate((node) => getComputedStyle(node).direction)
}

/**
 * The authored text inside `container`: in its own `<bdi>`, resolved to `direction`, while the container itself
 * keeps LorEvolve's left to right. The text is exactly what was written - no mark, no copy.
 */
async function expectIsolated(container: Locator, text: string, direction: 'rtl' | 'ltr' = 'rtl') {
  const isolate = container.locator('bdi').filter({ hasText: text }).first()
  await expect(isolate).toHaveText(text)
  expect(await computedDirection(isolate), `"${text}" is not laid out in its own direction`).toBe(
    direction,
  )
  expect(await computedDirection(container), 'the element around the text changed direction').toBe(
    'ltr',
  )
}

/** The given words in the order the browser actually drew them, left to right. */
function drawnOrder(element: Locator, words: string[]) {
  return element.evaluate((node, wanted) => {
    const left = (word: string) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const at = (text.textContent ?? '').indexOf(word)
        if (at >= 0) {
          const range = document.createRange()
          range.setStart(text, at)
          range.setEnd(text, at + word.length)
          return range.getBoundingClientRect().left
        }
      }
      throw new Error(`"${word}" is not on the page`)
    }
    return [...wanted].sort((a, b) => left(a) - left(b))
  }, words)
}

/** Left edges of the given elements, in the order given. */
async function lefts(...elements: Locator[]) {
  return Promise.all(elements.map(async (element) => (await element.boundingBox())!.x))
}

function isIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1])
}

/** Nothing that belongs to LorEvolve has turned right to left: the document, and the named chrome. */
async function expectLorEvolveStaysLeftToRight(page: Page, chrome: Locator[]) {
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBeNull()
  expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('ltr')
  for (const element of chrome) {
    expect(await computedDirection(element)).toBe('ltr')
  }
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('text direction', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("an entry's name, type and aliases keep their own direction on every view, and its header keeps LorEvolve's", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Hearths '))
    const person = await seedType(page, universeId, 'شخصية')
    const akron = await seedEntity(page, universeId, Text.numbers, {
      typeId: person,
      aliases: [Text.arabic, 'رايت', Text.latinThenRtl],
    })
    const aaron = await seedEntity(page, universeId, Text.hebrew)
    await seedLink(page, universeId, await seedKind(page, universeId, 'والد', 'ابن'), akron, aaron)

    const url = `/app/universes/${universeId}/lore/${akron}`
    await page.goto(url)

    // ---- The name: laid out right to left, so the number and the Latin word land where they were written ----

    const name = page.getByTestId('entry-name')
    await expect(page.getByRole('heading', { level: 1, name: Text.numbers })).toBeVisible()
    await expectIsolated(name, Text.numbers)
    // Inherited left to right, this drew as "12 — آكرون / Wright": the number thrown to the far end.
    expect(await drawnOrder(name, ['آكرون', '12', 'Wright'])).toEqual(['Wright', '12', 'آكرون'])

    // The type is an author's word too.
    await expectIsolated(page.getByTestId('entry-type'), 'شخصية')

    // ---- Aliases: each one isolated, so two written right to left cannot run together and swap places ----

    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${akron}`)
    ).json()) as { aliases: string[] }
    const aliases = page.getByTestId('entry-aliases')
    await expect(aliases).toHaveText(`also known as ${stored.aliases.join(', ')}`)
    const each = aliases.locator('bdi')
    await expect(each).toHaveText(stored.aliases)
    expect(isIncreasing(await lefts(...(await each.all()))), 'the aliases are out of order').toBe(
      true,
    )

    // ---- The header keeps its layout: the name under its metadata, every control where it always is ----

    const header = page.locator('.entry__head')
    const status = page.getByRole('group', { name: 'Canon status' })
    const [headerBox, nameText, type, canon] = await Promise.all([
      header.boundingBox(),
      name.locator('bdi').boundingBox(),
      page.getByTestId('entry-type').boundingBox(),
      status.boundingBox(),
    ])
    expect(
      Math.abs(nameText!.x - headerBox!.x),
      'the name moved off the header start',
    ).toBeLessThan(1)
    // The Canon control still closes the type's row at the far end.
    expect(canon!.x).toBeGreaterThan(type!.x)
    expect(Math.abs(canon!.x + canon!.width - (headerBox!.x + headerBox!.width))).toBeLessThan(1)

    const views = ['entry-view-article', 'entry-view-relations', 'entry-view-history'].map((id) =>
      page.getByTestId(id),
    )
    const tools = ['edit-entity', 'entity-family-tree', 'entity-actions'].map((id) =>
      page.getByTestId(id),
    )
    expect(isIncreasing(await lefts(...views))).toBe(true)
    expect(isIncreasing(await lefts(...tools))).toBe(true)
    expect((await page.getByTestId('entry-views').boundingBox())!.y).toBeGreaterThan(
      nameText!.y + nameText!.height - 1,
    )
    await expectLorEvolveStaysLeftToRight(page, [
      page.locator('.entry__kind'),
      page.locator('.entry__crumbs'),
      status,
      page.getByTestId('entry-views'),
      page.locator('.entry__tools'),
    ])

    // ---- Relations and History are the same header, and name what they list the same way ----

    await page.getByTestId('entry-view-relations').click()
    await page.waitForURL(`${url}/relations`)
    await expectIsolated(page.getByTestId('entry-name'), Text.numbers)
    // The reading is said once, as the heading over the links it gathers.
    await expectIsolated(
      page.getByTestId('relationship-list').locator('.relations__reading').first(),
      'والد',
    )
    const relation = page.getByTestId('relationship-list').locator('li.relation').first()
    await expectIsolated(relation.locator('.relation__name'), Text.hebrew)

    await page.getByTestId('entry-view-history').click()
    await page.waitForURL(`${url}/history`)
    await expectIsolated(page.getByTestId('entry-name'), Text.numbers)
    await expectIsolated(
      page.getByTestId('history-list').locator('.version__meta').first(),
      Text.numbers,
    )

    // ---- The card in the lore grid, and the universe's search bar ----

    await page.goto(`/app/universes/${universeId}/lore`)
    await chooseLoreType(page, 'شخصية')
    const card = page.locator(`[data-testid="entity-card"][data-entity-name="${Text.numbers}"]`)
    await expectIsolated(card.locator('.entitycard__name'), Text.numbers)
    // The type's name is cut with an ellipsis, so the cutting element carries the direction - the
    // name reads right to left while the line holding its icon and the status does not turn.
    await expect(card.locator('.entitycard__typename')).toHaveText('شخصية')
    expect(await computedDirection(card.locator('.entitycard__typename'))).toBe('rtl')
    expect(await computedDirection(card.locator('.entitycard__meta'))).toBe('ltr')
    await expect(card.locator('.entitycard__aliases bdi')).toHaveText(stored.aliases)
    // The card's own rows are not reversed: the type before the status, the picture before the name.
    const [typeBox, statusBox] = await lefts(
      card.locator('.entitycard__type'),
      card.locator('.entitycard__status'),
    )
    expect(statusBox).toBeGreaterThan(typeBox)
    const [portraitBox, cardNameBox] = await lefts(
      card.locator('.tile'),
      card.locator('.entitycard__name'),
    )
    expect(cardNameBox).toBeGreaterThan(portraitBox)
    // The type's name in Lore's type row and in the header, each isolated.
    await expectIsolated(page.getByRole('heading', { level: 1 }), 'شخصية')
    await expectIsolated(
      page.locator('[data-testid="lore-type"][data-type-name="شخصية"] .typeswitch__name'),
      'شخصية',
    )

    const answered = page.waitForResponse(
      (response) =>
        response.url().includes('/search?') &&
        new URL(response.url()).searchParams.get('q') === 'אהרן',
    )
    await page.getByTestId('universe-search-input').fill('אהרן')
    await answered
    const title = page.getByTestId('universe-search-result').first().locator('.unisearch__title')
    await expect(title).toHaveText(Text.hebrew)
    expect(await computedDirection(title)).toBe('rtl')

    expect(await scrollsSideways(page)).toBe(false)
  })

  test("a story's title, chapters, scenes, arcs, beats and lore chips keep their own direction", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Long Winter '))
    const pov = await seedEntity(page, universeId, Text.arabic)
    const storyId = await seedStory(page, universeId, Text.numbers)
    const base = `/app/universes/${universeId}/stories/${storyId}`
    const chapter = await post(page, `/api/universes/${universeId}/stories/${storyId}/chapters`, {
      title: Text.brackets,
      summary: null,
      notes: null,
    })
    const scene = await post(page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
      title: Text.rtlThenLatin,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [pov],
      chapterId: chapter.id,
    })
    const arc = await post(page, `/api/universes/${universeId}/stories/${storyId}/plot-arcs`, {
      title: 'سقوط الملك 2',
      description: null,
      notes: null,
    })
    await post(page, `/api/universes/${universeId}/stories/${storyId}/plot-arcs/${arc.id}/beats`, {
      title: 'آكرون!',
      description: null,
      notes: null,
      sceneIds: [scene.id],
      entityIds: [],
    })

    // ---- The list of stories ----

    await page.goto(`/app/universes/${universeId}/stories`)
    const row = page.locator(`[data-testid="story-row"][data-title="${Text.numbers}"]`)
    await expectIsolated(row.locator('.storyrow__title'), Text.numbers)
    await expect(row.getByRole('link', { name: Text.numbers })).toBeVisible()

    // ---- The story's header and its Scenes view ----

    await page.goto(base)
    await expectIsolated(page.getByTestId('story-title'), Text.numbers)
    expect(await drawnOrder(page.getByTestId('story-title'), ['آكرون', '12', 'Wright'])).toEqual([
      'Wright',
      '12',
      'آكرون',
    ])

    // A chapter heading is LorEvolve's words and the author's: "Chapter 1: " stays first, the title isolated after it.
    const chapterHeading = page.getByTestId('chapter-heading')
    await expect(chapterHeading).toHaveAccessibleName(`Chapter 1: ${Text.brackets}`)
    await expectIsolated(chapterHeading, Text.brackets)
    const [numberLeft, titleLeft] = await lefts(
      chapterHeading.locator('.chapter__number'),
      chapterHeading.locator('bdi'),
    )
    expect(titleLeft).toBeGreaterThan(numberLeft)

    // A scene's heading starts with a visually hidden "Scene 1: ", which is why the title is isolated rather than
    // the heading given an automatic direction: the hidden words would decide it. The heading still says both.
    const sceneCard = page.locator(`[data-testid="scene"][data-title="${Text.rtlThenLatin}"]`)
    await expect(
      sceneCard.getByRole('heading', { name: `Scene 1: ${Text.rtlThenLatin}` }),
    ).toBeVisible()
    await expectIsolated(sceneCard.locator('.scene__title'), Text.rtlThenLatin)
    expect(await drawnOrder(sceneCard.locator('.scene__title'), ['آكرون', 'Wright'])).toEqual([
      'Wright',
      'آكرون',
    ])
    await expectIsolated(sceneCard.getByTestId('lore-reference'), Text.arabic)
    // The plot chip names an arc and a beat, each in its own direction, in LorEvolve's order: arc, then beat.
    const plotChip = sceneCard.getByTestId('scene-plot-beat')
    await expectIsolated(plotChip, 'سقوط الملك 2')
    await expectIsolated(plotChip, 'آكرون!')
    const [arcLeft, beatLeft] = await lefts(
      plotChip.locator('bdi').first(),
      plotChip.locator('bdi').last(),
    )
    expect(beatLeft).toBeGreaterThan(arcLeft)

    await expectLorEvolveStaysLeftToRight(page, [
      page.getByTestId('story-views'),
      page.locator('.story__bar'),
      sceneCard.locator('.scene__tools'),
    ])

    // ---- Plot, and Manuscript ----

    await page.getByTestId('story-view-plot').click()
    await page.waitForURL(`${base}/plot`)
    await expect(page.getByTestId('plot-arc-heading')).toHaveAccessibleName('Arc 1: سقوط الملك 2')
    await expectIsolated(page.getByTestId('plot-arc-heading'), 'سقوط الملك 2')
    const beat = page.locator('[data-testid="plot-beat"][data-title="آكرون!"]')
    await expectIsolated(beat.locator('.beat__title'), 'آكرون!')
    // Written "آكرون!", the mark ends the word - on its left - rather than dangling off the right of it.
    expect(await drawnOrder(beat.locator('.beat__title'), ['آكرون', '!'])).toEqual(['!', 'آكرون'])
    await expectIsolated(beat.getByTestId('plot-beat-scene'), Text.rtlThenLatin)

    await page.goto(`${base}/manuscript/${scene.id}`)
    await expectIsolated(page.getByTestId('manuscript-scene-title'), Text.rtlThenLatin)
    await expectIsolated(page.getByTestId('manuscript-outline-scene'), Text.rtlThenLatin)

    expect(await scrollsSideways(page)).toBe(false)
  })

  test('universes, the Trash, the timeline, types, world rules, ideas and the family tree name things the same way', async ({
    page,
  }) => {
    await signUp(page)
    const universeName = unique('ممالك آكرون ')
    const universeId = await seedUniverse(page, universeName)
    const base = `/app/universes/${universeId}`
    const person = await seedType(page, universeId, 'شخصية')
    const akron = await seedEntity(page, universeId, Text.rtlThenLatin, { typeId: person })
    const aaron = await seedEntity(page, universeId, Text.hebrew)
    const bore = await seedKind(page, universeId, 'أنجب', 'مولود لـ')
    await seedLink(page, universeId, bore, akron, aaron)
    const gone = await seedEntity(page, universeId, Text.brackets)
    expect((await page.request.delete(`/api/universes/${universeId}/entities/${gone}`)).ok()).toBe(
      true,
    )
    await post(page, `/api/universes/${universeId}/timeline`, {
      title: `معركة ${Text.numbers}`,
      description: null,
      canonStatus: Canon.canon,
      dateKind: 0,
      startYear: 12,
      startMonth: null,
      startDay: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      eraLabel: null,
      entityIds: [akron],
    })
    const rule = await post(page, `/api/universes/${universeId}/world-rules`, {
      title: 'لا يعبر النقل الآني الحجاب 3',
      description: '',
      expectedUpdatedAt: null,
    })
    await post(page, `/api/universes/${universeId}/validation-terms`, {
      kind: 0,
      name: 'تتويج (Coronation)',
    })
    const idea = await post(page, '/api/ideas', {
      title: `${Text.brackets} — مدينة عائمة`,
      body: '',
      universeId,
      references: [{ kind: 0, id: akron }],
      expectedUpdatedAt: null,
    })

    // ---- The universe: its card, the sidebar and the overview ----

    await page.goto('/app')
    await expectIsolated(
      page.locator(
        `[data-testid="universe-card"][data-universe-name="${universeName}"] .plate__name`,
      ),
      universeName,
    )
    await page.goto(base)
    await expectIsolated(page.getByTestId('workspace-name'), universeName)
    await expectIsolated(page.getByTestId('overview-name'), universeName)
    await expectLorEvolveStaysLeftToRight(page, [
      page.locator('.sidebar__nav'),
      page.locator('.rail'),
    ])

    // ---- The Trash: the name, isolated, over LorEvolve's word for the kind - both where a row's text starts ----

    await page.goto(`${base}/trash`)
    const trashed = page.getByTestId(`trash-row-${Text.brackets}`)
    await expectIsolated(trashed.locator('.trash__name'), Text.brackets)
    const [kindLeft, trashedLeft] = await lefts(
      trashed.getByTestId('trash-kind'),
      trashed.locator('.trash__name bdi'),
    )
    expect(Math.abs(trashedLeft - kindLeft)).toBeLessThan(2)
    await expect(
      trashed.getByRole('button', { name: `Restore entry “${Text.brackets}”` }),
    ).toBeVisible()

    // ---- The timeline: a moment's title, and who takes part ----

    await page.goto(`${base}/timeline`)
    const moment = page.locator(`[data-title="معركة ${Text.numbers}"]`)
    await expectIsolated(moment.locator('.moment__title'), `معركة ${Text.numbers}`)
    const player = moment.locator('.moment__player')
    await expectIsolated(player, Text.rtlThenLatin)
    // The type's icon is before the name, as it is for every name: the chip is not reversed.
    const [castIconLeft, playerLeft] = await lefts(
      player.locator('.lorechip__icon'),
      player.locator('bdi'),
    )
    expect(playerLeft).toBeGreaterThan(castIconLeft)

    // ---- Types: an entry type, a relation kind and an event kind, each beside its row's start ----

    await page.goto(`${base}/types`)
    const typeRow = page.locator('[data-type-name="شخصية"]')
    await expectIsolated(typeRow.locator('.types__name'), 'شخصية')
    const [iconLeft, typeNameLeft] = await lefts(
      typeRow.locator('.types__icon'),
      typeRow.locator('.types__name bdi'),
    )
    // Next to its icon, not pushed across the row to the count: the gap is the row's own, a few pixels.
    expect(typeNameLeft - iconLeft).toBeLessThan(60)
    await page.getByTestId('types-tab-relations').click()
    await expectIsolated(page.locator('[data-reltype-name="أنجب"] .types__name'), 'أنجب')
    await page.getByTestId('types-tab-events').click()
    await expectIsolated(
      page.locator('[data-term-name="تتويج (Coronation)"] .types__name'),
      'تتويج (Coronation)',
    )

    // ---- World rules: the list and the rule ----

    await page.goto(`${base}/world-rules`)
    await expectIsolated(page.getByTestId('world-rule-open'), 'لا يعبر النقل الآني الحجاب 3')
    await page.goto(`${base}/world-rules/${rule.id}`)
    await expectIsolated(page.getByTestId('world-rule-heading'), 'لا يعبر النقل الآني الحجاب 3')

    // ---- Ideas: the list, the idea and what it points at ----

    await page.goto(`${base}/ideas`)
    await expectIsolated(page.getByTestId('idea-open'), `${Text.brackets} — مدينة عائمة`)
    await page.goto(`${base}/ideas/${idea.id}`)
    await expectIsolated(page.getByTestId('idea-heading'), `${Text.brackets} — مدينة عائمة`)
    await expectIsolated(
      page.getByTestId('idea-reference').locator('.idearef__name'),
      Text.rtlThenLatin,
    )

    // ---- The family tree: the entry picked, and each relative's card ----

    await page.goto(`${base}/family-tree/${akron}`)
    await expectIsolated(page.locator('.picker__chosenname'), Text.rtlThenLatin)
    await expectIsolated(
      page.getByTestId(`family-node-${Text.hebrew}`).locator('.familynode__name'),
      Text.hebrew,
    )

    expect(await scrollsSideways(page)).toBe(false)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('long mixed titles wrap inside the column, nothing scrolls sideways, and the bars keep their order', async ({
      page,
    }) => {
      await signUp(page)
      const universeName = `${Text.arabic} ${unique('')}`
      const universeId = await seedUniverse(page, universeName)
      const akron = await seedEntity(page, universeId, Text.long)
      const storyId = await seedStory(page, universeId, Text.long)

      // ---- The entry ----

      await page.goto(`/app/universes/${universeId}/lore/${akron}`)
      const name = page.getByTestId('entry-name')
      await expectIsolated(name, Text.long)

      // Wrapped over several lines, every one of them inside the heading and the heading inside the screen.
      const lines = await name.locator('bdi').evaluate((node) => node.getClientRects().length)
      expect(lines).toBeGreaterThan(1)
      const heading = (await name.boundingBox())!
      const text = (await name.locator('bdi').boundingBox())!
      expect(text.x).toBeGreaterThanOrEqual(heading.x - 1)
      expect(text.x + text.width).toBeLessThanOrEqual(heading.x + heading.width + 1)
      expect(heading.x + heading.width).toBeLessThanOrEqual(390)
      expect(await scrollsSideways(page)).toBe(false)

      // The folded bar: the mark, the universe, Sections, the account - in that order, as ever.
      const [mark, where, toggle, account] = await lefts(
        page.locator('.rail__mark'),
        page.getByTestId('workspace-where'),
        page.getByTestId('workspace-nav-toggle'),
        page.getByTestId('account-menu-trigger'),
      )
      expect(isIncreasing([mark, where, toggle, account])).toBe(true)
      // Cut short if it must be, from its end: the universe's own direction decides which end that is.
      expect(await computedDirection(page.locator('.rail__universe'))).toBe('rtl')

      const views = ['entry-view-article', 'entry-view-relations', 'entry-view-history'].map((id) =>
        page.getByTestId(id),
      )
      expect(isIncreasing(await lefts(...views))).toBe(true)
      // The universe is private, so the entry offers no publication pill (Issue #47) and Edit leads the tools.
      await expect(page.getByTestId('entry-publication')).toHaveCount(0)
      const [edit, family] = await lefts(
        page.getByTestId('edit-entity'),
        page.getByTestId('entity-family-tree'),
      )
      expect(isIncreasing([edit, family])).toBe(true)
      // The first tool starts where the header starts, as on any entry: nothing was pushed to the other side.
      expect(Math.abs(edit - heading.x)).toBeLessThan(1)
      await expectLorEvolveStaysLeftToRight(page, [
        page.locator('.rail'),
        page.getByTestId('entry-views'),
        page.locator('.entry__tools'),
      ])

      // ---- The story ----

      await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
      const title = page.getByTestId('story-title')
      await expectIsolated(title, Text.long)
      expect(
        await title.locator('bdi').evaluate((node) => node.getClientRects().length),
      ).toBeGreaterThan(1)
      const [scenes, plot, manuscript] = await lefts(
        page.getByTestId('story-view-scenes'),
        page.getByTestId('story-view-plot'),
        page.getByTestId('story-view-manuscript'),
      )
      expect(isIncreasing([scenes, plot, manuscript])).toBe(true)
      // The story's menu ends the bar, after the views, however the title runs.
      const [lastView, storyMenu] = await lefts(
        page.getByTestId('story-view-manuscript'),
        page.getByTestId('story-actions'),
      )
      expect(storyMenu).toBeGreaterThan(lastView)
      expect(await scrollsSideways(page)).toBe(false)

      // ---- The lore grid ----

      await page.goto(
        `/app/universes/${universeId}/lore?type=${await characterTypeId(page, universeId)}`,
      )
      await expectIsolated(page.getByTestId('entity-card').locator('.entitycard__name'), Text.long)
      expect(await scrollsSideways(page)).toBe(false)
    })
  })

  test('a title field takes the direction of what is typed, keeps a usable caret, and saves it as typed', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Ink '))
    const akron = await seedEntity(page, universeId, 'Akron Wright')

    // ---- An entry's name ----

    await page.goto(`/app/universes/${universeId}/lore/${akron}`)
    await page.getByTestId('edit-entity').click()
    const field = page.getByLabel('Name', { exact: true })
    await expect(field).toHaveAttribute('dir', 'auto')
    expect(await computedDirection(field)).toBe('ltr')

    await field.fill('')
    await field.pressSequentially(Text.brackets)
    await expect(field).toHaveValue(Text.brackets)
    // The first letter typed is Arabic, so the field reads right to left from there on.
    expect(await computedDirection(field)).toBe('rtl')

    // The caret moves through the text logically, whichever way it is drawn.
    const caret = () => field.evaluate((input: HTMLInputElement) => input.selectionStart)
    expect(await caret()).toBe(Text.brackets.length)
    await field.press('Home')
    expect(await caret()).toBe(0)
    await field.press('End')
    expect(await caret()).toBe(Text.brackets.length)
    await field.press('Backspace')
    await expect(field).toHaveValue(Text.brackets.slice(0, -1))
    await field.press(')')
    await expect(field).toHaveValue(Text.brackets)

    // Labels and buttons around it stay where they were: the form is LorEvolve's, only the text is the author's.
    await expectLorEvolveStaysLeftToRight(page, [
      page.locator('.entry__kind'),
      page.locator('.entry__actions'),
    ])

    await page.getByTestId('save-entity').click()
    await expectIsolated(page.getByTestId('entry-name'), Text.brackets)
    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${akron}`)
    ).json()) as { name: string }
    expect(stored.name).toBe(Text.brackets)

    // Validation is what it was: an empty name is refused with the same words.
    await page.getByTestId('edit-entity').click()
    await field.fill('')
    await page.getByTestId('save-entity').click()
    await expect(page.locator('.entry__head .field__error')).toHaveText('Give it a name.')

    // ---- A story's title, through the drawer every story form shares ----

    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('new-story').click()
    const storyTitle = page.getByTestId('story-title-input')
    await expect(storyTitle).toHaveAttribute('dir', 'auto')
    await page.getByTestId('save-story').click()
    await expect(page.getByTestId('story-form')).toContainText('Give the story a title.')
    await storyTitle.pressSequentially(Text.numbers)
    expect(await computedDirection(storyTitle)).toBe('rtl')
    await page.getByTestId('save-story').click()
    await page.waitForURL(/\/stories\/[0-9a-f-]+$/)
    await expectIsolated(page.getByTestId('story-title'), Text.numbers)
  })
})

// ---------- Prose: summaries, descriptions, the article and the manuscript ----------

/**
 * Prose is laid out paragraph by paragraph: each one in the direction of its own first letter, and aligned to that
 * direction's start, while everything of LorEvolve's around it stays where it is. One direction for the whole block would
 * let the first paragraph decide for the rest, so an Arabic paragraph after an English one would still read left to
 * right - which is why these are several paragraphs, not one.
 */
const Prose = {
  arabic: 'آكرون رايت ذهب إلى المدينة.',
  hebrew: 'אהרן רייט הלך אל העיר.',
  mixed: 'آكرون — 12 / Wright قال: نعم!',
  latinThenRtl: 'Wright met آكرون في المدينة.',
  english: 'The northern gate remained closed.',
  year: 'آكرون قال: نعم! ثم عاد إلى المدينة عام 1204.',
  after: 'Wright remained outside.',
}

/** Whether an element lays its text out paragraph by paragraph, in each one's own direction. */
function isParagraphwise(element: Locator) {
  return element.evaluate((node) => getComputedStyle(node).unicodeBidi)
}

/** Which side of `element`'s content box the written `text` starts from: where its paragraph is aligned. */
function sideOf(element: Locator, text: string) {
  return element.evaluate((node, wanted) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      const at = (current.textContent ?? '').indexOf(wanted)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(current, at)
      range.setEnd(current, at + wanted.length)
      const drawn = range.getBoundingClientRect()
      const box = (node as Element).getBoundingClientRect()
      const style = getComputedStyle(node as Element)
      const left = box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)
      const right = box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth)
      if (Math.abs(drawn.left - left) < 2) return 'left'
      if (Math.abs(right - drawn.right) < 2) return 'right'
      return 'neither'
    }
    throw new Error(`"${wanted}" is not on the page`)
  }, text)
}

/**
 * Whether the written `text` ends at the right of `element`'s content box: where a right-to-left paragraph is aligned.
 * A block of prose is only as wide as its longest line, so the line that sets that width also starts at the left; this
 * asks only what a right-to-left paragraph must always do.
 */
function endsAtRight(element: Locator, text: string) {
  return element.evaluate((node, wanted) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      const at = (current.textContent ?? '').indexOf(wanted)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(current, at)
      range.setEnd(current, at + wanted.length)
      const style = getComputedStyle(node as Element)
      const right =
        (node as Element).getBoundingClientRect().right -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderRightWidth)
      return Math.abs(right - range.getBoundingClientRect().right) < 2
    }
    throw new Error(`"${wanted}" is not on the page`)
  }, text)
}

test.describe('authored prose direction', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("an entry's summary and article read paragraph by paragraph, are saved exactly as typed, and leave the header alone", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Gate '))
    const entityId = (
      await post(page, `/api/universes/${universeId}/entities`, {
        entityTypeId: await characterTypeId(page, universeId),
        name: 'Akron Wright',
        summary: Prose.mixed,
        canonStatus: Canon.canon,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
    await page.goto(`/app/universes/${universeId}/lore/${entityId}`)

    // ---- The summary: right to left, its number and Latin name where they were written, its mark at its end ----

    const summary = page.getByTestId('entry-summary')
    await expect(summary).toHaveText(Prose.mixed)
    expect(await isParagraphwise(summary)).toBe('plaintext')
    // Inherited left to right, the mark hung off the right and the number was thrown to the far end.
    expect(await drawnOrder(summary, ['!', 'قال', 'Wright', '12', 'آكرون'])).toEqual([
      '!',
      'قال',
      'Wright',
      '12',
      'آكرون',
    ])
    expect(await endsAtRight(summary, Prose.mixed)).toBe(true)
    // A short right-to-left summary sits where any summary sits - under the name, at the start of the column - not at
    // the far edge of its measure in the middle of the page.
    const [nameLeft, summaryLeft] = await lefts(page.getByRole('heading', { level: 1 }), summary)
    expect(Math.abs(summaryLeft - nameLeft)).toBeLessThan(2)
    await expectLorEvolveStaysLeftToRight(page, [
      page.locator('.entry__kind'),
      page.getByRole('group', { name: 'Canon status' }),
      page.getByTestId('entry-views'),
      page.locator('.entry__tools'),
    ])
    const [edit, family] = await lefts(
      page.getByTestId('edit-entity'),
      page.getByTestId('entity-family-tree'),
    )
    expect(family).toBeGreaterThan(edit)

    // ---- The article, written in the editor: English, Arabic, mixed, Hebrew, English ----

    await page.getByTestId('article-write').click()
    const editor = page.getByTestId('lore-editor')
    await expect(editor).toBeFocused()
    const typed = [Prose.english, Prose.year, Prose.mixed, Prose.hebrew, Prose.after]
    for (const [index, paragraph] of typed.entries()) {
      if (index > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(paragraph)
    }
    // While it is written, each paragraph already reads in its own direction.
    const writing = editor.locator('p')
    await expect(writing).toHaveText(typed)
    expect(await isParagraphwise(writing.nth(1))).toBe('plaintext')
    expect(await sideOf(writing.nth(0), Prose.english)).toBe('left')
    expect(await sideOf(writing.nth(1), Prose.year)).toBe('right')

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/article') &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ])
    await expect(page.getByTestId('article-status')).toHaveText('Saved')

    // Stored exactly as typed: no mark, no direction, nothing added to the document.
    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${entityId}/article`)
    ).json()) as { content: string }
    const saved = JSON.parse(stored.content) as {
      content: { type: string; attrs?: unknown; content: { text: string }[] }[]
    }
    expect(saved.content.map((block) => block.type)).toEqual(typed.map(() => 'paragraph'))
    expect(saved.content.map((block) => block.content[0].text)).toEqual(typed)
    expect(stored.content).not.toContain('"dir"')
    expect(stored.content).not.toMatch(/[‎‏‪-‮⁦-⁩]/)

    // ---- Read back after a reload ----

    await page.reload()
    const read = page.getByTestId('lore-article').locator('p')
    await expect(read).toHaveText(typed)
    expect(await sideOf(read.nth(0), Prose.english)).toBe('left')
    expect(await sideOf(read.nth(1), Prose.year)).toBe('right')
    expect(await sideOf(read.nth(2), Prose.mixed)).toBe('right')
    expect(await sideOf(read.nth(3), Prose.hebrew)).toBe('right')
    expect(await sideOf(read.nth(4), Prose.after)).toBe('left')
    // The full stop ends the Arabic sentence on its left, and the year is where it was written.
    expect(await drawnOrder(read.nth(1), ['.', '1204', 'آكرون'])).toEqual(['.', '1204', 'آكرون'])
    expect(await drawnOrder(read.nth(2), ['!', 'Wright', '12', 'آكرون'])).toEqual([
      '!',
      'Wright',
      '12',
      'آكرون',
    ])
    expect(await drawnOrder(read.nth(3), ['.', 'אהרן'])).toEqual(['.', 'אהרן'])
    expect(await scrollsSideways(page)).toBe(false)
  })

  test("an article's heading, marks, lists and quotes keep their formatting and each reads in its own direction", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Lists '))
    const entityId = await seedEntity(page, universeId, 'Akron Wright')
    const text = (value: string, marks?: { type: string }[]) => ({
      type: 'text',
      text: value,
      marks,
    })
    const paragraph = (...content: object[]) => ({ type: 'paragraph', content })
    const response = await page.request.put(
      `/api/universes/${universeId}/entities/${entityId}/article`,
      {
        data: {
          content: JSON.stringify({
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [text('البيت السابع 7')] },
              paragraph(text('آكرون '), text('(Wright)', [{ type: 'bold' }]), text(' عاد.')),
              {
                type: 'bulletList',
                content: [
                  { type: 'listItem', content: [paragraph(text(Prose.hebrew))] },
                  { type: 'listItem', content: [paragraph(text(Prose.latinThenRtl))] },
                ],
              },
              { type: 'blockquote', content: [paragraph(text(Prose.arabic))] },
            ],
          }),
          expectedVersion: 0,
        },
      },
    )
    expect(response.ok()).toBe(true)

    await page.goto(`/app/universes/${universeId}/lore/${entityId}`)
    const article = page.getByTestId('lore-article')
    await expect(article.locator('h2')).toHaveText('البيت السابع 7')
    expect(await sideOf(article.locator('h2'), 'البيت السابع 7')).toBe('right')
    await expect(article.locator('strong')).toHaveText('(Wright)')
    expect(await sideOf(article.locator('p').first(), 'آكرون')).toBe('right')

    const items = article.locator('li p')
    await expect(items).toHaveText([Prose.hebrew, Prose.latinThenRtl])
    expect(await sideOf(items.nth(0), Prose.hebrew)).toBe('right')
    expect(await sideOf(items.nth(1), Prose.latinThenRtl)).toBe('left')
    const quote = article.locator('blockquote p')
    expect(await sideOf(quote, Prose.arabic)).toBe('right')
    expect(await drawnOrder(quote, ['.', 'آكرون'])).toEqual(['.', 'آكرون'])

    // The list and the quote are LorEvolve's blocks: they stay inside the column and do not turn around.
    expect(await computedDirection(article.locator('ul'))).toBe('ltr')
    expect(await computedDirection(article.locator('blockquote'))).toBe('ltr')
    const column = (await article.boundingBox())!
    for (const block of [article.locator('ul'), article.locator('blockquote')]) {
      const box = (await block.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(column.x - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width + 1)
    }
  })

  test("the manuscript reads paragraph by paragraph while written, saves exactly, and its heading keeps LorEvolve's words in order", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Tide '))
    const storyId = await seedStory(page, universeId, 'The Gate')
    const chapter = await post(page, `/api/universes/${universeId}/stories/${storyId}/chapters`, {
      title: 'آكرون (Wright)',
      summary: null,
      notes: null,
    })
    const scene = (title: string) =>
      post(page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
        title,
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId: chapter.id,
      })
    const first = await scene('Night')
    await scene('Morning')
    await page.goto(`/app/universes/${universeId}/stories/${storyId}/manuscript/${first.id}`)

    // ---- "Chapter 1: … · Scene 1 of 2": LorEvolve's words first and last, the author's title isolated between ----

    const where = page.getByTestId('manuscript-where')
    await expect(where).toHaveText('Chapter 1: آكرون (Wright) · Scene 1 of 2')
    await expectIsolated(where, 'آكرون (Wright)')
    // Left in one run with the words around it, the title's bracket went to the wrong side of its Latin name.
    expect(await drawnOrder(where, ['Chapter', 'Wright', 'آكرون', 'Scene'])).toEqual([
      'Chapter',
      'Wright',
      'آكرون',
      'Scene',
    ])
    const outline = page.getByTestId('manuscript-outline-heading')
    await expectIsolated(outline, 'آكرون (Wright)')
    expect(await drawnOrder(outline, ['Chapter', 'Wright', 'آكرون'])).toEqual([
      'Chapter',
      'Wright',
      'آكرون',
    ])

    // ---- The text: typed, saved from the keyboard, read back exactly ----

    const editor = page.getByTestId('manuscript-editor')
    // Each line of the editor is a paragraph of its own, laid out by its own first letter.
    expect(await isParagraphwise(editor.locator('p').first())).toBe('plaintext')
    expect(await computedDirection(editor)).toBe('ltr')
    const prose = [Prose.english, Prose.year, Prose.after, Prose.hebrew].join('\n\n')
    await editor.click()
    await page.keyboard.type(prose)
    await expectWritten(editor, prose)

    // The caret still moves through the text logically.
    await page.keyboard.press('ControlOrMeta+Home')
    await expect.poll(() => writtenSelection(editor)).toEqual([0, 0])
    await page.keyboard.press('ControlOrMeta+End')
    await expect.poll(() => writtenSelection(editor)).toEqual([prose.length, prose.length])

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/manuscript') &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ])
    await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')
    const stored = (await (
      await page.request.get(
        `/api/universes/${universeId}/stories/${storyId}/scenes/${first.id}/manuscript`,
      )
    ).json()) as { content: string }
    expect(stored.content).toBe(prose)

    await page.reload()
    await expectWritten(page.getByTestId('manuscript-editor'), prose)
    await expectLorEvolveStaysLeftToRight(page, [
      page.getByTestId('story-views'),
      page.locator('.manuscript__tools'),
      page.locator('.manuscript__bar'),
    ])
    expect(await scrollsSideways(page)).toBe(false)
  })

  test("a sentence of LorEvolve's that names something keeps its words in order around the name", async ({
    page,
  }) => {
    await signUp(page)
    const name = 'آكرون (Wright)'
    const universeId = await seedUniverse(page, name)
    const idea = await post(page, '/api/ideas', {
      title: 'مدينة عائمة',
      body: [Prose.english, Prose.year].join('\n'),
      universeId,
      references: [],
      expectedUpdatedAt: null,
    })

    // ---- "Ideas in “…”": the way back from an idea ----

    await page.goto(`/app/universes/${universeId}/ideas/${idea.id}`)
    const back = page.getByTestId('idea-back')
    await expect(back).toHaveText(`Ideas in “${name}”`)
    await expectIsolated(back, name)
    expect(await drawnOrder(back, ['Ideas', 'Wright', 'آكرون'])).toEqual([
      'Ideas',
      'Wright',
      'آكرون',
    ])
    // Its body is a field of prose like any other.
    expect(await isParagraphwise(page.getByLabel('Body'))).toBe('plaintext')

    // ---- The list's lede says the same ----

    await page.goto(`/app/universes/${universeId}/ideas`)
    const lede = page.locator('.ideas__lede')
    await expectIsolated(lede, name)
    expect(await drawnOrder(lede, ['Your', 'Wright', 'آكرون', 'nothing'])).toEqual([
      'Your',
      'Wright',
      'آكرون',
      'nothing',
    ])
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test("a story's premise and a scene's summary read paragraph by paragraph and wrap inside the column", async ({
      page,
    }) => {
      await signUp(page)
      const universeId = await seedUniverse(page, unique('Shore '))
      const premise = [Prose.english, Prose.year, Prose.after].join('\n')
      const storyId = (
        await post(page, `/api/universes/${universeId}/stories`, {
          title: 'The Gate',
          premise,
          status: 0,
        })
      ).id
      await post(page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
        title: 'Night',
        summary: `${Text.long} ${Prose.mixed}`,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId: null,
      })

      await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
      const shown = page.getByTestId('story-premise')
      await expect(shown).toHaveText(premise)
      expect(await sideOf(shown, Prose.english)).toBe('left')
      expect(await endsAtRight(shown, Prose.year)).toBe(true)
      expect(await sideOf(shown, Prose.after)).toBe('left')

      const summary = page.locator('.scene__summary')
      expect(await isParagraphwise(summary)).toBe('plaintext')
      expect(await summary.evaluate((node) => node.getClientRects().length)).toBeGreaterThan(0)
      expect(await sideOf(summary, 'آكرون رايت')).toBe('right')
      const box = (await summary.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(390)
      expect(await scrollsSideways(page)).toBe(false)

      // The story's own controls are where they always are.
      const [scenes, plot, manuscript] = await lefts(
        page.getByTestId('story-view-scenes'),
        page.getByTestId('story-view-plot'),
        page.getByTestId('story-view-manuscript'),
      )
      expect(isIncreasing([scenes, plot, manuscript])).toBe(true)
    })
  })
})
