import { expect, test, type Page } from '@playwright/test'

/**
 * Canon constraints on a relation kind, end to end. Each test registers its own account and
 * builds its own universe, so nothing depends on data another test left behind.
 *
 * The invariant throughout: a kind means only what its author configured. The rule is set on
 * the Types screen, a link that breaks it is still saved, Canon Integrity reports it, and putting
 * the lore right - or taking the rule away - makes the report go.
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors the API enums. */
const Canon = { canon: 2 } as const
const FieldKind = { number: 2 } as const
const Semantic = { birthYear: 1 } as const
const AgeOrder = { none: 0, older: 1, younger: 2 } as const

const OrderLabel = {
  none: 'No age rule',
  older: 'Source must be older',
  younger: 'Source must be younger',
} as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('genealogist')
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
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

function typesUrl(universeId: string) {
  return `/app/universes/${universeId}/types?tab=relations`
}

function entryUrl(universeId: string, entityId: string) {
  return `/app/universes/${universeId}/lore/${entityId}`
}

/** An entry's Relations view, which is where its links are read and written. */
function relationsUrl(universeId: string, entityId: string) {
  return `${entryUrl(universeId, entityId)}/relations`
}

// ---------- Setup through the API, for what a test is not about ----------

/** Gives the Character type a Born field that declares a birth year, and returns the type's id. */
async function declareBirthYear(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string; fields: { id: string; name: string }[] }[]
  const character = types.find((type) => type.name === 'Character')!

  const response = await page.request.post(
    `/api/universes/${universeId}/entity-types/${character.id}/fields`,
    {
      data: {
        name: 'Born',
        kind: FieldKind.number,
        isRequired: false,
        displayOrder: null,
        defaultValue: null,
        options: null,
        semantic: Semantic.birthYear,
      },
    },
  )
  expect(response.status()).toBe(200)
  const born = ((await response.json()).fields as { id: string; name: string }[]).find(
    (field) => field.name === 'Born',
  )!

  return { typeId: character.id, bornId: born.id }
}

