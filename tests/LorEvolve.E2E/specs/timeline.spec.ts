import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import { answerConfirms } from './support/confirm'

/**
 * The timeline, end to end. Each test registers its own account and builds its own
 * universe, so nothing depends on data another test left behind.
 *
 * The invariant under test throughout: a moment claims exactly what its date kind allows,
 * the API decides the order, and the page never invents a year a moment did not claim.
 */
const PASSWORD = 'Test-password-123!'

/** Kind values as the API and the client both spell them. */
const Kind = { exact: 0, approximate: 1, range: 2, unknown: 3 } as const
type KindName = keyof typeof Kind

/** Canon status values, matching the backend enum. */
const Canon = { idea: 0, draft: 1, canon: 2 } as const
type CanonName = keyof typeof Canon

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('chronicler')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function signOut(page: Page) {
  await page.goto('/app')
  await clickSignOut(page)
  await page.waitForURL('/login')
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

/** Writes a bare lore entry and returns its id. */
async function newEntry(page: Page, universeId: string, name: string) {
  await page.goto(`/app/universes/${universeId}/lore`)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)
  await page.getByLabel('Name').fill(name)
  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

function timelineUrl(universeId: string) {
  return `/app/universes/${universeId}/timeline`
}

async function openTimeline(page: Page, universeId: string) {
  await page.goto(timelineUrl(universeId))
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
}

interface MomentInput {
  title: string
  description?: string
  canonStatus?: CanonName
  kind?: KindName
  startYear?: string
  startMonth?: string
  startDay?: string
  endYear?: string
  endMonth?: string
  endDay?: string
  eraLabel?: string
  /** Names of entities to search for and add as participants. */
  participants?: string[]
}

/** Fills the open drawer from a description of the moment. Does not save it. */
async function fillDrawer(page: Page, input: MomentInput) {
  await page.getByTestId('moment-title').fill(input.title)

  if (input.description !== undefined) {
    await page.getByTestId('moment-description').fill(input.description)
  }

  if (input.canonStatus) {
    await page.getByTestId(`moment-canon-${input.canonStatus}`).click()
  }

  // The kind is chosen before the components: switching it clears what it forbids.
  await page.getByTestId(`moment-kind-${input.kind ?? 'exact'}`).click()

  for (const key of [
    'startYear',
    'startMonth',
    'startDay',
    'endYear',
    'endMonth',
    'endDay',
  ] as const) {
    const value = input[key]
    if (value !== undefined) await page.getByTestId(`moment-${key}`).fill(value)
  }

  if (input.eraLabel !== undefined) {
    await page.getByTestId('moment-era').fill(input.eraLabel)
  }

  for (const name of input.participants ?? []) {
    await page.getByTestId('participant-input').click()
    await page.getByTestId('participant-input').fill(name)
    await page.getByTestId(`participant-option-${name}`).click()
  }
}

/** Writes one moment through the drawer, exactly as an author would. */
async function addMoment(page: Page, input: MomentInput) {
  await page.getByTestId('new-moment').click()
  await expect(page.getByTestId('moment-form')).toBeVisible()
  await fillDrawer(page, input)
  await page.getByTestId('save-moment').click()
  await expect(page.getByTestId('moment-form')).toHaveCount(0)
}

/** One moment on the spine, found by the title it carries. */
function moment(page: Page, title: string) {
  return page.locator(`[data-title="${title}"]`)
}

/** The titles on the page, in the order the API put them. */
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

/** The request body the API expects, with everything a client may set spelled out. */
function requestBody(input: MomentInput & { entityIds?: string[] }) {
  const number = (value: string | undefined) => (value === undefined ? null : Number(value))

  return {
    title: input.title,
    description: input.description ?? null,
    canonStatus: Canon[input.canonStatus ?? 'idea'],
    dateKind: Kind[input.kind ?? 'exact'],
    startYear: number(input.startYear),
    startMonth: number(input.startMonth),
    startDay: number(input.startDay),
    endYear: number(input.endYear),
    endMonth: number(input.endMonth),
    endDay: number(input.endDay),
    eraLabel: input.eraLabel ?? null,
    entityIds: input.entityIds ?? [],
  }
}

/** Seeds a moment straight through the API, for the bulk a paging test needs. */
async function seedMoment(
  page: Page,
  universeId: string,
  input: MomentInput & { entityIds?: string[] },
) {
  const response = await page.request.post(`/api/universes/${universeId}/timeline`, {
    data: requestBody(input),
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

test.describe('timeline', () => {
  test('the sidebar opens an empty chronology, and each of the four date kinds is written, placed and read back', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Ashen Reach '))

    // The sidebar item is a real link, and an untouched universe says so.
    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(/\/timeline$/)
    await expect(page.getByTestId('chron-empty')).toBeVisible()
    await expect(page.getByTestId('chron-empty')).toContainText('Nothing has happened here yet.')

    // Exact, down to the day.
    await addMoment(page, {
      title: 'Frodo leaves the Shire',
      kind: 'exact',
      startYear: '3018',
      startMonth: '9',
      startDay: '22',
    })

    // Approximate, a year only.
    await addMoment(page, { title: 'The Watcher stirs', kind: 'approximate', startYear: '3018' })

    // A span.
    await addMoment(page, {
      title: 'The War of the Ring',
      kind: 'range',
      startYear: '3019',
      endYear: '3021',
      endMonth: '5',
    })

    // Unknown: no components at all.
    await addMoment(page, { title: 'The bargain in the dark', kind: 'unknown' })

    // A signed year, to prove the chronology is integers and not a calendar.
    await addMoment(page, { title: 'The first forging', kind: 'exact', startYear: '-42' })

    // Year zero is a year like any other, not an absent one.
    await addMoment(page, { title: 'The reckoning begins', kind: 'exact', startYear: '0' })

    await expect(page.getByTestId('chron-stream')).toBeVisible()

    // The order is the API's: earliest first, and the undated moment last of all.
    await expect
      .poll(() => momentOrder(page))
      .toEqual([
        'The first forging',
        'The reckoning begins',
        'The Watcher stirs',
        'Frodo leaves the Shire',
        'The War of the Ring',
        'The bargain in the dark',
      ])

    // A negative year wears a real minus sign, and the year stands in the margin once.
    await expect.poll(() => yearHeadings(page)).toEqual(['−42', '0', '3018', '3019', '?'])

    // Each kind says what it claims, in the words the format rules give it.
    await expect(moment(page, 'Frodo leaves the Shire').locator('.moment__when')).toHaveText(
      '3018.09.22',
    )
    await expect(moment(page, 'The Watcher stirs').locator('.moment__when')).toHaveText('c. 3018')
    await expect(moment(page, 'The War of the Ring').locator('.moment__when')).toHaveText(
      '3019 – 3021.05',
    )
    await expect(moment(page, 'The bargain in the dark').locator('.moment__when')).toHaveText(
      'Date unknown',
    )

    // A moment known only to its run's year does not restate the year above it.
    await expect(moment(page, 'The first forging').locator('.moment__when')).toHaveCount(0)
    await expect(moment(page, 'The first forging').locator('.moment__kind')).toHaveText('Exact')

    // The undated moment hangs apart rather than claiming a year of its own.
    const unplaced = page.locator('.chron__group--unplaced')
    await expect(unplaced).toContainText('In the story, not yet in time.')
    await expect(unplaced.locator('.moment')).toHaveCount(1)
    await expect(unplaced.locator('.moment')).toHaveAttribute(
      'data-title',
      'The bargain in the dark',
    )

    // One reckoning only, so no caution is raised.
    await expect(page.getByTestId('chron-eras')).toHaveCount(0)

    // A reload changes none of it.
    await page.reload()
    await expect
      .poll(() => momentOrder(page))
      .toEqual([
        'The first forging',
        'The reckoning begins',
        'The Watcher stirs',
        'Frodo leaves the Shire',
        'The War of the Ring',
        'The bargain in the dark',
      ])
  })

  test('a moment names several entities, and the participant filter follows one of them', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Fellowship '))

    await newEntry(page, universeId, 'Frodo')
    await newEntry(page, universeId, 'Samwise')
    await newEntry(page, universeId, 'Boromir')

    await openTimeline(page, universeId)
    await addMoment(page, {
      title: 'The Council of Elrond',
      kind: 'exact',
      startYear: '3018',
      startMonth: '10',
      participants: ['Frodo', 'Samwise', 'Boromir'],
    })
    await addMoment(page, {
      title: 'The breaking of the company',
      kind: 'exact',
      startYear: '3019',
      participants: ['Boromir'],
    })
    await addMoment(page, { title: 'A quiet year', kind: 'exact', startYear: '3020' })

    // Every participant is named on the moment, and each name links to its entry.
    const council = moment(page, 'The Council of Elrond')
    await expect(council.locator('.moment__player')).toHaveCount(3)
    await expect(council.locator('.moment__cast')).toContainText('Frodo')
    await expect(council.locator('.moment__cast')).toContainText('Samwise')
    await expect(council.locator('.moment__cast')).toContainText('Boromir')

    // Following one entry narrows the stream to the moments that name it.
    await page.getByTestId('picker-input').click()
    await page.getByTestId('picker-input').fill('Boromir')
    await page.getByTestId('picker-option-Boromir').click()
    await expect
      .poll(() => momentOrder(page))
      .toEqual(['The Council of Elrond', 'The breaking of the company'])

    // Following someone who was only at the council leaves the council alone.
    await page.getByTestId('picker-clear').click()
    await page.getByTestId('picker-input').fill('Samwise')
    await page.getByTestId('picker-option-Samwise').click()
    await expect.poll(() => momentOrder(page)).toEqual(['The Council of Elrond'])

    // Clearing the filter brings the whole chronology back.
    await page.getByTestId('picker-clear').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('chron-stream').locator('.moment')).toHaveCount(3)

    // A participant taken back off is gone from the moment after a reload.
    await page.getByTestId('edit-moment-The Council of Elrond').click()
    await page.getByTestId('participant-remove-Boromir').click()
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await page.reload()
    await expect(moment(page, 'The Council of Elrond').locator('.moment__player')).toHaveCount(2)
    await expect(moment(page, 'The Council of Elrond').locator('.moment__cast')).not.toContainText(
      'Boromir',
    )
  })

  test('an entry moved to the Trash keeps its place on the moment, marked, and comes back with it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Departures '))

    await newEntry(page, universeId, 'Boromir')
    const gone = await newEntry(page, universeId, 'Denethor')

    await openTimeline(page, universeId)
    await addMoment(page, {
      title: 'The last council of Minas Tirith',
      kind: 'exact',
      startYear: '3019',
      participants: ['Boromir', 'Denethor'],
    })
    await expect(
      moment(page, 'The last council of Minas Tirith').locator('.moment__player'),
    ).toHaveCount(2)

    // A timeline entry is a chronology record, not a lore entity, and since Phase 019
    // removing one of the entries it names destroys nothing: the participation stays stored
    // and is shown as unavailable rather than dropped, because the form posts the whole
    // participant set back and hiding it would delete it on the next save.
    const removed = await page.request.delete(`/api/universes/${universeId}/entities/${gone}`)
    expect(removed.status()).toBe(204)

    await page.reload()
    const council = moment(page, 'The last council of Minas Tirith')
    await expect(council).toBeVisible()
    await expect(council.locator('.moment__player')).toHaveCount(2)
    await expect(council.locator('.moment__cast')).toContainText('Boromir')
    await expect(council.locator('.moment__cast')).toContainText('Denethor (in Trash)')

    // The one in the Trash is named but not a link: it has no page to open.
    await expect(council.getByRole('link', { name: 'Denethor', exact: true })).toHaveCount(0)

    // An unrelated edit to the moment keeps it.
    await page.getByTestId('edit-moment-The last council of Minas Tirith').click()
    await expect(page.getByTestId('participants')).toContainText('Denethor (in Trash)')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(council.locator('.moment__player')).toHaveCount(2)

    // Restoring the entry makes the moment read exactly as it did before.
    const back = await page.request.post(`/api/universes/${universeId}/trash/${gone}/restore`)
    expect(back.status()).toBe(200)

    await page.reload()
    await expect(council.locator('.moment__cast')).not.toContainText('(in Trash)')
    await expect(council.getByRole('link', { name: 'Denethor', exact: true })).toBeVisible()
  })

  test('an edit moves a moment to its new place, and everything it was given survives a reload', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Second Draft '))
    await newEntry(page, universeId, 'Aragorn')

    await openTimeline(page, universeId)
    await addMoment(page, {
      title: 'The crowning',
      description: 'A king returns.',
      canonStatus: 'idea',
      kind: 'exact',
      startYear: '3019',
    })
    await addMoment(page, { title: 'The muster', kind: 'exact', startYear: '3018' })

    await expect.poll(() => momentOrder(page)).toEqual(['The muster', 'The crowning'])
    await expect(moment(page, 'The crowning').locator('.statusbadge')).toHaveText('Idea')

    // The drawer opens on what was written, not on an empty form.
    await page.getByTestId('edit-moment-The crowning').click()
    await expect(page.getByTestId('moment-title')).toHaveValue('The crowning')
    await expect(page.getByTestId('moment-description')).toHaveValue('A king returns.')
    await expect(page.getByTestId('moment-startYear')).toHaveValue('3019')

    // Change the title, the date, the status and the cast in one edit.
    await page.getByTestId('moment-title').fill('The crowning of Aragorn')
    await page.getByTestId('moment-startYear').fill('3017')
    await page.getByTestId('moment-startMonth').fill('5')
    await page.getByTestId('moment-canon-canon').click()
    await page.getByTestId('participant-input').click()
    await page.getByTestId('participant-input').fill('Aragorn')
    await page.getByTestId('participant-option-Aragorn').click()
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    // It has moved to where its new date puts it.
    await expect.poll(() => momentOrder(page)).toEqual(['The crowning of Aragorn', 'The muster'])
    await expect(moment(page, 'The crowning of Aragorn').locator('.moment__when')).toHaveText(
      '3017.05',
    )
    await expect(moment(page, 'The crowning of Aragorn').locator('.statusbadge')).toHaveText(
      'Canon',
    )

    // Canon status, the new date and the cast all survive a reload.
    await page.reload()
    const crowning = moment(page, 'The crowning of Aragorn')
    await expect(crowning.locator('.statusbadge')).toHaveText('Canon')
    await expect(crowning.locator('.moment__when')).toHaveText('3017.05')
    await expect(crowning.locator('.moment__account')).toHaveText('A king returns.')
    await expect(crowning.locator('.moment__cast')).toContainText('Aragorn')
    await expect.poll(() => momentOrder(page)).toEqual(['The crowning of Aragorn', 'The muster'])

    // And they come back into the drawer exactly as they were left.
    await page.getByTestId('edit-moment-The crowning of Aragorn').click()
    await expect(page.getByTestId('moment-startYear')).toHaveValue('3017')
    await expect(page.getByTestId('moment-startMonth')).toHaveValue('5')
    await expect(page.getByTestId('moment-canon-canon')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('cancel-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
  })

  test('the status filter narrows the chronology to one status and says so when nothing matches', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Three Statuses '))
    await openTimeline(page, universeId)

    await addMoment(page, {
      title: 'A settled fact',
      canonStatus: 'canon',
      kind: 'exact',
      startYear: '10',
    })
    await addMoment(page, {
      title: 'A working note',
      canonStatus: 'draft',
      kind: 'exact',
      startYear: '20',
    })
    await addMoment(page, {
      title: 'A passing thought',
      canonStatus: 'idea',
      kind: 'exact',
      startYear: '30',
    })

    await page.getByTestId('chron-canon').selectOption({ label: 'Canon' })
    await expect.poll(() => momentOrder(page)).toEqual(['A settled fact'])

    await page.getByTestId('chron-canon').selectOption({ label: 'Draft' })
    await expect.poll(() => momentOrder(page)).toEqual(['A working note'])

    await page.getByTestId('chron-canon').selectOption({ label: 'Idea' })
    await expect.poll(() => momentOrder(page)).toEqual(['A passing thought'])

    await page.getByTestId('chron-canon').selectOption({ label: 'Any status' })
    await expect
      .poll(() => momentOrder(page))
      .toEqual(['A settled fact', 'A working note', 'A passing thought'])

    // A filter that matches nothing says it is a filter, not an empty world.
    await addMoment(page, { title: 'A fourth', canonStatus: 'idea', kind: 'unknown' })
    await page.getByTestId('picker-input').click()
    await page.getByTestId('picker-input').fill('nobody at all')
    await page.keyboard.press('Escape')
    await page.getByTestId('chron-canon').selectOption({ label: 'Canon' })
    await page.getByTestId('chron-canon').selectOption({ label: 'Draft' })
    await expect(page.getByTestId('chron-stream').locator('.moment')).toHaveCount(1)
  })

  test('paging holds its order across both pages, and a delete refills the page it emptied', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Long Reckoning '))

    // One more than a full page of twelve, seeded through the API: the point under test
    // is the order and the paging, not thirteen turns of the drawer.
    for (let index = 1; index <= 13; index++) {
      await seedMoment(page, universeId, {
        title: `Year ${String(3000 + index)}`,
        kind: 'exact',
        startYear: String(3000 + index),
      })
    }

    await openTimeline(page, universeId)
    await expect(page.getByText('Page 1 of 2')).toBeVisible()

    const first = await momentOrder(page)
    expect(first).toHaveLength(12)
    expect(first[0]).toBe('Year 3001')
    expect(first[11]).toBe('Year 3012')

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await expect.poll(() => momentOrder(page)).toEqual(['Year 3013'])

    // Stepping back gives exactly the page that was left, in the same order.
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByText('Page 1 of 2')).toBeVisible()
    await expect.poll(() => momentOrder(page)).toEqual(first)

    // A delete on the first page pulls the thirteenth up rather than leaving a hole.
    await answerConfirms(page, () => true, [])
    await page.getByTestId('moment-actions-Year 3005').click()
    await page.getByTestId('delete-moment-Year 3005').click()
    await expect(moment(page, 'Year 3005')).toHaveCount(0)
    const refilled = await momentOrder(page)
    expect(refilled).toHaveLength(12)
    expect(refilled[11]).toBe('Year 3013')
    await expect(page.getByText('Page 1 of 1')).toHaveCount(0)

    // The moments it stood among are untouched, and the delete survives a reload.
    await page.reload()
    await expect(moment(page, 'Year 3005')).toHaveCount(0)
    await expect(moment(page, 'Year 3004')).toBeVisible()
    await expect(moment(page, 'Year 3006')).toBeVisible()
    await expect(page.getByTestId('chron-stream').locator('.moment')).toHaveCount(12)
  })

  test('deleting the last moment on a page steps back rather than showing an empty one', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Thirteen '))

    for (let index = 1; index <= 13; index++) {
      await seedMoment(page, universeId, {
        title: `Year ${String(3000 + index)}`,
        kind: 'exact',
        startYear: String(3000 + index),
      })
    }

    await openTimeline(page, universeId)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await expect.poll(() => momentOrder(page)).toEqual(['Year 3013'])

    // The page it stood alone on has nothing left to show, so the author is put back on
    // the one before it rather than on an empty stream.
    await answerConfirms(page, () => true, [])
    await page.getByTestId('moment-actions-Year 3013').click()
    await page.getByTestId('delete-moment-Year 3013').click()

    await expect(page.getByTestId('chron-empty')).toHaveCount(0)
    await expect(page.getByTestId('chron-stream').locator('.moment')).toHaveCount(12)
    await expect(moment(page, 'Year 3013')).toHaveCount(0)
    await expect(moment(page, 'Year 3001')).toBeVisible()

    // One page is left, so the pager goes with it.
    await expect(page.getByText('Page 1 of 1')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0)
  })

  test('the drawer opens on the title and can be given up on without writing anything', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Second Thoughts '))
    await openTimeline(page, universeId)

    // The writing starts at the title, not on the scrolling body the browser would
    // otherwise focus.
    await page.getByTestId('new-moment').click()
    await expect(page.getByTestId('moment-title')).toBeFocused()

    // Untouched, Escape simply closes it.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    // With something written, Escape asks once before giving up on the draft; staying keeps it, and saying
    // yes leaves nothing behind.
    const asked: string[] = []
    const answers: boolean[] = []
    await answerConfirms(page, () => answers.shift() ?? false, asked)
    const discard = 'Close without saving your changes? They will be lost.'

    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-title').fill('Never written')
    await page.keyboard.press('Escape')
    await expect.poll(() => asked).toEqual([discard])
    await expect(page.getByTestId('moment-title')).toHaveValue('Never written')
    answers.push(true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(page.getByTestId('chron-empty')).toBeVisible()

    // So does a click on the backdrop. The drawer is a panel on the right, so the veil to the left of it is
    // what a click has to land on: a click inside the dialog's own box would be a click on the panel.
    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-title').fill('Nor this')
    const panel = (await page.getByTestId('moment-form').boundingBox())!
    expect(panel.x).toBeGreaterThan(20)
    answers.push(true)
    await page.mouse.click(20, panel.y + panel.height / 2)
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(page.getByTestId('chron-empty')).toBeVisible()
    await expect.poll(() => asked).toHaveLength(3)

    // Cancelling an edit leaves the stored moment exactly as it was; a title typed and put back is no change.
    await addMoment(page, { title: 'Written once', kind: 'exact', startYear: '3018' })
    await page.getByTestId('edit-moment-Written once').click()
    await page.getByTestId('moment-title').fill('Renamed')
    await page.getByTestId('moment-title').fill('Written once')
    await page.getByTestId('cancel-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(3)
    await page.getByTestId('edit-moment-Written once').click()
    await page.getByTestId('moment-title').fill('Renamed by accident')
    answers.push(true)
    await page.getByTestId('cancel-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(4)
    await expect(moment(page, 'Written once')).toBeVisible()
    await expect(moment(page, 'Renamed by accident')).toHaveCount(0)

    await page.reload()
    await expect(moment(page, 'Written once')).toBeVisible()
  })

  test('the drawer refuses a span that ends before it starts, and keeps the draft through the refusal', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Backwards Span '))
    await openTimeline(page, universeId)

    await page.getByTestId('new-moment').click()
    await fillDrawer(page, {
      title: 'The long defeat',
      description: 'Kept through the refusal.',
      kind: 'range',
      startYear: '3021',
      endYear: '3019',
    })
    await page.getByTestId('save-moment').click()

    await expect(page.getByTestId('moment-error')).toBeVisible()
    await expect(page.getByTestId('moment-endYear')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('chron-empty')).toBeVisible()

    // Nothing the author typed is thrown away by the refusal.
    await expect(page.getByTestId('moment-title')).toHaveValue('The long defeat')
    await expect(page.getByTestId('moment-description')).toHaveValue('Kept through the refusal.')
    await expect(page.getByTestId('moment-startYear')).toHaveValue('3021')

    // Correcting only the offending component is enough to save.
    await page.getByTestId('moment-endYear').fill('3022')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(moment(page, 'The long defeat').locator('.moment__when')).toHaveText('3021 – 3022')
  })

  test('the drawer shows only the components a kind allows, and the API refuses the combinations it cannot build', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Kind Rules '))
    await openTimeline(page, universeId)

    await page.getByTestId('new-moment').click()

    // Exact and Approximate have a start only: there is no end to fill in.
    await page.getByTestId('moment-kind-exact').click()
    await expect(page.getByTestId('moment-startYear')).toBeVisible()
    await expect(page.getByTestId('moment-endYear')).toHaveCount(0)

    await page.getByTestId('moment-kind-approximate').click()
    await expect(page.getByTestId('moment-endYear')).toHaveCount(0)

    // A range opens the second point.
    await page.getByTestId('moment-kind-range').click()
    await expect(page.getByTestId('moment-endYear')).toBeVisible()
    await page.getByTestId('moment-startYear').fill('3018')
    await page.getByTestId('moment-endYear').fill('3020')

    // Unknown carries nothing, and switching to it clears what was typed rather than
    // sending a shape the API is bound to refuse.
    await page.getByTestId('moment-kind-unknown').click()
    await expect(page.getByTestId('moment-startYear')).toHaveCount(0)
    await expect(page.getByTestId('moment-endYear')).toHaveCount(0)

    await page.getByTestId('moment-kind-range').click()
    await expect(page.getByTestId('moment-startYear')).toHaveValue('')
    await expect(page.getByTestId('moment-endYear')).toHaveValue('')
    await page.getByTestId('cancel-moment').click()

    // The rules the drawer keeps are the API's own, and it enforces them itself.
    const refusals: [MomentInput, string, string][] = [
      [{ title: 'No year at all', kind: 'exact' }, 'startYear', 'Give the year this happened in.'],
      [
        { title: 'An exact end', kind: 'exact', startYear: '3018', endYear: '3020' },
        'endYear',
        'Only a range has an end. Switch the kind to Range.',
      ],
      [
        { title: 'A half range', kind: 'range', startYear: '3018' },
        'endYear',
        'Give the year the span ends in.',
      ],
      [
        { title: 'A backwards span', kind: 'range', startYear: '3021', endYear: '3019' },
        'endYear',
        'The span cannot end before it starts.',
      ],
      [
        { title: 'A dated unknown', kind: 'unknown', startYear: '3018' },
        'dateKind',
        'An unknown date carries no year, month or day. Clear them or pick a kind.',
      ],
      [
        { title: 'A day with no month', kind: 'exact', startYear: '3018', startDay: '22' },
        'startMonth',
        'Give the month as well when you give a day.',
      ],
      // A month with no year breaks two rules at once. The kind rule is checked last and
      // wins the field, which is the message worth showing: it names what to supply
      // rather than what is missing from what was supplied.
      [
        { title: 'A month with no year', kind: 'exact', startMonth: '9' },
        'startYear',
        'Give the year this happened in.',
      ],
      [
        { title: 'A thirteenth month', kind: 'exact', startYear: '3018', startMonth: '13' },
        'startMonth',
        'A month runs from 1 to 12.',
      ],
      [{ title: '', kind: 'exact', startYear: '3018' }, 'title', 'Give the moment a title'],
    ]

    for (const [input, field, message] of refusals) {
      const response = await page.request.post(`/api/universes/${universeId}/timeline`, {
        data: requestBody(input),
      })
      expect(response.status(), `${input.title || '(untitled)'} should be refused`).toBe(400)
      const body = await response.json()
      expect(Object.keys(body.errors)).toContain(field)
      expect(body.errors[field][0]).toContain(message)
    }

    // Not one of them was written.
    await page.reload()
    await expect(page.getByTestId('chron-empty')).toBeVisible()
  })

  test('a page carrying more than one reckoning says the order cannot be trusted', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Two Reckonings '))
    await openTimeline(page, universeId)

    await addMoment(page, {
      title: 'The One Ring is made',
      kind: 'exact',
      startYear: '1600',
      eraLabel: 'Second Age',
    })

    // One year label only, so far: no caution.
    await expect(page.getByTestId('chron-eras')).toHaveCount(0)
    await expect(moment(page, 'The One Ring is made')).toBeVisible()
    await expect(page.locator('.chron__era')).toHaveText('Second Age')

    await addMoment(page, {
      title: 'The Ring is unmade',
      kind: 'exact',
      startYear: '3019',
      eraLabel: 'Third Age',
    })

    // Two reckonings on one page, and the page admits what its order is worth.
    await expect(page.getByTestId('chron-eras')).toBeVisible()
    await expect(page.getByTestId('chron-eras')).toContainText('More than one year label')
    // And points at what does order them (018): date periods in Chronology.
    await expect(page.getByTestId('chron-eras')).toContainText('Date periods in Chronology')

    // The era is shown beside the year rather than folded into it, and the raw year
    // numbers still decide the order. This is the known cross-era limitation, held here
    // so a change to it cannot pass unnoticed.
    await expect.poll(() => yearHeadings(page)).toEqual(['1600', '3019'])
    await expect
      .poll(() => momentOrder(page))
      .toEqual(['The One Ring is made', 'The Ring is unmade'])
  })

  test('a run of moments sharing a year stays one run, and two runs of the same year stay apart', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Same Year '))

    // Three moments in year 3018, the middle one under a different reckoning. Eras take
    // no part in the sort, so this is the order the API returns.
    for (const [title, eraLabel] of [
      ['A first', 'Third Age'],
      ['B second', 'Second Age'],
      ['C third', 'Third Age'],
    ]) {
      await seedMoment(page, universeId, { title, kind: 'exact', startYear: '3018', eraLabel })
    }

    await openTimeline(page, universeId)

    // Runs are consecutive, never gathered: pulling the two Third Age moments together
    // would quietly rewrite the order the API decided.
    await expect.poll(() => momentOrder(page)).toEqual(['A first', 'B second', 'C third'])
    await expect.poll(() => yearHeadings(page)).toEqual(['3018', '3018', '3018'])
    await expect(page.locator('.chron__group')).toHaveCount(3)

    // Moments that do share a run share one heading rather than one heading each.
    await seedMoment(page, universeId, {
      title: 'D fourth',
      kind: 'exact',
      startYear: '3019',
      eraLabel: 'Third Age',
    })
    await seedMoment(page, universeId, {
      title: 'E fifth',
      kind: 'exact',
      startYear: '3019',
      eraLabel: 'Third Age',
    })
    await page.reload()

    await expect.poll(() => yearHeadings(page)).toEqual(['3018', '3018', '3018', '3019'])
    await expect(page.locator('.chron__group')).toHaveCount(4)
    await expect(page.locator('.chron__group').last().locator('.moment')).toHaveCount(2)
  })

  test('a title and an account are shown as text, never as markup', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Deep Cover '))
    await openTimeline(page, universeId)

    const hostileTitle = '<img src=x onerror="window.__lorevolveXss = true">The burning'
    const hostileText = '<script>window.__lorevolveXss = true</script>and then the tower fell'

    await addMoment(page, {
      title: hostileTitle,
      description: hostileText,
      kind: 'exact',
      startYear: '3018',
    })

    const written = page.getByTestId('chron-stream').locator('.moment')
    await expect(written.locator('.moment__title')).toHaveText(hostileTitle)
    await expect(written.locator('.moment__account')).toHaveText(hostileText)
    await expect(written.locator('img')).toHaveCount(0)
    await expect(written.locator('script')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('chron-stream').locator('.moment__title')).toHaveText(
      hostileTitle,
    )
    expect(
      await page.evaluate(() => (window as { __lorevolveXss?: boolean }).__lorevolveXss),
    ).toBeUndefined()
  })

  test('nothing about a moment reaches across a universe or an owner boundary', async ({
    page,
  }) => {
    const first = await signUp(page)
    const firstUniverse = await newUniverse(page, unique('Private Reach '))
    const aragorn = await newEntry(page, firstUniverse, 'Aragorn')

    await openTimeline(page, firstUniverse)
    await addMoment(page, {
      title: 'The secret crowning',
      description: 'Nobody else may read this.',
      kind: 'exact',
      startYear: '3019',
      eraLabel: 'Third Age',
      participants: ['Aragorn'],
    })

    const listed = await (await page.request.get(`/api/universes/${firstUniverse}/timeline`)).json()
    const secretId = listed.items[0].id as string

    // A second universe of the same author's, with its own cast.
    const secondUniverse = await newUniverse(page, unique('Other Reach '))
    const eowyn = await newEntry(page, secondUniverse, 'Eowyn')

    // The drawer's picker searches one universe. The other universe's cast is not in it.
    await openTimeline(page, secondUniverse)
    await page.getByTestId('new-moment').click()
    await page.getByTestId('participant-input').click()
    await page.getByTestId('participant-input').fill('Aragorn')
    await expect(page.getByText('Nothing here by that name.')).toBeVisible()
    await expect(page.getByTestId('participant-option-Aragorn')).toHaveCount(0)
    await page.getByTestId('cancel-moment').click()

    // Nor will the API take a participant from the other universe, on create or on update.
    const foreignOnCreate = await page.request.post(`/api/universes/${secondUniverse}/timeline`, {
      data: requestBody({ title: 'Smuggled in', startYear: '1', entityIds: [aragorn] }),
    })
    expect(foreignOnCreate.status()).toBe(400)
    expect(await foreignOnCreate.text()).toContain('Link entries from this universe.')

    const ownId = await seedMoment(page, secondUniverse, {
      title: 'An honest moment',
      startYear: '1',
      entityIds: [eowyn],
    })

    const foreignOnUpdate = await page.request.put(
      `/api/universes/${secondUniverse}/timeline/${ownId}`,
      {
        data: requestBody({
          title: 'An honest moment',
          startYear: '1',
          entityIds: [eowyn, aragorn],
        }),
      },
    )
    expect(foreignOnUpdate.status()).toBe(400)
    expect(await foreignOnUpdate.text()).toContain('Link entries from this universe.')

    // A filter carrying a foreign entity id matches nothing; it never reaches across.
    const leaked = await page.request.get(
      `/api/universes/${secondUniverse}/timeline?entityId=${aragorn}`,
    )
    expect(leaked.status()).toBe(200)
    const leakedBody = await leaked.json()
    expect(leakedBody.items).toHaveLength(0)
    expect(await leaked.text()).not.toContain('The secret crowning')

    // A moment of the author's own, asked for under the wrong universe, is simply not
    // there.
    const wrongUniverse = await page.request.get(
      `/api/universes/${secondUniverse}/timeline/${secretId}`,
    )
    expect(wrongUniverse.status()).toBe(404)

    // Fields that are not the client's to set are ignored rather than honoured: the row
    // keeps the universe of its route and the id the server minted.
    const posted = await page.request.post(`/api/universes/${secondUniverse}/timeline`, {
      data: {
        ...requestBody({ title: 'Overposted', startYear: '2' }),
        id: secretId,
        universeId: firstUniverse,
        createdAt: '1999-01-01T00:00:00Z',
        updatedAt: '1999-01-01T00:00:00Z',
      },
    })
    expect(posted.status()).toBe(201)
    const overposted = await posted.json()
    expect(overposted.id).not.toBe(secretId)
    expect(new Date(overposted.createdAt).getUTCFullYear()).toBeGreaterThan(2000)

    const firstStill = await (
      await page.request.get(`/api/universes/${firstUniverse}/timeline`)
    ).json()
    expect(firstStill.totalCount).toBe(1)
    expect(firstStill.items[0].title).toBe('The secret crowning')

    // A different account gets the same answer as for a universe that never existed, and
    // is told nothing about what is inside.
    await signOut(page)
    const second = await signUp(page)
    expect(second).not.toBe(first)

    await page.goto(timelineUrl(firstUniverse))
    await expect(page.getByTestId('universe-missing')).toBeVisible()

    const probes = [
      await page.request.get(`/api/universes/${firstUniverse}/timeline`),
      await page.request.get(`/api/universes/${firstUniverse}/timeline/${secretId}`),
      await page.request.put(`/api/universes/${firstUniverse}/timeline/${secretId}`, {
        data: requestBody({ title: 'Rewritten by a stranger', startYear: '1' }),
      }),
      await page.request.delete(`/api/universes/${firstUniverse}/timeline/${secretId}`),
    ]

    for (const probe of probes) {
      expect(probe.status()).toBe(404)
      const body = await probe.text()
      expect(body).not.toContain('The secret crowning')
      expect(body).not.toContain('Nobody else may read this.')
      expect(body).not.toContain('Third Age')
    }

    // And the moment is still there, untouched, for the author who wrote it.
    await signOut(page)
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(first)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/app')

    await openTimeline(page, firstUniverse)
    await expect(moment(page, 'The secret crowning')).toBeVisible()
    await expect(moment(page, 'The secret crowning').locator('.moment__cast')).toContainText(
      'Aragorn',
    )
  })

  test('the chronology and its drawer hold together on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    await signUp(page)
    const universeId = await newUniverse(page, unique('Narrow Reach '))
    await openTimeline(page, universeId)

    await addMoment(page, {
      title: 'A moment on a small screen',
      description: 'Long enough to have to wrap somewhere on a phone-sized viewport.',
      kind: 'range',
      startYear: '3018',
      startMonth: '9',
      endYear: '3021',
    })

    await expect(moment(page, 'A moment on a small screen')).toBeVisible()
    await expect(moment(page, 'A moment on a small screen').locator('.moment__when')).toHaveText(
      '3018.09 – 3021',
    )

    // Nothing overflows sideways: the page scrolls one way only.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // The per-moment tools are reachable where there is no hover to reveal them.
    await expect(page.getByTestId('edit-moment-A moment on a small screen')).toBeVisible()

    // The drawer fits the narrow screen and still saves.
    await page.getByTestId('edit-moment-A moment on a small screen').click()
    await expect(page.getByTestId('moment-form')).toBeVisible()
    const drawerOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(drawerOverflow).toBeLessThanOrEqual(1)

    await page.getByTestId('moment-title').fill('Renamed on a phone')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(moment(page, 'Renamed on a phone')).toBeVisible()
  })
})
