import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * A universe's own chronology, end to end. Each test registers its own account and builds its
 * own universe, so nothing depends on data another test left behind.
 *
 * The invariant under test throughout: the order comes from the date periods the author configured -
 * their order and which way their years run - and every date on screen is written the way that
 * configuration says, never assembled by hand and never sorted as text. Authors see "date periods";
 * the API, and so these helpers and test ids, still say era (ADR 0022, amended by refinement 018).
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors the API enums. */
const Direction = { up: 0, down: 1 } as const
const Position = { before: 0, after: 1 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('reckoner')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** Creates a universe through the UI and returns the id it was given. */
async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

interface EraSeed {
  name: string
  abbreviation: string | null
  direction: keyof typeof Direction
  position?: keyof typeof Position
}

/** Names the eras straight through the API, for tests that are about using them. */
async function seedEras(page: Page, universeId: string, eras: EraSeed[]) {
  const response = await page.request.put(`/api/universes/${universeId}/chronology`, {
    data: {
      eras: eras.map((era) => ({
        id: null,
        name: era.name,
        abbreviation: era.abbreviation,
        direction: Direction[era.direction],
        labelPosition: Position[era.position ?? 'before'],
      })),
    },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).eras as { id: string; name: string }[]
}

/** Fills one date period card on the Chronology screen. */
async function fillEra(page: Page, index: number, era: Partial<EraSeed> & { name: string }) {
  const card = page.getByTestId('era').nth(index)
  await card.getByTestId('era-name').fill(era.name)
  if (era.abbreviation !== undefined) {
    await card.getByTestId('era-abbreviation').fill(era.abbreviation ?? '')
  }
  if (era.direction) {
    await card.getByTestId(`era-direction-${era.direction}`).click()
  }
  if (era.position) {
    await card.getByTestId(`era-position-${era.position}`).click()
  }
}

interface MomentInput {
  title: string
  kind?: 'exact' | 'range'
  era: string
  year: string
  month?: string
  endEra?: string
  endYear?: string
}

/** Writes one moment through the drawer, choosing each year's era the way an author would. */
async function addMoment(page: Page, input: MomentInput) {
  await page.getByTestId('new-moment').click()
  await expect(page.getByTestId('moment-form')).toBeVisible()

  await page.getByTestId('moment-title').fill(input.title)
  await page.getByTestId(`moment-kind-${input.kind ?? 'exact'}`).click()
  await page.getByTestId('moment-startEraId').selectOption({ label: input.era })
  await page.getByTestId('moment-startYear').fill(input.year)
  if (input.month) await page.getByTestId('moment-startMonth').fill(input.month)

  if (input.endEra && input.endYear) {
    await page.getByTestId('moment-endEraId').selectOption({ label: input.endEra })
    await page.getByTestId('moment-endYear').fill(input.endYear)
  }

  await page.getByTestId('save-moment').click()
  await expect(page.getByTestId('moment-form')).toHaveCount(0)
}

function moment(page: Page, title: string) {
  return page.locator(`[data-title="${title}"]`)
}

/** The titles on the spine, in the order the API put them. */
function momentOrder(page: Page) {
  return page
    .getByTestId('chron-stream')
    .locator('.moment')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title') ?? ''))
}

/** The years standing in the margin, in order. */
function yearHeadings(page: Page) {
  return page
    .getByTestId('chron-stream')
    .locator('.chron__yearnum')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('chronology', () => {
  test('date periods are named and ordered in Chronology, and every timeline date is written and ordered by them', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Fallen Reach '))

    await page.getByTestId('workspace-chronology').click()
    await page.waitForURL(/\/chronology$/)

    const settings = page.getByTestId('chronology-settings')
    await expect(settings).toContainText('This universe uses plain numbered years.')

    // Written in the wrong order on purpose, then put right.
    await page.getByTestId('add-era').click()
    await fillEra(page, 0, { name: 'After the Fall', abbreviation: 'AF' })
    await page.getByTestId('add-era').click()
    await fillEra(page, 1, { name: 'Before the Fall', abbreviation: 'BF', direction: 'down' })
    await page.getByTestId('era').nth(1).getByTestId('era-earlier').click()
    await expect(page.getByTestId('era').nth(0).getByTestId('era-name')).toHaveValue(
      'Before the Fall',
    )

    // The order line is the configuration's meaning, before anything is saved - names, never a range.
    await expect(page.getByTestId('era-order').locator('li')).toHaveText([
      'Before the Fall',
      'After the Fall',
    ])
    await expect(page.getByTestId('era-preview')).toHaveCount(0)

    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')

    // The timeline now asks for a date period beside every year.
    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(/\/timeline$/)

    await addMoment(page, { title: 'The rebuilding', era: 'After the Fall (AF)', year: '10' })
    await addMoment(page, { title: 'The last harvest', era: 'Before the Fall (BF)', year: '1' })
    await addMoment(page, { title: 'The first tower', era: 'Before the Fall (BF)', year: '120' })
    await addMoment(page, { title: 'The fall', era: 'After the Fall (AF)', year: '1', month: '3' })
    await addMoment(page, {
      title: 'The long war',
      kind: 'range',
      era: 'Before the Fall (BF)',
      year: '5',
      endEra: 'After the Fall (AF)',
      endYear: '2',
    })

    // Counting down, then up: BF 120 is the earliest year here and AF 10 the latest.
    await expect
      .poll(() => momentOrder(page))
      .toEqual([
        'The first tower',
        'The long war',
        'The last harvest',
        'The fall',
        'The rebuilding',
      ])
    await expect.poll(() => yearHeadings(page)).toEqual(['BF 120', 'BF 5', 'BF 1', 'AF 1', 'AF 10'])

    await expect(moment(page, 'The fall').locator('.moment__when')).toHaveText('AF 1.03')
    await expect(moment(page, 'The long war').locator('.moment__when')).toHaveText('BF 5 – AF 2')
    await expect(page.getByTestId('chron-stream').locator('.chron__era').first()).toHaveText(
      'Before the Fall',
    )

    // Date periods are ordered, so there is nothing to caution about.
    await expect(page.getByTestId('chron-eras')).toHaveCount(0)

    // A year with no date period is not a date on this universe's line.
    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-title').fill('Somewhen')
    await page.getByTestId('moment-startYear').fill('4')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toContainText(
      'Choose the date period this year is counted in.',
    )
    await page.getByTestId('cancel-moment').click()
    await acceptConfirm(page)
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    // Relabelling a date period rewords every date written in it and moves none of them.
    await page.getByTestId('workspace-chronology').click()
    await page.waitForURL(/\/chronology$/)

    const before = page.getByTestId('era').nth(0)
    await expect(before).toContainText('Dates 3 moments')
    await expect(before.getByTestId('era-remove')).toBeDisabled()
    await fillEra(page, 0, { name: 'Before the Fall', abbreviation: 'B.F.', position: 'after' })
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')

    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(/\/timeline$/)
    await expect
      .poll(() => yearHeadings(page))
      .toEqual(['120 B.F.', '5 B.F.', '1 B.F.', 'AF 1', 'AF 10'])
    await expect
      .poll(() => momentOrder(page))
      .toEqual([
        'The first tower',
        'The long war',
        'The last harvest',
        'The fall',
        'The rebuilding',
      ])

    await page.reload()
    await expect
      .poll(() => yearHeadings(page))
      .toEqual(['120 B.F.', '5 B.F.', '1 B.F.', 'AF 1', 'AF 10'])
  })

  test('a birth year is written in a date period and read back the way the universe writes it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Birth Reach '))
    const eras = await seedEras(page, universeId, [
      { name: 'Before the Fall', abbreviation: 'BF', direction: 'down' },
      { name: 'After the Fall', abbreviation: 'AF', direction: 'up' },
    ])

    const types = (await (
      await page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const character = types.find((type) => type.name === 'Character')!

    const withField = await page.request.post(
      `/api/universes/${universeId}/entity-types/${character.id}/fields`,
      {
        data: {
          name: 'Born',
          kind: 2,
          isRequired: false,
          displayOrder: null,
          defaultValue: null,
          options: null,
          semantic: 1,
        },
      },
    )
    expect(withField.status()).toBe(200)
    const born = ((await withField.json()).fields as { id: string; name: string }[]).find(
      (field) => field.name === 'Born',
    )!

    const created = await page.request.post(`/api/universes/${universeId}/entities`, {
      data: {
        entityTypeId: character.id,
        name: 'Aranel',
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [
          {
            fieldDefinitionId: born.id,
            text: null,
            number: 5,
            boolean: null,
            date: null,
            optionIds: null,
            referencedEntityId: null,
            eraId: eras[0].id,
          },
        ],
      },
    })
    expect(created.status()).toBe(201)
    const entityId = (await created.json()).id as string

    await page.goto(`/app/universes/${universeId}/lore/${entityId}`)
    await expect(page.getByTestId('entry-fields')).toContainText('BF 5')

    // Moved into the other date period through the form.
    await page.getByTestId('edit-entity').click()
    await expect(page.getByLabel('Born: date period')).toHaveValue(eras[0].id)
    await page.getByLabel('Born: date period').selectOption({ label: 'After the Fall (AF)' })
    await page.getByLabel('Born', { exact: true }).fill('7')
    await page.getByTestId('save-entity').click()

    await expect(page.getByTestId('entry-fields')).toContainText('AF 7')
  })

  test('the chronology settings and the date period row stay usable from a phone to a wide desktop', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Reach '))
    await seedEras(page, universeId, [
      { name: 'The Long Dark Before Anything Was Named', abbreviation: null, direction: 'down' },
      { name: 'The Dawn', abbreviation: 'D', direction: 'up' },
      { name: 'The Age of Towers', abbreviation: 'AT', direction: 'up', position: 'after' },
      { name: 'The Return', abbreviation: 'R', direction: 'up' },
    ])

    for (const width of [390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })

      await page.goto(`/app/universes/${universeId}/chronology`)
      await expect(page.getByTestId('era')).toHaveCount(4)

      // Every period's controls are on screen and reachable, not pushed off the right-hand edge.
      const last = page.getByTestId('era').nth(3)
      await last.scrollIntoViewIfNeeded()
      for (const control of [
        'era-name',
        'era-direction-down',
        'era-position-after',
        'era-later',
        'era-remove',
      ]) {
        const box = await last.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(width)
      }
      expect(await scrollsSideways(page), `settings at ${width}px`).toBe(false)

      // The drawer's date period row folds rather than running wide.
      await page.goto(`/app/universes/${universeId}/timeline`)
      await page.getByTestId('new-moment').click()
      const era = page.getByTestId('moment-startEraId')
      await expect(era).toBeVisible()
      const eraBox = await era.boundingBox()
      expect(eraBox!.x + eraBox!.width, `era select at ${width}px`).toBeLessThanOrEqual(width)
      expect(await scrollsSideways(page), `drawer at ${width}px`).toBe(false)
      await page.getByTestId('cancel-moment').click()
    }
  })
})
