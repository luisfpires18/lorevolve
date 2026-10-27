import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Refinement 038: one world timeline (ADR 0009 amendment). Moments written on the timeline, every dated scene and every
 * birth and death year, in the order they happen in the world - whatever order the story tells them in. A scene and an
 * entry are read from where they live and opened there; only a moment is edited here. A story's timeline is the same page
 * narrowed by `?story=`: its dated scenes and the moments linked to it.
 *
 * Each test registers its own account with a throwaway password and builds its world through the API.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('chron')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true)
  return (await response.json()) as { id: string; fields?: { id: string; name: string }[] }
}

interface World {
  u: string
  kingdom: string
  ashes: string
  coronation: string
  aftermath: string
  beat: string
  akron: string
}

/**
 * Two stories. The Last Kingdom tells the Coronation (114) before the Aftermath (100), and has an undated scene; Ashes has
 * Embers (120). Akron Wright is born in 113 and has a Gregorian "Founded" date; Old Mira dies in 118. Fall of Armath (115)
 * is the universe's own; The Accord (116) is linked to The Last Kingdom.
 */
async function buildWorld(page: Page): Promise<World> {
  const u = (
    await post(page, '/api/universes', {
      name: unique('Velmoor '),
      description: null,
      accentColor: null,
    })
  ).id
  const stories = `/api/universes/${u}/stories`
  const kingdom = (
    await post(page, stories, { title: 'The Last Kingdom', premise: null, status: 1 })
  ).id
  const ashes = (await post(page, stories, { title: 'Ashes', premise: null, status: 1 })).id
  const chapter = (
    await post(page, `${stories}/${kingdom}/chapters`, {
      title: 'Crowns',
      summary: null,
      notes: null,
    })
  ).id

  const scene = (
    story: string,
    title: string,
    year: number | null,
    month: number | null = null,
    day: number | null = null,
    chapterId: string | null = null,
  ) =>
    post(page, `${stories}/${story}/scenes`, {
      title,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: year === null ? null : { eraId: null, year, month, day },
      entityIds: [],
      chapterId,
    })

  const coronation = (await scene(kingdom, 'Coronation', 114, 3, 12, chapter)).id
  const aftermath = (await scene(kingdom, 'Aftermath', 100)).id
  await scene(kingdom, 'Undated scene', null)
  await scene(ashes, 'Embers', 120)

  const arc = (
    await post(page, `${stories}/${kingdom}/plot-arcs`, {
      title: 'The crown',
      description: null,
      notes: null,
    })
  ).id
  const beat = (
    await post(page, `${stories}/${kingdom}/plot-arcs/${arc}/beats`, {
      title: 'The crown changes hands',
      description: null,
      notes: null,
      sceneIds: [coronation],
      entityIds: [],
    })
  ).id

  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const field = async (name: string, kind: number, semantic: number | null) => {
    const type = await post(page, `/api/universes/${u}/entity-types/${character}/fields`, {
      name,
      kind,
      isRequired: false,
      displayOrder: null,
      defaultValue: null,
      options: null,
      semantic,
    })
    return type.fields!.find((one) => one.name === name)!.id
  }
  const born = await field('Born', 2, 1)
  const died = await field('Died', 2, 2)
  const founded = await field('Founded', 4, null)

  const value = (fieldDefinitionId: string, number: number | null, date: string | null = null) => ({
    fieldDefinitionId,
    text: null,
    number,
    boolean: null,
    date,
    optionIds: null,
    referencedEntityId: null,
    eraId: null,
  })
  const person = (name: string, fields: unknown[]) =>
    post(page, `/api/universes/${u}/entities`, {
      entityTypeId: character,
      name,
      summary: null,
      canonStatus: 1,
      aliases: [],
      tags: [],
      fields,
    })
  const akron = (
    await person('Akron Wright', [value(born, 113), value(founded, null, '2020-06-01T00:00:00Z')])
  ).id
  await person('Old Mira', [value(died, 118)])

  const moment = (title: string, year: number, storyIds: string[]) =>
    post(page, `/api/universes/${u}/timeline`, {
      title,
      description: null,
      canonStatus: 2,
      dateKind: 0,
      startYear: year,
      startMonth: null,
      startDay: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      eraLabel: null,
      entityIds: [],
      storyIds,
    })
  await moment('Fall of Armath', 115, [])
  await moment('The Accord', 116, [kingdom])

  return { u, kingdom, ashes, coronation, aftermath, beat, akron }
}

function items(page: Page) {
  return page.getByTestId('timeline-item')
}

function item(page: Page, title: string) {
  return page.locator(`[data-testid="timeline-item"][data-title="${title}"]`)
}

