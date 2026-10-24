import { expect, test, type Locator, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * World rule checks against the timeline, end to end (ADR 0034).
 *
 * A rule is given its one check part by part - an event kind and a method chosen by id, added in place, and a limit - refused
 * while a part is missing, kept through a reload and taken off again. Canon finds a participant over the limit as soon as the
 * moment that puts them there is saved, names and links the rule, the entry and the moments, and follows a moment's method as
 * it changes and changes back. A check that cannot count every moment says so in words and names each one. An ordinary moment
 * needs nothing more, and the Types screen keeps the vocabulary. And all of it reads on a phone, dark and light, with long and
 * right-to-left names.
 *
 * The combinations of what matches and what does not are the API tests' business; these are the flows an author walks. Each test
 * registers its own account and builds what it needs through the API.
 */
const PASSWORD = 'Test-password-123!'

/** Canon status values, matching the backend enum. */
const Canon = { idea: 0, draft: 1, canon: 2 } as const

/** Term kinds, matching `ValidationTermKind`. */
const TermKind = { eventKind: 0, method: 1 } as const

/** `WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod`. */
const LIMIT = 1

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('checker')
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

interface Term {
  id: string
  name: string
}

interface RuleRead {
  id: string
  title: string
  description: string
  validation: { maxOccurrences: number; method: Term; eventKind: Term } | null
}

interface MomentRead {
  id: string
  title: string
  validation: unknown
}

interface Details {
  eventKindId: string | null
  methodId: string | null
  participantEntityId: string | null
}

async function seedUniverse(page: Page) {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Checked '),
    description: null,
    accentColor: '#4f6bd6',
  })
  return universe.id
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = await api<{ id: string; name: string }[]>(
    page,
    'GET',
    `/api/universes/${universeId}/entity-types`,
  )
  const entity = await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: null,
    canonStatus: Canon.canon,
    aliases: null,
    tags: null,
    fields: null,
  })
  return entity.id
}

function seedTerm(page: Page, universeId: string, kind: number, name: string) {
  return api<Term>(page, 'POST', `/api/universes/${universeId}/validation-terms`, { kind, name })
}

function rulesApi(universeId: string) {
  return `/api/universes/${universeId}/world-rules`
}

function readRule(page: Page, universeId: string, ruleId: string) {
  return api<RuleRead>(page, 'GET', `${rulesApi(universeId)}/${ruleId}`)
}

function seedMoment(
  page: Page,
  universeId: string,
  title: string,
  validation: Details | null,
  year: number,
) {
  return api<MomentRead>(page, 'POST', `/api/universes/${universeId}/timeline`, {
    title,
    description: null,
    canonStatus: Canon.canon,
    dateKind: 0,
    startYear: year,
    startMonth: null,
    startDay: null,
    endYear: null,
    endMonth: null,
    endDay: null,
    eraLabel: null,
    entityIds: [],
    startEraId: null,
    endEraId: null,
    validation,
  })
}

interface WorldNames {
  eventKind: string
  method: string
  participant: string
  rule: string
}

/**
 * A universe holding an event kind, two methods, a Canon character and a rule allowing each participant `max` Canon moments of
 * that event kind by the first method.
 */
async function seedCheckedWorld(page: Page, max: number, names?: Partial<WorldNames>) {
  const universeId = await seedUniverse(page)
  const eventKind = await seedTerm(
    page,
    universeId,
    TermKind.eventKind,
    names?.eventKind ?? 'Resurrection',
  )
  const method = await seedTerm(page, universeId, TermKind.method, names?.method ?? 'Rite of Ash')
  const otherMethod = await seedTerm(page, universeId, TermKind.method, 'Seven Stones')
  const participant = await seedEntity(page, universeId, names?.participant ?? 'Arlen')
  const rule = await api<RuleRead>(page, 'POST', rulesApi(universeId), {
    title: names?.rule ?? 'One return by the Rite',
    description: 'Words Lorex never reads.',
    expectedUpdatedAt: null,
    validation: {
      kind: LIMIT,
      eventKindId: eventKind.id,
      methodId: method.id,
      maxOccurrences: max,
    },
  })

  return {
    universeId,
    base: `/app/universes/${universeId}`,
    eventKind,
    method,
    otherMethod,
    participant,
    rule,
    details: (participantEntityId: string | null = participant): Details => ({
      eventKindId: eventKind.id,
      methodId: method.id,
      participantEntityId,
    }),
  }
}

