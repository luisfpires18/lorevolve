import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { expectDetails, openDetails } from './support/familyTree'

/**
 * The Family Tree, end to end (ADR 0035). Each test registers its own account and builds its own universe, so
 * nothing depends on data another test left behind.
 *
 * The invariant throughout: a relation kind means what its author configured and nothing else. A kind called
 * "parent of" is invisible to the tree until someone gives it a family meaning on the Types screen, and every
 * relative on screen is derived from those links on each read - never stored.
 */
/** Mirrors the API enums. */
const Canon = { idea: 0, draft: 1, canon: 2 } as const
const Family = { none: 0, biological: 1, adoptive: 2 } as const

const FamilyLabel = {
  none: 'Not a family connection',
  biological: 'Source is the biological parent',
  adoptive: 'Source is the adoptive parent',
} as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('kinkeeper')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

function typesUrl(universeId: string) {
  return `/app/universes/${universeId}/types?tab=relations`
}

function treeUrl(universeId: string, entityId?: string) {
  const base = `/app/universes/${universeId}/family-tree`
  return entityId ? `${base}/${entityId}` : base
}

// ---------- Setup through the API, for what a test is not about ----------

async function characterTypeId(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return types.find((type) => type.name === 'Character')!.id
}

async function seedPerson(page: Page, universeId: string, typeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus: Canon.canon,
      aliases: [],
      tags: [],
      fields: [],
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
  familySemantic: number,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName,
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic,
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedLink(
  page: Page,
  universeId: string,
  kindId: string,
  parent: string,
  child: string,
  canonStatus: number = Canon.canon,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationships`, {
    data: {
      relationshipTypeId: kindId,
      sourceEntityId: parent,
      targetEntityId: child,
      canonStatus,
      startDate: null,
      endDate: null,
      notes: null,
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

interface Household {
  universeId: string
  bore: string
  raised: string
  nana: string
  mara: string
  oren: string
  lia: string
  tam: string
  cai: string
  pip: string
}

/** Three generations, a sibling through two shared parents, and one adoptive link in each direction. */
async function seedHousehold(page: Page, universeId: string): Promise<Household> {
  const typeId = await characterTypeId(page, universeId)
  const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)
  const raised = await seedKind(page, universeId, 'raised', 'raised by', Family.adoptive)

  const [nana, mara, oren, lia, tam, cai, pip] = await Promise.all(
    ['Nana', 'Mara', 'Oren', 'Lia', 'Tam', 'Cai', 'Pip'].map((name) =>
      seedPerson(page, universeId, typeId, name),
    ),
  )

  await seedLink(page, universeId, bore, nana, mara)
  await seedLink(page, universeId, bore, mara, lia)
  await seedLink(page, universeId, raised, oren, lia)
  await seedLink(page, universeId, bore, mara, tam)
  await seedLink(page, universeId, bore, oren, tam)
  await seedLink(page, universeId, bore, lia, cai)
  await seedLink(page, universeId, raised, cai, pip)

  return { universeId, bore, raised, nana, mara, oren, lia, tam, cai, pip }
}

function node(page: Page, name: string) {
  return page.getByTestId(`family-node-${name}`)
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('family tree', () => {
  test('a relation kind means nothing to the tree until its author gives it a family meaning', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Kinship '))
    const typeId = await characterTypeId(page, universeId)

    // A kind whose name says family, and whose meaning is none.
    const named = await seedKind(page, universeId, 'parent of', 'child of', Family.none)
    const mara = await seedPerson(page, universeId, typeId, 'Mara')
    const lia = await seedPerson(page, universeId, typeId, 'Lia')
    await seedLink(page, universeId, named, mara, lia)

    // The section is in the universe's own navigation, and there is no family to find: the name said nothing. Someone
    // can still be chosen while a family kind is missing.
    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-family-tree').click()
    await page.waitForURL(/\/family-tree$/)
    await expect(page.getByTestId('family-no-kinds')).toBeVisible()
    await expect(page.getByTestId('family-discovery')).toHaveCount(0)
    await expect(page.getByLabel('Whose family?')).toBeVisible()

    await page.goto(treeUrl(universeId, lia))
    await expect(node(page, 'Lia')).toBeVisible()
    await expect(node(page, 'Mara')).toHaveCount(0)

    // Configured on the Types screen, in the author's own words.
    await page.goto(typesUrl(universeId))
    await page.getByTestId('edit-reltype-parent of').click()
    const form = page.getByTestId('relationship-type-form')
    await expect(form.getByTestId('reltype-family')).toContainText(
      'LorEvolve never infers one from the relationship name',
    )
    await form.getByLabel('Family meaning').selectOption({ label: FamilyLabel.biological })
    await expect(form.getByTestId('reltype-family-direction')).toContainText(
      'is the biological parent',
    )
    await page.getByTestId('save-relationship-type').click()
    await expect(page.getByTestId('reltype-family-parent of')).toHaveText(
      'Family: biological parent → child',
    )

    // The link that was already there is read the moment the kind means something.
    await page.goto(treeUrl(universeId, lia))
    await expect(node(page, 'Mara')).toBeVisible()
    await expectDetails(page, 'Mara', 'Parent', 'Biological parent')

    // And taking the meaning away takes it out of the tree again, without touching the link.
    await page.goto(typesUrl(universeId))
    await page.getByTestId('edit-reltype-parent of').click()
    await form.getByLabel('Family meaning').selectOption({ label: FamilyLabel.none })
    await page.getByTestId('save-relationship-type').click()
    await expect(page.getByTestId('reltype-family-parent of')).toHaveCount(0)

    await page.goto(treeUrl(universeId, lia))
    await expect(node(page, 'Mara')).toHaveCount(0)

    // The relation itself is untouched: it is still on the entry, under its own wording.
    await page.goto(`/app/universes/${universeId}/lore/${mara}/relations`)
    await expect(page.getByTestId('relationship-list')).toContainText('parent of')
  })

  test('parents, grandparents, siblings, children and grandchildren are derived, and a node can take the focus', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Household '))
    const household = await seedHousehold(page, universeId)

    await page.goto(treeUrl(universeId, household.lia))
    await expect(page.getByTestId('family-tree')).toBeVisible()

    await expectDetails(page, 'Mara', 'Biological parent')
    await expectDetails(page, 'Oren', 'Adoptive parent')
    await expectDetails(page, 'Nana', "Mara's biological parent")
    await expectDetails(
      page,
      'Tam',
      'Shares Mara (biological for both)',
      'Shares Oren (adoptive for Lia, biological for Tam)',
    )
    await expectDetails(page, 'Cai', 'Biological child')
    await expectDetails(page, 'Pip', "Cai's adoptive child")
    await expect(page.getByTestId('family-loop')).toHaveCount(0)

    // Nothing was written to get any of that: the sibling is derived from the two parent links.
    const links = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${household.tam}/relationships`)
    ).json()) as { label: string }[]
    expect(links).toHaveLength(2)

    // Another family member takes the focus, and the address follows.
    await node(page, 'Tam').getByTestId('family-focus-Tam').click()
    await page.waitForURL(`**/family-tree/${household.tam}`)
    // The address moves before the tree does: read Lia only once Tam's family is the one drawn.
    await expect(node(page, 'Tam')).toHaveAttribute('data-focal', 'true')
    await expectDetails(page, 'Lia', 'Sibling')

    // Back returns to the family that was open before it.
    await page.goBack()
    await page.waitForURL(`**/family-tree/${household.lia}`)
    await expect(node(page, 'Lia')).toHaveAttribute('data-focal', 'true')
    await expectDetails(page, 'Tam', 'Sibling')

    // A reload of the deep link opens the same family.
    await page.reload()
    await expectDetails(page, 'Mara', 'Biological parent')

    // And an entry is one click away, from the tree and back again.
    await (await openDetails(page, 'Mara')).getByRole('link', { name: 'Open entry' }).click()
    await page.waitForURL(`**/lore/${household.mara}**`)
    await expect(page.getByTestId('entry-name')).toHaveText('Mara')
    await page.getByTestId('entity-family-tree').click()
    await page.waitForURL(`**/family-tree/${household.mara}`)
    await expect(node(page, 'Mara')).toHaveAttribute('data-focal', 'true')
    await expectDetails(page, 'Lia', 'Biological child')
  })

  test('a family connection can be added from the tree, as an ordinary relation', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Newborn '))
    const household = await seedHousehold(page, universeId)
    const typeId = await characterTypeId(page, universeId)
    await seedPerson(page, universeId, typeId, 'Wren')

    await page.goto(treeUrl(universeId, household.lia))
    await page.getByTestId('add-family-link').click()

    const form = page.getByTestId('family-link-form')
    await form.getByTestId('family-link-kind').selectOption({ label: 'bore (biological parent)' })
    await form.getByTestId('family-link-side').selectOption({ label: 'Lia is the parent' })
    await form.getByTestId('picker-input').click()
    await form.getByTestId('picker-input').fill('Wren')
    await form.getByTestId('picker-option-Wren').click()
    await expect(page.getByTestId('family-link-preview')).toContainText('Lia bore Wren')
    await page.getByTestId('family-link-canon-canon').click()
    await page.getByTestId('save-family-link').click()

    await expect(page.getByTestId('family-link-form')).toHaveCount(0)
    await expectDetails(page, 'Wren', 'Biological child')

    // One ordinary relationship, of the kind that carries the meaning. There is no second kind of family link.
    const relations = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${household.lia}/relationships`)
    ).json()) as { label: string; relatedEntityName: string }[]
    expect(relations.filter((relation) => relation.relatedEntityName === 'Wren')).toEqual([
      expect.objectContaining({ label: 'bore' }),
    ])
  })

  test('a circle of connections is named, and the tree still opens', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Circle '))
    const typeId = await characterTypeId(page, universeId)
    const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)
    const arlen = await seedPerson(page, universeId, typeId, 'Arlen')
    const brin = await seedPerson(page, universeId, typeId, 'Brin')

    await seedLink(page, universeId, bore, arlen, brin)
    await seedLink(page, universeId, bore, brin, arlen)

    await page.goto(treeUrl(universeId, arlen))

    const loop = page.getByTestId('family-loop')
    await expect(loop).toBeVisible()
    await expect(loop).toContainText('go round in a circle')
    await expect(loop).toContainText('Arlen bore Brin')
    await expect(loop).toContainText('Brin bore Arlen')

    // Both positions are still drawn, and nothing was changed to say so.
    await expectDetails(page, 'Brin', 'Parent', 'Child')

    // Canon reports the same circle on the review screen.
    await page.goto(`/app/universes/${universeId}/canon`)
    await expect(page.getByTestId('finding-CANON-FAMILY-001')).toContainText(
      'Family links go round in a circle',
    )
  })

  test('a draft connection is never drawn as settled family history', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Draft kin '))
    const typeId = await characterTypeId(page, universeId)
    const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)
    const mara = await seedPerson(page, universeId, typeId, 'Mara')
    const lia = await seedPerson(page, universeId, typeId, 'Lia')
    await seedLink(page, universeId, bore, mara, lia, Canon.draft)

    await page.goto(treeUrl(universeId, lia))
    await expectDetails(page, 'Mara', 'Draft connection')
  })

  test('the tree fits a phone and a desktop, light and dark, with many relatives and long names', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide kin '))
    const typeId = await characterTypeId(page, universeId)
    const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)

    const focal = await seedPerson(page, universeId, typeId, 'الوريثة الأخيرة')
    const longName = await seedPerson(
      page,
      universeId,
      typeId,
      'Alenna Vance of the Seawall and the Drowned Coast',
    )
    await seedLink(page, universeId, bore, longName, focal)

    for (const index of [1, 2, 3]) {
      const parent = await seedPerson(page, universeId, typeId, `Parent ${index}`)
      await seedLink(page, universeId, bore, parent, focal)

      for (const sibling of [1, 2]) {
        const kin = await seedPerson(page, universeId, typeId, `Sibling ${index}.${sibling}`)
        await seedLink(page, universeId, bore, parent, kin)
      }
    }

    for (const index of [1, 2, 3, 4]) {
      const child = await seedPerson(page, universeId, typeId, `Child ${index}`)
      await seedLink(page, universeId, bore, focal, child)
    }

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [1440, 'dark'],
      [1920, 'light'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(treeUrl(universeId, focal))

      await expect(page.getByTestId('family-tree')).toBeVisible()
      await expect(node(page, 'الوريثة الأخيرة')).toBeVisible()
      await expect(page.getByTestId('family-legend')).toBeVisible()

      // The diagram may scroll sideways inside its own box. The page may not.
      expect(await scrollsSideways(page), `family tree at ${width}px`).toBe(false)

      const boxed = await page.evaluate(() => {
        const scroller = document.querySelector('.familytree__scroll')
        return scroller ? scroller.clientWidth <= document.documentElement.clientWidth : false
      })
      expect(boxed, `diagram contained at ${width}px`).toBe(true)
    }
  })

  test('a restored backup keeps its family meanings and derives the same family', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Kept kin '))
    const household = await seedHousehold(page, universeId)

    const archive = await (await page.request.get(`/api/universes/${universeId}/export`)).body()

    // The archive is the request body itself, as the restore screen sends it.
    const validated = await page.request.put('/api/backups/validate', {
      headers: { 'content-type': 'application/zip' },
      data: archive,
    })
    expect(validated.status()).toBe(200)
    const { token } = (await validated.json()) as { token: string }

    const restored = await page.request.post('/api/backups/restore', {
      data: { token, name: unique('Restored kin ') },
    })
    expect(restored.status()).toBe(201)
    const restoredId = ((await restored.json()) as { id: string }).id

    const entries = (await (
      await page.request.get(`/api/universes/${restoredId}/entities?search=Lia&pageSize=20`)
    ).json()) as { items: { id: string; name: string }[] }
    const lia = entries.items.find((entry) => entry.name === 'Lia')!.id

    expect(lia).not.toBe(household.lia)

    await page.goto(treeUrl(restoredId, lia))
    await expectDetails(page, 'Mara', 'Biological parent')
    await expectDetails(page, 'Oren', 'Adoptive parent')
    await expectDetails(page, 'Tam', 'Shares Mara (biological for both)')
    await expectDetails(page, 'Nana', "Mara's biological parent")
  })
})