/** The rows' titles in order, waited for: a filter's answer replaces the page after the address changes. */
async function expectTitles(page: Page, expected: string[]) {
  await expect
    .poll(() =>
      items(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-title'))),
    )
    .toEqual(expected)
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

test.describe('unified timeline', () => {
  test('moments, scenes and lifespans read as one world order, each opened where it lives', async ({
    page,
  }) => {
    await signUp(page)
    const w = await buildWorld(page)
    const timeline = `/app/universes/${w.u}/timeline`

    await page.goto(timeline)
    await expectTitles(page, [
      'Aftermath',
      'Akron Wright',
      'Coronation',
      'Fall of Armath',
      'The Accord',
      'Old Mira',
      'Embers',
    ])

    // Each says what it is, in words; the undated scene and the Gregorian date field are not here.
    await expect(item(page, 'Aftermath').getByTestId('timeline-source')).toHaveText('Scene')
    await expect(item(page, 'Akron Wright').getByTestId('timeline-source')).toHaveText('Lore')
    await expect(item(page, 'Fall of Armath').getByTestId('timeline-source')).toHaveText('Moment')
    await expect(item(page, 'Akron Wright')).toContainText('Akron Wright is born.')
    await expect(item(page, 'Old Mira')).toContainText('Old Mira dies.')
    await expect(item(page, 'Undated scene')).toHaveCount(0)
    await expect(items(page)).toHaveCount(7)
    await expect(item(page, 'Coronation')).toContainText('In The Last Kingdom · Chapter 1: Crowns')
    await expect(item(page, 'The Accord').getByTestId('moment-stories-The Accord')).toContainText(
      'Story: The Last Kingdom',
    )

    // A moment is edited here; a scene offers no edit of its own, only the ways to it.
    await expect(page.getByTestId('moment-actions-Fall of Armath')).toBeVisible()
    const coronation = item(page, 'Coronation')
    await expect(coronation.getByRole('button')).toHaveCount(0)
    await expect(item(page, 'Akron Wright').getByRole('button')).toHaveCount(0)

    await page.getByTestId('edit-moment-Fall of Armath').click()
    await expect(page.getByTestId('moment-title')).toHaveValue('Fall of Armath')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    // The ways out: the scene, its manuscript, its plot beat, and the entry.
    await coronation.getByTestId('timeline-open-scene').click()
    await page.waitForURL(`**/stories/${w.kingdom}#scene-${w.coronation}`)
    await expect(page.locator(`#scene-${w.coronation}`)).toBeVisible()
    await page.goBack()

    await item(page, 'Coronation').getByTestId('timeline-open-manuscript').click()
    await page.waitForURL(`**/stories/${w.kingdom}/manuscript/${w.coronation}`)
    await expect(page.getByTestId('manuscript-editor')).toBeVisible()
    await page.goBack()

    await item(page, 'Coronation').getByTestId('timeline-open-plot').click()
    await page.waitForURL(`**/stories/${w.kingdom}/plot#beat-${w.beat}`)
    await expect(page.locator(`#beat-${w.beat}`)).toBeVisible()
    await page.goBack()

    await expect(item(page, 'Aftermath').getByTestId('timeline-open-plot')).toHaveCount(0)
    await item(page, 'Akron Wright').getByTestId('timeline-open-lore').click()
    await page.waitForURL(`**/lore/${w.akron}`)
  })

  test('a story’s timeline is the world timeline narrowed in the address, and Back returns to the story', async ({
    page,
  }) => {
    await signUp(page)
    const w = await buildWorld(page)
    const storyPath = `/app/universes/${w.u}/stories/${w.kingdom}`

    await page.goto(`${storyPath}/plot`)
    await page.getByTestId('story-actions').click()
    await page.getByTestId('menu-story-timeline').click()
    await page.waitForURL(`**/timeline?story=${w.kingdom}`)

    await expectTitles(page, ['Aftermath', 'Coronation', 'The Accord'])
    await expect(page.getByTestId('chron-story')).toHaveValue(w.kingdom)
    await expect(page.getByTestId('chron-story-scope')).toContainText('The Last Kingdom')

    await page.reload()
    await expectTitles(page, ['Aftermath', 'Coronation', 'The Accord'])

    await page.goBack()
    await page.waitForURL(`**${storyPath}/plot`)

    await page.goForward()
    await page.waitForURL(`**/timeline?story=${w.kingdom}`)
    await page.getByTestId('chron-source').selectOption('moments')
    await expect(page).toHaveURL(new RegExp(`story=${w.kingdom}&source=moments`))
    await expectTitles(page, ['The Accord'])

    await page.getByTestId('chron-source').selectOption('lore')
    await expect(page.getByTestId('chron-empty')).toContainText(
      'Nothing in this story has a date yet.',
    )

    // From the facts line on Scenes, too.
    await page.goto(storyPath)
    await page.getByTestId('story-timeline').click()
    await page.waitForURL(`**/timeline?story=${w.kingdom}`)
    await page.getByTestId('chron-story').selectOption({ label: 'Ashes' })
    await expectTitles(page, ['Embers'])
  })

  test('editing a scene or an entry moves its item, and the page only ever reads', async ({
    page,
  }) => {
    await signUp(page)
    const w = await buildWorld(page)
    const writes: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.includes('/timeline') && request.method() !== 'GET')
        writes.push(`${request.method()} ${path}`)
    })

    // The Aftermath, rewritten to happen after everything else.
    const scene = await page.request.put(
      `/api/universes/${w.u}/stories/${w.kingdom}/scenes/${w.aftermath}`,
      {
        data: {
          title: 'Aftermath',
          summary: null,
          notes: null,
          povEntityId: null,
          chronology: { eraId: null, year: 130, month: null, day: null },
          entityIds: [],
          chapterId: null,
          expectedVersion: (
            (await (
              await page.request.get(
                `/api/universes/${w.u}/stories/${w.kingdom}/scenes/${w.aftermath}`,
              )
            ).json()) as { version: number }
          ).version,
        },
      },
    )
    expect(scene.ok()).toBe(true)

    await page.goto(`/app/universes/${w.u}/timeline`)
    await expect(items(page).last()).toHaveAttribute('data-title', 'Aftermath')

    // Akron's birth year moved, then removed, on the entry itself.
    const entity = (await (
      await page.request.get(`/api/universes/${w.u}/entities/${w.akron}`)
    ).json()) as {
      entityTypeId: string
      fields: { fieldDefinitionId: string; name: string }[]
    }
    const born = entity.fields.find((one) => one.name === 'Born')!.fieldDefinitionId
    const akron = `/api/universes/${w.u}/entities/${w.akron}`
    const save = async (fields: unknown[]) =>
      page.request.put(akron, {
        data: {
          expectedVersion: ((await (await page.request.get(akron)).json()) as { version: number })
            .version,
          entityTypeId: entity.entityTypeId,
          name: 'Akron Wright',
          summary: null,
          canonStatus: 1,
          aliases: [],
          tags: [],
          fields,
        },
      })
    const year = (number: number) => ({
      fieldDefinitionId: born,
      text: null,
      number,
      boolean: null,
      date: null,
      optionIds: null,
      referencedEntityId: null,
      eraId: null,
    })

    expect((await save([year(99)])).ok()).toBe(true)
    await page.reload()
    await expect(items(page).first()).toHaveAttribute('data-title', 'Akron Wright')

    expect((await save([])).ok()).toBe(true)
    await page.reload()
    await expect(item(page, 'Akron Wright')).toHaveCount(0)
    await expect(item(page, 'Old Mira')).toHaveCount(1)

    expect(writes).toEqual([])
  })

  test('a moment’s stories are chosen in its editor, and each story’s timeline follows them', async ({
    page,
  }) => {
    await signUp(page)
    const w = await buildWorld(page)
    const timeline = `/app/universes/${w.u}/timeline`

    await page.goto(`${timeline}?story=${w.kingdom}`)
    // A moment started from a story's timeline starts linked to it.
    await page.getByTestId('new-moment').click()
    await expect(page.getByTestId('moment-story')).toHaveCount(1)
    await expect(page.getByTestId('moment-story')).toContainText('The Last Kingdom')
    await page.getByTestId('moment-title').fill('The siege')
    await page.getByTestId('moment-startYear').fill('117')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expectTitles(page, ['Aftermath', 'Coronation', 'The Accord', 'The siege'])

    // Also Ashes.
    await page.getByTestId('edit-moment-The siege').click()
    await page.getByTestId('moment-story-add').selectOption({ label: 'Ashes' })
    await expect(page.getByTestId('moment-story')).toHaveCount(2)
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    await page.goto(`${timeline}?story=${w.ashes}`)
    await expectTitles(page, ['The siege', 'Embers'])

    // No longer The Last Kingdom's: gone from its timeline, still on the world's.
    await page.getByTestId('edit-moment-The siege').click()
    await page.getByTestId('moment-story-remove-The Last Kingdom').click()
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    await page.goto(`${timeline}?story=${w.kingdom}`)
    await expectTitles(page, ['Aftermath', 'Coronation', 'The Accord'])
    await page.goto(timeline)
    await expect(item(page, 'The siege')).toHaveCount(1)
  })

  for (const width of [390, 360]) {
    test(`filters, rows and a moment's stories fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const w = await buildWorld(page)

      await page.goto(`/app/universes/${w.u}/timeline?story=${w.kingdom}`)
      await expect(items(page)).toHaveCount(3)
      await expectNoSidewaysScroll(page, 'story timeline')
      for (const id of ['chron-search', 'chron-story', 'chron-source', 'chron-canon']) {
        const box = (await page.getByTestId(id).boundingBox())!
        expect(box.x + box.width, `${id} runs off the side`).toBeLessThanOrEqual(width)
      }

      await page.goto(`/app/universes/${w.u}/timeline`)
      await expect(items(page)).toHaveCount(7)
      await expectNoSidewaysScroll(page, 'world timeline')

      await page.getByTestId('edit-moment-The Accord').click()
      await expect(page.getByTestId('moment-story-add')).toBeVisible()
      await expectNoSidewaysScroll(page, 'moment editor')
    })
  }
})
