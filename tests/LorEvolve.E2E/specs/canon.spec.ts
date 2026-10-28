import { expect, test, type Locator, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import {
  addField,
  discardField,
  editField,
  fieldDialog,
  fieldSummary,
  openFields,
} from './support/typeFields'
import { acceptConfirm } from './support/confirm'

/**
 * Canon integrity, end to end. Each test registers its own account and builds its own
 * universe, so nothing depends on data another test left behind.
 *
 * Three invariants run through all of it: a finding is derived and never authoritative, a
 * fingerprint is the identity of one problem across runs, and only a High finding refuses
 * a save - and only the save that would create one.
 */
const PASSWORD = 'Test-password-123!'

/** Canon status values, matching the backend enum. */
const Canon = { idea: 0, draft: 1, canon: 2 } as const

/** Field kinds, matching `EntityFieldKind`. */
const FieldKind = { entityReference: 7 } as const

/** Conflict statuses, matching `CanonConflictStatus`. */
const Status = { pending: 0, resolved: 1, dismissed: 2 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('archivist')
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
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

// ---------- URLs ----------

function canonUrl(universeId: string) {
  return `/app/universes/${universeId}/canon`
}

function entryUrl(universeId: string, entityId: string) {
  return `/app/universes/${universeId}/lore/${entityId}`
}

/** An entry's Relations view, which is where its links are read and written. */
function relationsUrl(universeId: string, entityId: string) {
  return `${entryUrl(universeId, entityId)}/relations`
}

// ---------- Authoring through the UI ----------

interface EntryInput {
  name: string
  typeName?: string
  canon?: keyof typeof Canon
  /** Field label to value, filled by the label the field definition carries. */
  numbers?: Record<string, string>
  /** Field label to the name of the entry it should point at. */
  references?: Record<string, string>
}

/** Writes an entry through the editor exactly as an author would, and returns its id. */
async function newEntry(page: Page, universeId: string, input: EntryInput) {
  await page.goto(`/app/universes/${universeId}/lore`)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)

  if (input.typeName) {
    await page.getByLabel('Entry type').selectOption({ label: input.typeName })
  }

  await page.getByLabel('Name').fill(input.name)
  await fillEntryFields(page, input)

  if (input.canon) await page.getByTestId(`canon-${input.canon}`).click()

  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function fillEntryFields(page: Page, input: EntryInput) {
  for (const [label, value] of Object.entries(input.numbers ?? {})) {
    await page.getByLabel(label).fill(value)
  }

  for (const [label, target] of Object.entries(input.references ?? {})) {
    await chooseEntry(page, label, target)
  }
}

/** A link field's picker: whatever it holds is changed, the entry is searched for by name and chosen. */
async function chooseEntry(page: Page, label: string, name: string) {
  const picker = page.locator('.picker').filter({ has: page.getByText(label, { exact: true }) })
  const change = picker.getByTestId('picker-clear')
  if (await change.isVisible()) await change.click()
  await picker.getByTestId('picker-input').fill(name)
  await picker.getByTestId(`picker-option-${name}`).click()
}

/**
 * Moves an entry's canon status from its own page, which is the one-click promotion an
 * author actually uses. Not the edit form: this saves on the spot.
 */
async function promote(page: Page, universeId: string, entityId: string, to: keyof typeof Canon) {
  await page.goto(entryUrl(universeId, entityId))
  await expect(page.getByTestId('entry-name')).toBeVisible()

  // The step is pressed optimistically, so waiting on it would prove nothing about what
  // the server did. The write itself is what the findings are reconciled against.
  const written = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes(`/api/universes/${universeId}/entities/${entityId}`),
  )
  await page.getByTestId(`canon-${to}`).click()
  expect((await written).ok()).toBeTruthy()
  await expect(page.getByTestId(`canon-${to}`)).toHaveAttribute('aria-pressed', 'true')
}

async function addRelationKind(page: Page, universeId: string, name: string, inverseName: string) {
  await page.goto(`/app/universes/${universeId}/types?tab=relations`)
  await page.getByTestId('add-relationship-type').click()
  await page.getByLabel('Reads as', { exact: true }).fill(name)
  await page.getByLabel('Reads as, from the other side').fill(inverseName)
  await page.getByTestId('save-relationship-type').click()
  await expect(page.locator(`[data-reltype-name="${name}"]`)).toBeVisible()
}

/** Links two entries from the source's page, at the canon status given. */
async function link(
  page: Page,
  universeId: string,
  sourceId: string,
  reading: string,
  targetName: string,
  canon: keyof typeof Canon,
) {
  await page.goto(relationsUrl(universeId, sourceId))
  await page.getByTestId('add-relationship').click()
  await page.getByLabel('Reading').selectOption({ label: reading })
  await page.getByTestId('picker-input').click()
  await page.getByTestId('picker-input').fill(targetName)
  await page.getByTestId(`picker-option-${targetName}`).click()
  await page.getByTestId(`relation-canon-${canon}`).click()
  await page.getByTestId('save-relationship').click()
  await expect(page.getByTestId('relationship-form')).toHaveCount(0)
}

// ---------- Authoring types and their fields ----------

/** Adds one field through the Types screen's Add field, with the meaning the author chose for it. */
async function addFieldTo(
  page: Page,
  typeName: string,
  field: { name: string; kind: string; meaning?: string },
) {
  await addField(page, typeName, field)
}

/**
 * A type whose Born and Died fields declare what they mean, built the way an author builds
 * one: a type, two Number fields, and the Canon meaning chosen on each as it is added.
 */
async function addLifespanType(page: Page, universeId: string, typeName: string) {
  await page.goto(`/app/universes/${universeId}/types`)
  await page.getByTestId('new-type').click()
  await page.getByTestId('type-name').fill(typeName)
  await page.getByTestId('save-type').click()
  await expect(page.locator(`[data-type-name="${typeName}"]`)).toBeVisible()

  await openFields(page, universeId, typeName)

  for (const [name, meaning] of [
    ['Born', 'Birth year'],
    ['Died', 'Death year'],
  ] as const) {
    await addFieldTo(page, typeName, { name, kind: 'Number', meaning })
    await expect(fieldSummary(page, name)).toContainText(`Canon: ${meaning.toLowerCase()}`)
  }
}

// ---------- Seeded for brevity ----------

/**
 * A type carrying one entity-reference field. The Types screen builds this perfectly well;
 * it is seeded here only because the tests below are about findings rather than about types.
 */
async function seedReferenceType(page: Page, universeId: string, typeName: string, field: string) {
  const created = await page.request.post(`/api/universes/${universeId}/entity-types`, {
    data: { name: typeName },
  })
  expect(created.ok()).toBeTruthy()
  const typeId = (await created.json()).id as string

  const added = await page.request.post(
    `/api/universes/${universeId}/entity-types/${typeId}/fields`,
    { data: { name: field, kind: FieldKind.entityReference, isRequired: false } },
  )
  expect(added.ok()).toBeTruthy()
  return typeId
}

// ---------- Reading the review screen ----------

async function openCanon(page: Page, universeId: string) {
  await page.goto(canonUrl(universeId))
  await expect(page.getByRole('heading', { name: 'Canon integrity' })).toBeVisible()
}

/** Switches the status tab and waits for the list underneath it to settle. */
async function showStatus(page: Page, status: (typeof Status)[keyof typeof Status]) {
  await page.getByTestId(`canon-status-${status}`).click()
  await expect(page.getByTestId(`canon-status-${status}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.notice[role="status"]')).toHaveCount(0)
}

/** The findings currently listed, whatever their status. */
function findings(page: Page) {
  return page.locator('.finding')
}

/** One finding, found by wording it carries. */
function finding(page: Page, text: string): Locator {
  return page.locator('.finding').filter({ hasText: text })
}

/**
 * One `CANON-REL-001` finding, told apart by the endpoint it is about. A relationship with
 * two unsettled ends names both entries in both findings, so the name alone is ambiguous.
 */
function restingOn(page: Page, name: string): Locator {
  return finding(page, `rests on “${name}”`)
}

/** The recorded conflicts as the API has them, which is where identity is checked. */
async function conflictsOf(page: Page, universeId: string, query = '') {
  const response = await page.request.get(
    `/api/universes/${universeId}/canon-conflicts?page=1&pageSize=50${query}`,
  )
  expect(response.ok()).toBeTruthy()
  return (await response.json()).items as {
    id: string
    ruleCode: string
    severity: number
    status: number
    title: string
    subjects: { kind: number; subjectId: string; role: string; name: string | null }[]
  }[]
}

test.describe('canon integrity', () => {
  test('the review screen opens on what is open, filters, and walks a finding through dismiss, reopen and resolution', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Ashen Reach '))

    // The sidebar item is a real link, and an untouched universe has nothing to answer for.
    await page.getByTestId('workspace-canon').click()
    await page.waitForURL(/\/canon$/)
    await expect(page.getByRole('heading', { name: 'Canon integrity' })).toBeVisible()
    await expect(page.getByTestId(`canon-status-${Status.pending}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('canon-empty')).toContainText('No open findings.')

    // Evaluating an empty world says so rather than staying silent.
    await page.getByTestId('empty-evaluate-canon').click()
    await expect(page.getByTestId('canon-run')).toContainText('0 found')

    // A list that cannot be read says so and offers the way back, rather than reading as
    // a world with nothing wrong in it.
    await page.route('**/canon-conflicts?*', (route) => route.abort())
    await page.reload()
    const failure = page.locator('.notice--error')
    await expect(failure).toBeVisible()
    await expect(page.getByTestId('canon-empty')).toHaveCount(0)
    await page.unroute('**/canon-conflicts?*')
    await failure.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // Build one Canon relationship resting on two entries that are not Canon. That is two
    // findings, one per offending endpoint, because each is separately fixable.
    await addRelationKind(page, universeId, 'haunts', 'haunted by')
    const wisp = await newEntry(page, universeId, { name: 'Wisp', canon: 'draft' })
    const vale = await newEntry(page, universeId, { name: 'Vale', canon: 'idea' })
    await link(page, universeId, wisp, 'haunts', 'Vale', 'canon')

    // Writing the relationship reconciled the table. Nothing was evaluated by hand.
    await openCanon(page, universeId)
    await expect(findings(page)).toHaveCount(2)
    await expect(restingOn(page, 'Wisp')).toContainText('CANON-REL-001')
    await expect(restingOn(page, 'Vale')).toBeVisible()

    // Severity filters, and filtering to nothing says which filter did it.
    await page.getByTestId('canon-severity').selectOption('2')
    await expect(page.getByTestId('canon-empty')).toContainText('at High severity')
    await expect(page.getByTestId('canon-empty')).toContainText('Another severity may have')
    await page.getByTestId('canon-severity').selectOption('1')
    await expect(findings(page)).toHaveCount(2)
    await page.getByTestId('canon-severity').selectOption('')

    // Dismiss the one about Vale. It leaves the open list and turns up under Dismissed.
    await restingOn(page, 'Vale').getByRole('button', { name: 'Dismiss' }).click()
    await expect(findings(page)).toHaveCount(1)
    await expect(restingOn(page, 'Wisp')).toBeVisible()

    await showStatus(page, Status.dismissed)
    await expect(findings(page)).toHaveCount(1)
    await expect(restingOn(page, 'Vale')).toContainText('Set aside while it lasts')

    // Evaluating again over unchanged lore leaves the dismissal exactly where it was.
    // Reopening it on the next run would undo the decision within seconds.
    await page.getByTestId('evaluate-canon').click()
    await expect(page.getByTestId('canon-run')).toContainText('2 found, 0 new, 0 reopened')
    await showStatus(page, Status.dismissed)
    await expect(restingOn(page, 'Vale')).toBeVisible()

    // The author can take it back.
    await restingOn(page, 'Vale').getByRole('button', { name: 'Reopen' }).click()
    await expect(page.getByTestId('canon-empty')).toContainText('Nothing set aside.')
    await showStatus(page, Status.pending)
    await expect(findings(page)).toHaveCount(2)

    // Fix one for real: promoting Vale settles the endpoint the relationship rested on.
    // Saving the entry reconciles, so the review screen is right without an Evaluate.
    await promote(page, universeId, vale, 'canon')
    await openCanon(page, universeId)
    await expect(findings(page)).toHaveCount(1)
    await expect(restingOn(page, 'Wisp')).toBeVisible()

    await showStatus(page, Status.resolved)
    await expect(findings(page)).toHaveCount(1)
    await expect(restingOn(page, 'Vale')).toContainText('Evaluation closed this')
    await expect(restingOn(page, 'Vale').getByRole('button')).toHaveCount(0)

    // And the API refuses both transitions on it, not only the UI.
    const [resolved] = await conflictsOf(page, universeId, `&status=${Status.resolved}`)
    for (const action of ['dismiss', 'reopen']) {
      const refused = await page.request.post(
        `/api/universes/${universeId}/canon-conflicts/${resolved.id}/${action}`,
      )
      expect(refused.status()).toBe(400)
    }
  })

  test('a fingerprint is the identity of one problem: it returns as open when the problem does, and a materially different fact opens a different conflict', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Marrow Keep '))
    await seedReferenceType(page, universeId, 'Stronghold', 'Warden')

    const alaric = await newEntry(page, universeId, { name: 'Alaric', canon: 'draft' })
    await newEntry(page, universeId, { name: 'Brienne', canon: 'draft' })
    const keep = await newEntry(page, universeId, {
      name: 'Marrow Keep',
      typeName: 'Stronghold',
      references: { Warden: 'Alaric' },
      canon: 'canon',
    })

    // Canon lore pointing at lore that is not settled. One finding, Medium, no evaluate.
    await openCanon(page, universeId)
    await expect(finding(page, 'Alaric')).toContainText('CANON-FIELD-001')
    const [opened] = await conflictsOf(page, universeId)
    expect(opened.status).toBe(Status.pending)

    // The author decides to live with it.
    await finding(page, 'Alaric').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // Fixing it closes it, dismissal and all - a dismissal suppresses a live issue only.
    await promote(page, universeId, alaric, 'canon')
    const afterFix = await conflictsOf(page, universeId)
    expect(afterFix).toHaveLength(1)
    expect(afterFix[0].id).toBe(opened.id)
    expect(afterFix[0].status).toBe(Status.resolved)

    // The same problem, reintroduced later, comes back as open rather than being swallowed
    // by a judgement made about the earlier occurrence.
    await promote(page, universeId, alaric, 'draft')
    const afterRelapse = await conflictsOf(page, universeId)
    expect(afterRelapse).toHaveLength(1)
    expect(afterRelapse[0].id).toBe(opened.id)
    expect(afterRelapse[0].status).toBe(Status.pending)

    await openCanon(page, universeId)
    await expect(finding(page, 'Alaric')).toContainText('Open')

    // Repoint the field at a different entry. That is a different fact, so it is a
    // different conflict: the old one closes and a new one opens beside it.
    await page.goto(entryUrl(universeId, keep))
    await page.getByTestId('edit-entity').click()
    await chooseEntry(page, 'Warden', 'Brienne')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('Brienne')

    const afterRepoint = await conflictsOf(page, universeId)
    expect(afterRepoint).toHaveLength(2)
    const old = afterRepoint.find((row) => row.id === opened.id)!
    const fresh = afterRepoint.find((row) => row.id !== opened.id)!
    expect(old.status).toBe(Status.resolved)
    expect(fresh.status).toBe(Status.pending)
    expect(fresh.title).toContain('Brienne')

    await openCanon(page, universeId)
    await expect(finding(page, 'Brienne')).toBeVisible()
    await expect(finding(page, 'Alaric')).toHaveCount(0)
    await showStatus(page, Status.resolved)
    await expect(finding(page, 'Alaric')).toBeVisible()
  })

  test('a High finding refuses only the save that would create it, says so in place, and leaves the draft and the rest of the world alone', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Corvin Reach '))
    await addLifespanType(page, universeId, 'Bloodline')

    // A creation can be refused too, and then the entry it names was rolled back - so the
    // notice states the subjects without linking to rows that never survived.
    await page.goto(`/app/universes/${universeId}/lore`)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Entry type').selectOption({ label: 'Bloodline' })
    await page.getByLabel('Name').fill('Halden')
    await page.getByLabel('Born').fill('900')
    await page.getByLabel('Died').fill('800')
    await page.getByTestId('canon-canon').click()
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('canon-blocked')).toContainText('CANON-LIFE-001')
    await expect(
      page.getByTestId('canon-blocked').getByRole('link', { name: 'Entry' }),
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/lore\/new$/)
    await expect(page.getByLabel('Name')).toHaveValue('Halden')

    // A lifespan that runs backwards is ordinary work in progress while it is a Draft.
    const corvin = await newEntry(page, universeId, {
      name: 'Corvin',
      typeName: 'Bloodline',
      numbers: { Born: '500', Died: '400' },
      canon: 'draft',
    })
    await expect(page.getByTestId('entry-name')).toHaveText('Corvin')

    // Promoting it from the entry page is the one-click route, and it is refused the same
    // way as any other gated write: with the objection, not with a save failure.
    await page.getByTestId('canon-canon').click()
    await expect(page.getByTestId('canon-blocked')).toBeVisible()
    await expect(page.getByTestId('canon-blocked')).toContainText('CANON-LIFE-001')
    await expect(page.getByTestId('canon-blocked')).toContainText('dies before it is born')
    await expect(page.getByTestId('canon-blocked')).toContainText('Not saved')

    // Nothing was written, and the stepper does not claim otherwise.
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('canon-draft')).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.getByTestId('canon-draft')).toHaveAttribute('aria-pressed', 'true')

    // The same refusal through the edit form, where the draft has to survive it.
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Summary').fill('A margrave who outlived his own arithmetic.')
    await page.getByTestId('canon-canon').click()
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('canon-blocked')).toBeVisible()
    await expect(page.getByLabel('Summary')).toHaveValue(
      'A margrave who outlived his own arithmetic.',
    )
    await expect(page.getByLabel('Born')).toHaveValue('500')
    await expect(page.getByLabel('Died')).toHaveValue('400')

    // A blocked edit of something already stored links its entry subject. A blocked
    // creation does not, because the row it names was rolled back.
    await expect(
      page.getByTestId('canon-blocked').getByRole('link', { name: 'Entry' }),
    ).toHaveCount(1)

    // Correcting the fact that disagreed is all it takes. The read view returning with the
    // corrected year is what says the write landed - the stepper is pressed optimistically
    // and would say so either way.
    await page.getByLabel('Died').fill('600')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('600')
    await expect(page.getByTestId('canon-blocked')).toHaveCount(0)
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    // A Canon moment outside a Canon lifespan is refused on the timeline in the same words,
    // and the drawer keeps everything that was typed into it.
    await page.goto(`/app/universes/${universeId}/timeline`)
    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-title').fill('Corvin takes the pass')
    await page.getByTestId('moment-canon-canon').click()
    await page.getByTestId('moment-kind-exact').click()
    await page.getByTestId('moment-startYear').fill('300')
    await page.getByTestId('participant-input').click()
    await page.getByTestId('participant-input').fill('Corvin')
    await page.getByTestId('participant-option-Corvin').click()
    await page.getByTestId('save-moment').click()

    await expect(page.getByTestId('canon-blocked')).toBeVisible()
    await expect(page.getByTestId('canon-blocked')).toContainText('CANON-LIFE-002')
    await expect(page.getByTestId('canon-blocked')).toContainText('before “Corvin” is born')
    await expect(page.getByTestId('moment-form')).toBeVisible()
    await expect(page.getByTestId('moment-title')).toHaveValue('Corvin takes the pass')

    // Redate it inside the lifespan and it is an ordinary save.
    await page.getByTestId('moment-startYear').fill('550')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)
    await expect(page.locator('[data-title="Corvin takes the pass"]')).toBeVisible()

    // Medium never blocks. A Canon relationship onto a Draft entry saves, and is reported.
    await addRelationKind(page, universeId, 'serves', 'served by')
    const squire = await newEntry(page, universeId, { name: 'Nial', canon: 'draft' })
    await link(page, universeId, squire, 'serves', 'Corvin', 'canon')
    await expect(page.getByTestId('canon-blocked')).toHaveCount(0)

    await openCanon(page, universeId)
    await expect(finding(page, 'CANON-REL-001')).toBeVisible()
    await expect(findings(page)).toHaveCount(1)

    // And a refusal freezes nothing else: an unrelated entry still saves afterwards.
    await page.goto(entryUrl(universeId, squire))
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Summary').fill('Carries the banner and little else.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toContainText('Carries the banner')
  })

  test('a meaning is declared, refused, cleared and redeclared on the Types screen, and only a Number field is ever offered one', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Meaning '))
    await addLifespanType(page, universeId, 'Bloodline')

    // A Number field may mean nothing at all, which is the normal case.
    await addFieldTo(page, 'Bloodline', { name: 'Height', kind: 'Number' })
    await expect(fieldSummary(page, 'Height')).not.toContainText('Canon:')

    // Only one field on a type may carry a meaning, and the API says so in its own words. The drawer stays open on the draft.
    const refused = await addField(
      page,
      'Bloodline',
      { name: 'Also born', kind: 'Number', meaning: 'Birth year' },
      { saved: false },
    )
    await expect(refused).toContainText('already a birth year')
    await expect(page.locator('[data-field-name="Also born"]')).toHaveCount(0)

    // A meaning belongs to a shape. Switching the kind to one that cannot carry it takes
    // the control away rather than letting an invalid pair be submitted.
    await refused.getByTestId('field-kind').selectOption({ label: 'Short text' })
    await expect(refused.getByTestId('field-semantic')).toHaveCount(0)
    await refused.getByTestId('field-name').fill('Epithet')
    await refused.getByTestId('save-field').click()
    await expect(fieldDialog(page)).toHaveCount(0)
    await expect(page.locator('[data-field-name="Epithet"]')).toBeVisible()
    await expect(fieldSummary(page, 'Epithet')).not.toContainText('Canon:')

    // A lifespan that runs backwards, still only a Draft and so still ordinary work.
    const corvin = await newEntry(page, universeId, {
      name: 'Corvin',
      typeName: 'Bloodline',
      numbers: { Born: '500', Died: '400' },
      canon: 'draft',
    })

    // Withdraw what Died means. The chronology rule has nothing to read, so the promotion
    // it was refusing goes through.
    await openFields(page, universeId, 'Bloodline')
    await editField(page, 'Died', { meaning: 'None' })
    await expect(fieldSummary(page, 'Died')).not.toContainText('Canon:')
    await promote(page, universeId, corvin, 'canon')

    // Declaring it again tells the rules something new about lore that is already Canon, so
    // this write is gated like any other and is refused with the reason.
    await openFields(page, universeId, 'Bloodline')
    const gated = await editField(page, 'Died', { meaning: 'Death year' }, { saved: false })
    await expect(gated.getByTestId('field-dialog-error')).toContainText('was not saved')
    await discardField(page)
    await expect(fieldSummary(page, 'Died')).not.toContainText('Canon:')

    // Correct the year that disagreed, and the same declaration is ordinary.
    await page.goto(entryUrl(universeId, corvin))
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Died').fill('600')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('600')

    await openFields(page, universeId, 'Bloodline')
    await editField(page, 'Died', { meaning: 'Death year' })
    await expect(fieldSummary(page, 'Died')).toContainText('Canon: death year')
    await expect(page.getByTestId('fields-error')).toHaveCount(0)
  })

  test('a write reconciles the findings it touches, a rename rewords one without losing it, and a delete closes it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Hollow March '))
    await addRelationKind(page, universeId, 'guards', 'guarded by')

    const warden = await newEntry(page, universeId, { name: 'Roth', canon: 'canon' })
    await newEntry(page, universeId, { name: 'Hollow Gate', canon: 'draft' })
    await link(page, universeId, warden, 'guards', 'Hollow Gate', 'canon')

    await openCanon(page, universeId)
    await expect(finding(page, 'Hollow Gate')).toContainText('guards')
    const [conflict] = await conflictsOf(page, universeId)

    // A dismissal has to survive a rewording, which is what keeping names out of the
    // fingerprint is for.
    await finding(page, 'Hollow Gate').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    await page.goto(`/app/universes/${universeId}/types?tab=relations`)
    await page.getByTestId('edit-reltype-guards').click()
    await page.getByLabel('Reads as', { exact: true }).fill('warded')
    await page.getByTestId('save-relationship-type').click()
    await expect(page.locator('[data-reltype-name="warded"]')).toBeVisible()

    const reworded = await conflictsOf(page, universeId)
    expect(reworded).toHaveLength(1)
    expect(reworded[0].id).toBe(conflict.id)
    expect(reworded[0].status).toBe(Status.dismissed)
    expect(reworded[0].title).toContain('warded')

    await openCanon(page, universeId)
    await showStatus(page, Status.dismissed)
    await expect(finding(page, 'warded')).toBeVisible()

    // Deleting the relationship takes the finding away with it, without an Evaluate.
    await page.goto(relationsUrl(universeId, warden))
    await page.getByTestId('relationship-actions-Hollow Gate').click()
    await page.getByTestId('delete-relationship-Hollow Gate').click()
    await acceptConfirm(page)
    await expect(page.getByTestId('relations-empty')).toBeVisible()

    const afterDelete = await conflictsOf(page, universeId)
    expect(afterDelete).toHaveLength(1)
    expect(afterDelete[0].id).toBe(conflict.id)
    expect(afterDelete[0].status).toBe(Status.resolved)
  })

  test('a finding links the entries it names, says so plainly when one has gone, and never reaches outside its universe', async ({
    page,
  }) => {
    const owner = await signUp(page)
    const universeId = await newUniverse(page, unique('Verge '))
    const otherId = await newUniverse(page, unique('Elsewhere '))
    await addRelationKind(page, universeId, 'shelters', 'sheltered by')

    const hall = await newEntry(page, universeId, { name: 'Ember Hall', canon: 'canon' })
    await newEntry(page, universeId, { name: 'Sela', canon: 'idea' })
    await link(page, universeId, hall, 'shelters', 'Sela', 'canon')

    // The entry subject is a link and it lands on the entry. The relationship subject is
    // named and left alone, because it has no page of its own.
    await openCanon(page, universeId)
    const subjects = finding(page, 'Sela').locator('.finding__subjects')
    await expect(subjects).toContainText('relationship')
    await expect(subjects.getByRole('link', { name: 'Sela' })).toBeVisible()
    await subjects.getByRole('link', { name: 'Sela' }).click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toHaveText('Sela')

    // Remove the entry the finding rests on. The conflict closes, and the subject is said
    // plainly rather than linked into nothing: it is in the Trash, so it has no page to open.
    await page.getByTestId('entity-actions').click()
    await page.getByTestId('trash-entity').click()
    await acceptConfirm(page)
    await page.waitForURL(/\/trash$/)

    await openCanon(page, universeId)
    await showStatus(page, Status.resolved)
    await expect(finding(page, 'Sela')).toContainText('no longer here')
    await expect(finding(page, 'Sela').getByRole('link', { name: 'Sela' })).toHaveCount(0)

    // The second universe answers for itself only.
    await openCanon(page, otherId)
    await expect(page.getByTestId('canon-empty')).toBeVisible()
    expect(await conflictsOf(page, otherId)).toHaveLength(0)

    // A conflict id from one universe is not readable through another.
    const [recorded] = await conflictsOf(page, universeId, `&status=${Status.resolved}`)
    const crossed = await page.request.get(
      `/api/universes/${otherId}/canon-conflicts/${recorded.id}`,
    )
    expect(crossed.status()).toBe(404)

    // And not by anyone else at all.
    await signOut(page)
    await signUp(page)
    const stranger = await page.request.get(
      `/api/universes/${universeId}/canon-conflicts?page=1&pageSize=50`,
    )
    expect(stranger.status()).toBe(404)
    expect(owner).toBeTruthy()
  })
})