/** Saves the open rule through the page and waits until the API has confirmed it and the page says so. */
async function saveRule(page: Page, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        /\/world-rules(\/[0-9a-f-]+)?$/.test(new URL(response.url()).pathname) &&
        ['PUT', 'POST'].includes(response.request().method()) &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('world-rule-status')).toHaveText('Saved')
}

/** Saves the open moment drawer and waits for the write and for the drawer to close. */
async function saveMoment(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        /\/timeline(\/[0-9a-f-]+)?$/.test(new URL(response.url()).pathname) &&
        ['PUT', 'POST'].includes(response.request().method()) &&
        response.ok(),
    ),
    page.getByTestId('save-moment').click(),
  ])
  await expect(page.getByTestId('moment-form')).toHaveCount(0)
}

/** Chooses a term in a select once the universe's terms have been read into it. */
async function chooseTerm(select: Locator, name: string) {
  await expect(select.locator('option', { hasText: name })).toHaveCount(1)
  await select.selectOption({ label: name })
}

/** Fills parts of a moment's validation details in the open drawer, unfolding the section first. */
async function chooseDetails(
  page: Page,
  details: { eventKind?: string; method?: string; participant?: string; search?: string },
) {
  const section = page.getByTestId('moment-form').getByTestId('moment-validation')

  if (!(await section.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await section.getByTestId('moment-validation-toggle').click()
  }

  if (details.eventKind)
    await chooseTerm(section.getByTestId('moment-event-kind'), details.eventKind)
  if (details.method) await chooseTerm(section.getByTestId('moment-method'), details.method)

  if (details.participant) {
    const change = section.getByRole('button', { name: 'Change' })
    if ((await change.count()) > 0) await change.click()
    await section
      .getByRole('combobox', { name: 'Participant' })
      .fill(details.search ?? details.participant)
    await section.getByTestId(`picker-option-${details.participant}`).click()
  }
}

/** Writes a Canon moment with validation details through the drawer. */
async function addMoment(
  page: Page,
  title: string,
  year: string,
  details: { eventKind: string; method: string; participant: string },
) {
  await page.getByTestId('new-moment').click()
  await expect(page.getByTestId('moment-form')).toBeVisible()
  await page.getByTestId('moment-title').fill(title)
  await page.getByTestId('moment-canon-canon').click()
  await page.getByTestId('moment-startYear').fill(year)
  await chooseDetails(page, details)
  await saveMoment(page)
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

async function expectInsideScreen(locator: Locator, width: number, name: string) {
  const box = (await locator.boundingBox())!
  expect(box.x, name).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, name).toBeLessThanOrEqual(width + 1)
}

test.describe('world rule checks', () => {
  test('a rule is given a timeline check part by part, refused while a part is missing, kept through a reload, and taken off leaving its words', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`
    const rule = await api<RuleRead>(page, 'POST', rulesApi(universeId), {
      title: 'One return by the Rite',
      description: 'Words Lorex never reads.',
      expectedUpdatedAt: null,
    })

    await page.goto(`${base}/world-rules/${rule.id}`)
    const none = page.getByLabel('No check: this rule is words only')
    const limit = page.getByLabel('Limit how many times one participant has an event by a method')
    const fields = page.getByTestId('world-rule-check-fields')
    await expect(none).toBeChecked()
    await expect(fields).toHaveCount(0)
    await expect(page.getByTestId('world-rule-check')).toHaveCount(0)

    // By keyboard onto the pattern: only its own parts appear.
    await none.focus()
    await page.keyboard.press('ArrowDown')
    await expect(limit).toBeChecked()
    await expect(fields).toBeVisible()
    await expect(page.getByTestId('world-rule-status')).toHaveText('Unsaved changes')

    // Without an event kind or a method nothing is saved, and each field says so.
    await page.getByTestId('world-rule-save').click()
    const eventKind = page.getByLabel('Event kind', { exact: true })
    const method = page.getByLabel('Method', { exact: true })
    await expect(eventKind).toHaveAttribute('aria-invalid', 'true')
    await expect(fields).toContainText('Choose the event kind this rule limits.')
    await expect(fields).toContainText('Choose the method this rule limits.')
    await expect(page.getByTestId('world-rule-status')).toHaveText('Unsaved changes')

    // A new event kind added in place and chosen at once; a method added by keyboard alone.
    await page.getByTestId('world-rule-check-event-kind-new').click()
    await page.getByLabel('Name of the new event kind').fill('Resurrection')
    await page.getByTestId('world-rule-check-event-kind-add').click()
    await expect(eventKind).toBeFocused()
    await expect(eventKind.locator('option:checked')).toHaveText('Resurrection')

    await page.getByTestId('world-rule-check-method-new').click()
    await expect(page.getByLabel('Name of the new method')).toBeFocused()
    await page.keyboard.type('Rite of Ash')
    await page.keyboard.press('Enter')
    await expect(method).toBeFocused()
    await expect(method.locator('option:checked')).toHaveText('Rite of Ash')
    await expect(page.getByTestId('world-rule-status')).toHaveText('Unsaved changes')

    // A limit that is not a number from one is refused, in words tied to the field.
    const max = page.getByLabel('At most')
    await max.fill('0')
    await page.getByTestId('world-rule-save').click()
    await expect(max).toHaveAttribute('aria-invalid', 'true')
    await expect(fields).toContainText('The limit is a whole number from 1 to 10,000.')

    await max.fill('1')
    await saveRule(page, () => page.keyboard.press('Control+s'))
    await expect(page.getByTestId('world-rule-check-label')).toHaveText('Checked.')
    await expect(page.getByTestId('world-rule-check')).toContainText(
      '0 Canon moments counted. No participant has more than 1.',
    )

    await page.reload()
    await expect(limit).toBeChecked()
    await expect(eventKind.locator('option:checked')).toHaveText('Resurrection')
    await expect(method.locator('option:checked')).toHaveText('Rite of Ash')
    await expect(max).toHaveValue('1')
    expect((await readRule(page, universeId, rule.id)).validation?.maxOccurrences).toBe(1)

    // The list says which rules carry a check.
    await page.getByTestId('world-rule-back').click()
    await page.waitForURL(`${base}/world-rules`)
    await expect(page.getByTestId('world-rule-has-check')).toContainText(
      'Checked against the timeline',
    )

    // Taken off: the check goes and the words stay.
    await page.getByTestId('world-rule-open').click()
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    await none.check()
    await expect(fields).toHaveCount(0)
    await saveRule(page, () => page.getByTestId('world-rule-save').click())
    await page.reload()
    await expect(none).toBeChecked()
    await expect(page.getByTestId('world-rule-check')).toHaveCount(0)
    await expect(page.getByTestId('world-rule-description')).toHaveValue('Words Lorex never reads.')
    expect((await readRule(page, universeId, rule.id)).validation).toBeNull()
  })

  test('Canon finds a participant over the limit when the second matching moment is saved, links the rule, the entry and the moments, and follows the method as it changes', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedCheckedWorld(page, 1)
    const { base } = world
    const details = { eventKind: 'Resurrection', method: 'Rite of Ash', participant: 'Arlen' }

    await page.goto(`${base}/timeline`)
    await addMoment(page, 'Arlen returns from the pyre', '10', details)
    await expect(page.getByTestId('moment-validation-Arlen returns from the pyre')).toContainText(
      'Resurrection · by Rite of Ash · for Arlen',
    )

    await page.goto(`${base}/canon`)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // The second: over the limit, and Canon says so without being asked to evaluate.
    await page.goto(`${base}/timeline`)
    await addMoment(page, 'Arlen returns from the sea', '20', details)

    await page.goto(`${base}/canon`)
    const finding = page.getByTestId('finding-CANON-WORLD-001')
    await expect(finding).toHaveCount(1)
    await expect(finding.getByRole('heading', { level: 3 })).toHaveText(
      '“Arlen” has 2 “Resurrection” moments by “Rite of Ash”; “One return by the Rite” allows at most 1',
    )
    await expect(finding).toContainText('Medium')
    await expect(finding.getByRole('link', { name: 'Arlen', exact: true })).toHaveAttribute(
      'href',
      `${base}/lore/${world.participant}`,
    )
    const ruleLink = finding.getByRole('link', { name: 'One return by the Rite' })
    await expect(ruleLink).toHaveAttribute('href', `${base}/world-rules/${world.rule.id}`)
    await expect(finding.getByTestId('finding-link-moment')).toHaveCount(2)
    await expect(finding).not.toContainText('Words Lorex never reads.')

    // To the rule, which says the same in words, and back.
    await ruleLink.click()
    await page.waitForURL(`${base}/world-rules/${world.rule.id}`)
    await expect(page.getByTestId('world-rule-check-label')).toHaveText('Conflict found.')
    await expect(page.getByTestId('world-rule-check')).toContainText(
      '1 participant over the limit of 1.',
    )
    await page.getByTestId('world-rule-check-canon').click()
    await page.waitForURL(`${base}/canon`)

    // To the second moment, opened in the timeline's own editor, where its method is changed: the conflict goes.
    await finding.getByRole('link', { name: 'Arlen returns from the sea' }).click()
    await page.waitForURL(/\/timeline\?moment=/)
    const drawer = page.getByTestId('moment-form')
    await expect(drawer.getByTestId('moment-title')).toHaveValue('Arlen returns from the sea')
    await expect(drawer.getByTestId('moment-validation')).toHaveAttribute('open', '')
    await chooseDetails(page, { method: 'Seven Stones' })
    await saveMoment(page)
    expect(new URL(page.url()).search).toBe('')

    await page.goto(`${base}/canon`)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // Changed back from the timeline itself: the same conflict returns.
    await page.goto(`${base}/timeline`)
    await page.getByTestId('edit-moment-Arlen returns from the sea').click()
    await chooseDetails(page, { method: 'Rite of Ash' })
    await saveMoment(page)

    await page.goto(`${base}/canon`)
    await expect(page.getByTestId('finding-CANON-WORLD-001')).toHaveCount(1)
  })

  test('a check that cannot count every moment says so in words, names each one, and counts a moment completed from there', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedCheckedWorld(page, 2)
    const { base, universeId } = world
    await seedMoment(page, universeId, 'Arlen returns', world.details(), 10)
    await seedMoment(page, universeId, 'Someone returns', world.details(null), 20)
    await seedMoment(
      page,
      universeId,
      'A return by no known means',
      { ...world.details(), methodId: null },
      30,
    )

    await page.goto(`${base}/world-rules/${world.rule.id}`)
    const state = page.getByTestId('world-rule-check')
    const uncounted = page.getByTestId('world-rule-check-uncounted')
    await expect(page.getByTestId('world-rule-check-label')).toHaveText('Cannot fully check.')
    await expect(state).toContainText('1 Canon moment counted.')
    await expect(state).toContainText(
      '2 moments that may match could not be counted, so Lorex does not say this rule holds.',
    )
    await expect(uncounted.getByRole('listitem')).toHaveText([
      'A return by no known means (no method recorded)',
      'Someone returns (no participant recorded)',
    ])

    // Canon claims no conflict it cannot prove - and the rule does not claim to hold either.
    await page.goto(`${base}/canon`)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // Completed from the check itself.
    await page.goto(`${base}/world-rules/${world.rule.id}`)
    await uncounted.getByRole('link', { name: 'Someone returns' }).click()
    await page.waitForURL(/\/timeline\?moment=/)
    await chooseDetails(page, { participant: 'Arlen' })
    await saveMoment(page)

    await page.goto(`${base}/world-rules/${world.rule.id}`)
    await expect(uncounted.getByRole('listitem')).toHaveText([
      'A return by no known means (no method recorded)',
    ])
    await expect(state).toContainText('2 Canon moments counted.')

    // The last given another method is another event: now every moment that could match is counted.
    await uncounted.getByRole('link', { name: 'A return by no known means' }).click()
    await page.waitForURL(/\/timeline\?moment=/)
    await chooseDetails(page, { method: 'Seven Stones' })
    await saveMoment(page)

    await page.goto(`${base}/world-rules/${world.rule.id}`)
    await expect(page.getByTestId('world-rule-check-label')).toHaveText('Checked.')
    await expect(state).toContainText('2 Canon moments counted. No participant has more than 2.')
    await expect(uncounted).toHaveCount(0)
  })

  test('an ordinary moment needs nothing more, and the Types screen adds, renames and deletes event kinds and methods without changing a match', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedCheckedWorld(page, 1)
    const { base, universeId } = world

    // An ordinary moment: the details stay folded, optional, and nothing is sent for them.
    await page.goto(`${base}/timeline`)
    await page.getByTestId('new-moment').click()
    const drawer = page.getByTestId('moment-form')
    const section = drawer.getByTestId('moment-validation')
    await expect(section).not.toHaveAttribute('open', '')
    await expect(section.getByTestId('moment-validation-toggle')).toContainText(
      'Validation details · optional',
    )
    await expect(section.getByTestId('moment-event-kind')).toBeHidden()
    await drawer.getByTestId('moment-title').fill('The founding of the city')
    await drawer.getByTestId('moment-startYear').fill('1')
    await saveMoment(page)
    await expect(page.getByTestId('moment-validation-The founding of the city')).toHaveCount(0)
    const listed = await api<{ items: MomentRead[] }>(
      page,
      'GET',
      `/api/universes/${universeId}/timeline`,
    )
    expect(
      listed.items.find((item) => item.title === 'The founding of the city')!.validation,
    ).toBeNull()

    // The vocabulary on the Types screen.
    await page.goto(`${base}/types?tab=events`)
    const terms = page.getByTestId('validation-terms')
    await expect(terms.locator('[data-term-name="Rite of Ash"]')).toContainText('Used by 1 rule')
    await expect(terms.getByTestId('delete-term-Rite of Ash')).toHaveCount(0)

    await terms.getByTestId('new-term-kind').selectOption({ label: 'Method' })
    await terms.getByTestId('new-term-name').fill('Ashen rite')
    await terms.getByTestId('add-term').click()
    await expect(terms.locator('[data-term-name="Ashen rite"]')).toContainText('Not used')

    // A name another method has, whatever its case, is refused in words.
    await terms.getByRole('button', { name: 'Rename Ashen rite' }).click()
    await terms.getByTestId('rename-term-input-Ashen rite').fill('rite of ASH')
    await terms.getByTestId('save-term-Ashen rite').click()
    await expect(terms.getByRole('alert')).toHaveText(
      'This universe already has a method called “rite of ASH”.',
    )
    await terms.getByTestId('rename-term-input-Ashen rite').fill('Rite of Embers')
    await page.keyboard.press('Enter')
    await expect(terms.locator('[data-term-name="Rite of Embers"]')).toBeVisible()

    await terms.getByRole('button', { name: 'Delete Rite of Embers' }).click()
    await acceptConfirm(page)
    await expect(terms.locator('[data-term-name="Rite of Embers"]')).toHaveCount(0)

    // Renaming a term in use changes no match: the rule names it by id, and reads the new name.
    await terms.getByRole('button', { name: 'Rename Rite of Ash' }).click()
    await terms.getByTestId('rename-term-input-Rite of Ash').fill('Rite of Cinders')
    await terms.getByTestId('save-term-Rite of Ash').click()
    await expect(terms.locator('[data-term-name="Rite of Cinders"]')).toContainText(
      'Used by 1 rule',
    )
    const rule = await readRule(page, universeId, world.rule.id)
    expect(rule.validation?.method).toEqual({ id: world.method.id, name: 'Rite of Cinders' })
  })

  test('the check, a moment’s details and the finding read on a phone, in the dark and the light, with long and right-to-left names', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)

    const participant = 'Mira مِيرا 七年'
    const world = await seedCheckedWorld(page, 1, {
      eventKind: 'Resurrection-by-the-unbroken-covenant-of-the-seventh-tide-and-its-wardens',
      method: 'طقس الرماد',
      participant,
      rule: 'لا يعود أحد مرتين عبر طقس الرماد مهما كانت قوة الساحر أو عمر التنين الذي يحمله عبر البحر',
    })
    const { base, universeId } = world
    const first = await seedMoment(page, universeId, 'العودة الأولى', world.details(), 10)
    await seedMoment(page, universeId, 'ᚠ'.repeat(90), world.details(), 20)
    await seedEntity(page, universeId, 'Mirabel')

    // The rule on a phone: every part of its check inside the screen.
    await page.goto(`${base}/world-rules/${world.rule.id}`)
    await expect(page.getByTestId('world-rule-check-label')).toHaveText('Conflict found.')
    expect(await scrollsSideways(page)).toBe(false)
    for (const id of [
      'world-rule-check-limit',
      'world-rule-check-event-kind',
      'world-rule-check-method',
      'world-rule-check-max',
      'world-rule-check',
      'world-rule-save',
    ]) {
      await expectInsideScreen(page.getByTestId(id), 390, id)
    }

    // A moment's details on a phone, and the participant changed through the picker by keyboard.
    await page.goto(`${base}/timeline?moment=${first.id}`)
    const drawer = page.getByTestId('moment-form')
    const section = drawer.getByTestId('moment-validation')
    await expect(section).toHaveAttribute('open', '')
    await section.getByTestId('moment-validation-toggle').scrollIntoViewIfNeeded()
    expect(await scrollsSideways(page)).toBe(false)
    for (const id of ['moment-event-kind', 'moment-method']) {
      await expectInsideScreen(section.getByTestId(id), 390, id)
    }

    await section.getByRole('button', { name: 'Change' }).click()
    const picker = section.getByRole('combobox', { name: 'Participant' })
    await expect(picker).toBeFocused()
    await picker.fill('Mirabel')
    await expect(section.getByTestId('picker-option-Mirabel')).toBeVisible()
    await expect(section.getByTestId(`picker-option-${participant}`)).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(section.locator('.picker__chosenname')).toHaveText('Mirabel')
    await expectInsideScreen(section.locator('.picker__chosen'), 390, 'chosen participant')
    await drawer.getByTestId('cancel-moment').click()
    await acceptConfirm(page)
    await expect(drawer).toHaveCount(0)

    // The finding on a phone.
    await page.goto(`${base}/canon`)
    const finding = page.getByTestId('finding-CANON-WORLD-001')
    await expect(finding).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)
    await expectInsideScreen(finding, 390, 'finding')
    for (const link of await finding.getByRole('link').all()) {
      await expectInsideScreen(link, 390, (await link.textContent()) ?? 'link')
    }

    // And in the light, on a desktop.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const path of [
      `${base}/world-rules/${world.rule.id}`,
      `${base}/canon`,
      `${base}/timeline?moment=${first.id}`,
      `${base}/types`,
    ]) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      expect(await scrollsSideways(page), path).toBe(false)
    }
  })
})