async function seedCharacter(
  page: Page,
  universeId: string,
  ids: { typeId: string; bornId: string },
  name: string,
  born: number,
) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: ids.typeId,
      name,
      summary: null,
      canonStatus: Canon.canon,
      aliases: [],
      tags: [],
      fields: [
        {
          fieldDefinitionId: ids.bornId,
          text: null,
          number: born,
          boolean: null,
          date: null,
          optionIds: null,
          referencedEntityId: null,
          eraId: null,
        },
      ],
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedKind(
  page: Page,
  universeId: string,
  name: string,
  inverseName: string,
  constraints: { ageOrder: number; min: number | null; max: number | null } | null,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName,
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: constraints && {
        ageOrder: constraints.ageOrder,
        minAgeDifferenceYears: constraints.min,
        maxAgeDifferenceYears: constraints.max,
      },
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

// ---------- Authoring through the UI ----------

interface KindRules {
  order?: keyof typeof OrderLabel
  min?: string
  max?: string
}

async function fillRules(page: Page, rules: KindRules) {
  const form = page.getByTestId('relationship-type-form')
  if (rules.order) {
    await form.getByLabel('Age ordering').selectOption({ label: OrderLabel[rules.order] })
  }
  if (rules.min !== undefined) await form.getByLabel('Minimum age gap (years)').fill(rules.min)
  if (rules.max !== undefined) await form.getByLabel('Maximum age gap (years)').fill(rules.max)
}

/** Opens a kind's editor on the Types screen, changes its rules, and saves. */
async function editRules(page: Page, universeId: string, name: string, rules: KindRules) {
  await page.goto(typesUrl(universeId))
  await page.getByTestId(`edit-reltype-${name}`).click()
  await fillRules(page, rules)
  await page.getByTestId('save-relationship-type').click()
  await expect(page.getByTestId('relationship-type-form')).toHaveCount(0)
  await expect(page.locator(`[data-reltype-name="${name}"]`)).toBeVisible()
}

/** Writes a Canon entry with a birth year through the editor, and returns its id. */
async function newCharacter(page: Page, universeId: string, name: string, born: string) {
  await page.goto(`/app/universes/${universeId}/lore`)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)
  await page.getByLabel('Entry type').selectOption({ label: 'Character' })
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Born', { exact: true }).fill(born)
  await page.getByTestId('canon-canon').click()
  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/** Links two entries from the source's page, as Canon. */
async function link(
  page: Page,
  universeId: string,
  sourceId: string,
  reading: string,
  targetName: string,
) {
  await page.goto(relationsUrl(universeId, sourceId))
  await page.getByTestId('add-relationship').click()
  await page.getByLabel('Reading').selectOption({ label: reading })
  await page.getByTestId('picker-input').click()
  await page.getByTestId('picker-input').fill(targetName)
  await page.getByTestId(`picker-option-${targetName}`).click()
  await page.getByTestId('relation-canon-canon').click()
  await page.getByTestId('save-relationship').click()
  await expect(page.getByTestId('relationship-form')).toHaveCount(0)
}

async function openCanon(page: Page, universeId: string) {
  await page.goto(`/app/universes/${universeId}/canon`)
  await expect(page.getByRole('heading', { name: 'Canon integrity' })).toBeVisible()
}

function finding(page: Page, text: string) {
  return page.locator('.finding').filter({ hasText: text })
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('relationship canon constraints', () => {
  test('a kind told its source is older reports a parent born after the child, and the report clears once the year is right', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Kinship Reach '))
    await declareBirthYear(page, universeId)

    // The kind, and the rule configured on it. The name alone would configure nothing.
    await page.goto(typesUrl(universeId))
    await page.getByTestId('add-relationship-type').click()
    const form = page.getByTestId('relationship-type-form')
    await form.getByLabel('Reads as', { exact: true }).fill('parent of')
    await form.getByLabel('Reads as, from the other side').fill('child of')
    await expect(form.getByTestId('reltype-canon')).toContainText(
      'LorEvolve never infers these from the relationship name.',
    )
    await expect(form.getByTestId('reltype-direction')).toHaveText('Source→parent of→Target')
    await expect(form.getByLabel('Age ordering')).toHaveValue(String(AgeOrder.none))
    await fillRules(page, { order: 'older', min: '12' })
    await page.getByTestId('save-relationship-type').click()
    await expect(page.getByTestId('reltype-constraints-parent of')).toHaveText(
      'Canon: source older than target, born at least 12 years apart',
    )

    // Two entries, each with a declared birth year.
    await newCharacter(page, universeId, 'Mira', '30')
    const arlen = await newCharacter(page, universeId, 'Arlen', '40')

    // Arlen written as Mira's parent. It breaks the rule, and it is saved anyway.
    await link(page, universeId, arlen, 'parent of', 'Mira')

    // Reconciled by the write: nothing was evaluated by hand.
    await openCanon(page, universeId)
    await expect(
      finding(page, '“Arlen” should be older than “Mira” under “parent of”, but was born later'),
    ).toBeVisible()
    await expect(finding(page, 'born 10 years apart')).toBeVisible()
    await expect(page.locator('.finding')).toHaveCount(2)

    // Put the year right, the way an author would.
    await page.goto(entryUrl(universeId, arlen))
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Born', { exact: true }).fill('10')
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/api/universes/${universeId}/entities/${arlen}`),
    )
    await page.getByTestId('save-entity').click()
    expect((await saved).ok()).toBeTruthy()

    // Twenty years older is the right way round and far enough apart.
    await openCanon(page, universeId)
    await expect(page.getByTestId('canon-empty')).toBeVisible()
    await expect(page.locator('.finding')).toHaveCount(0)
  })

  test('a minimum age gap can be tightened, loosened and cleared, and a bad gap is named before anything is saved', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Mentor Reach '))
    const ids = await declareBirthYear(page, universeId)

    // The lore goes in through the API: the configuration screen is what this test is about.
    const teacher = await seedCharacter(page, universeId, ids, 'Teacher', 10)
    const pupil = await seedCharacter(page, universeId, ids, 'Pupil', 18)
    const mentor = await seedKind(page, universeId, 'mentor of', 'mentored by', null)
    const linked = await page.request.post(`/api/universes/${universeId}/relationships`, {
      data: {
        relationshipTypeId: mentor,
        sourceEntityId: teacher,
        targetEntityId: pupil,
        canonStatus: Canon.canon,
        startDate: null,
        endDate: null,
        notes: null,
      },
    })
    expect(linked.status()).toBe(201)

    // No rule is exactly today's behaviour.
    await openCanon(page, universeId)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // A minimum above the maximum is named beside the field, not swapped, and nothing is sent.
    await page.goto(typesUrl(universeId))
    await page.getByTestId('edit-reltype-mentor of').click()
    const form = page.getByTestId('relationship-type-form')
    await fillRules(page, { min: '20', max: '10' })
    await page.getByTestId('save-relationship-type').click()
    await expect(form).toContainText(
      'The largest gap cannot be smaller than the smallest gap, 20 years.',
    )

    await fillRules(page, { min: '-1', max: '' })
    await page.getByTestId('save-relationship-type').click()
    await expect(form).toContainText('An age gap is a whole number of years, 0 or more.')

    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('reltype-constraints-mentor of')).toHaveCount(0)

    // Tightened: eight years apart is under twelve.
    await editRules(page, universeId, 'mentor of', { min: '12', max: '' })
    await expect(page.getByTestId('reltype-constraints-mentor of')).toHaveText(
      'Canon: born at least 12 years apart',
    )
    await openCanon(page, universeId)
    await expect(finding(page, 'born 8 years apart')).toBeVisible()

    // Loosened: eight is enough.
    await editRules(page, universeId, 'mentor of', { min: '8' })
    await openCanon(page, universeId)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // Tightened again, then every rule cleared.
    await editRules(page, universeId, 'mentor of', { order: 'older', min: '12' })
    await openCanon(page, universeId)
    await expect(page.locator('.finding')).toHaveCount(1)

    await editRules(page, universeId, 'mentor of', { order: 'none', min: '', max: '' })
    await expect(page.getByTestId('reltype-constraints-mentor of')).toHaveCount(0)
    await openCanon(page, universeId)
    await expect(page.getByTestId('canon-empty')).toBeVisible()

    // A kind that reads the same both ways has no older end to choose, but may still bound a gap.
    await page.goto(typesUrl(universeId))
    await page.getByTestId('add-relationship-type').click()
    await page.getByTestId('reltype-symmetric').check()
    await expect(form.getByLabel('Age ordering')).toHaveCount(0)
    await expect(form.getByTestId('reltype-no-order')).toBeVisible()
    await expect(form.getByLabel('Maximum age gap (years)')).toBeVisible()
  })

  test('the relation kind editor and its constraints fit from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Kin '))
    const name = 'sworn protector and eventual successor of'
    await seedKind(page, universeId, name, 'protected and succeeded by', {
      ageOrder: AgeOrder.older,
      min: 12,
      max: 400,
    })

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [1440, 'dark'],
      [1920, 'light'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(typesUrl(universeId))

      const row = page.getByTestId(`reltype-constraints-${name}`)
      await row.scrollIntoViewIfNeeded()
      await expect(row).toHaveText('Canon: source older than target, born 12 to 400 years apart')

      await page.getByTestId(`edit-reltype-${name}`).click()
      const form = page.getByTestId('relationship-type-form')
      await expect(form.getByLabel('Age ordering')).toHaveValue(String(AgeOrder.older))

      // Every control is on screen and reachable, not pushed off the right-hand edge.
      for (const control of [
        'reltype-direction',
        'reltype-age-order',
        'reltype-min-gap',
        'reltype-max-gap',
        'save-relationship-type',
      ]) {
        const element = form.getByTestId(control)
        await element.scrollIntoViewIfNeeded()
        await expect(element).toBeVisible()
        const box = await element.boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(width)
      }
      expect(await scrollsSideways(page), `types screen at ${width}px`).toBe(false)

      await form.getByRole('button', { name: 'Cancel' }).click()
    }
  })
})
