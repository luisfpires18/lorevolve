import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { expectDetails, openDetails } from './support/familyTree'

/**
 * The Family Tree redesign (Issue #37): members as portraits in circles with their names beneath, an eye on each that
 * opens their details - a popover on a wide screen, a sheet on a phone - and authored family kept in those details,
 * apart from the ancestry and apart from ordinary relationships. Then the groups an author may enable for the tree.
 *
 * Each test registers its own account and builds its own universe through the API, for what it is not about.
 */
const Canon = { idea: 0, draft: 1, canon: 2 } as const
const Family = { none: 0, biological: 1, adoptive: 2, other: 3 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('kinpainter')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page, name: string) {
  const response = await page.request.post('/api/universes', {
    data: { name, description: null },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function types(page: Page, universeId: string) {
  return (await (await page.request.get(`/api/universes/${universeId}/entity-types`)).json()) as {
    id: string
    name: string
    familyTreeEligible: boolean
    familyTreeOffered: boolean
  }[]
}

async function characterTypeId(page: Page, universeId: string) {
  return (await types(page, universeId)).find((type) => type.name === 'Character')!.id
}

async function seedPerson(
  page: Page,
  universeId: string,
  typeId: string,
  name: string,
  canonStatus: number = Canon.canon,
) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus,
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
  inverseName: string | null,
  familySemantic: number,
  isSymmetric = false,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName,
      isSymmetric,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic,
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedLink(page: Page, universeId: string, kindId: string, from: string, to: string) {
  const response = await page.request.post(`/api/universes/${universeId}/relationships`, {
    data: {
      relationshipTypeId: kindId,
      sourceEntityId: from,
      targetEntityId: to,
      canonStatus: Canon.canon,
      startDate: null,
      endDate: null,
      notes: null,
    },
  })
  expect(response.status()).toBe(201)
}

function treeUrl(universeId: string, entityId?: string) {
  const base = `/app/universes/${universeId}/family-tree`
  return entityId ? `${base}/${entityId}` : base
}

function node(page: Page, name: string) {
  return page.getByTestId(`family-node-${name}`)
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

/**
 * Lia's family: a mother and a grandmother by parent links, a sister by the shared mother, a daughter; and beside the
 * ancestry, a husband for the mother, a brother and a guardian for Lia written as family that defines none, and a rival
 * who is no family at all.
 */
async function seedFamily(page: Page) {
  const universeId = await newUniverse(page, unique('Circles '))
  const character = await characterTypeId(page, universeId)
  const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)
  const married = await seedKind(page, universeId, 'married to', null, Family.other, true)
  const brother = await seedKind(
    page,
    universeId,
    'brother of',
    'brother or sister of',
    Family.other,
  )
  const guardian = await seedKind(page, universeId, 'guardian of', 'ward of', Family.other)
  const rival = await seedKind(page, universeId, 'rival of', 'rival to', Family.none)

  const ids: Record<string, string> = {}
  for (const name of ['Nana', 'Mara', 'Lia', 'Sel', 'Cai', 'Oren', 'Tam', 'Wen', 'Rook']) {
    ids[name] = await seedPerson(
      page,
      universeId,
      character,
      name,
      name === 'Sel' ? Canon.draft : Canon.canon,
    )
  }

  await seedLink(page, universeId, bore, ids.Nana, ids.Mara)
  await seedLink(page, universeId, bore, ids.Mara, ids.Lia)
  await seedLink(page, universeId, bore, ids.Mara, ids.Sel)
  await seedLink(page, universeId, bore, ids.Lia, ids.Cai)
  await seedLink(page, universeId, married, ids.Mara, ids.Oren)
  await seedLink(page, universeId, brother, ids.Tam, ids.Lia)
  await seedLink(page, universeId, guardian, ids.Wen, ids.Lia)
  await seedLink(page, universeId, rival, ids.Rook, ids.Lia)

  return { universeId, ids }
}

test.describe('family tree redesign', () => {
  test('members are circles with their names beneath and an eye each, the focal one ringed', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId, ids } = await seedFamily(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(treeUrl(universeId, ids.Lia))

    // Only the ancestry is drawn: four relatives and Lia. The spouse, brother, guardian and rival are not members.
    await expect(page.locator('.familynode')).toHaveCount(5)
    for (const name of ['Oren', 'Tam', 'Wen', 'Rook']) {
      await expect(node(page, name)).toHaveCount(0)
    }

    for (const name of ['Nana', 'Mara', 'Lia', 'Sel', 'Cai']) {
      const member = node(page, name)
      await expect(member.locator('.familynode__name bdi')).toHaveText(name)
      await expect(page.getByTestId(`family-details-${name}`)).toHaveAccessibleName(
        `Details for ${name}`,
      )
      // Nothing but the portrait, the name and the eye: no type, status or link on the node.
      await expect(member.getByRole('link')).toHaveCount(0)
      await expect(member).not.toContainText('Character')
    }

    // A circle, about 7.5rem across on a comfortable desktop, and the name beneath it.
    const face = await node(page, 'Mara').locator('.familynode__face').boundingBox()
    const name = await node(page, 'Mara').locator('.familynode__name').boundingBox()
    expect(face!.width).toBeGreaterThanOrEqual(108)
    expect(face!.width).toBeLessThanOrEqual(132)
    expect(Math.abs(face!.width - face!.height)).toBeLessThan(1)
    expect(name!.y).toBeGreaterThanOrEqual(face!.y + face!.height)
    expect(
      await node(page, 'Mara')
        .locator('.familynode__face')
        .evaluate((element) => getComputedStyle(element).borderRadius),
    ).not.toBe('0px')

    // No picture: the type's own placeholder, drawn round.
    await expect(node(page, 'Mara').getByTestId('entity-portrait-blank')).toBeVisible()

    // The focal member is the same node, marked as the one the family is shown for.
    await expect(node(page, 'Lia')).toHaveAttribute('aria-current', 'true')
    await expect(node(page, 'Lia').getByRole('button', { name: /Show the family/ })).toHaveCount(0)
    await expect(node(page, 'Mara').getByTestId('family-focus-Mara')).toHaveAccessibleName(
      'Show the family of Mara',
    )

    // Not Canon yet, said quietly on the node and in words in the details.
    await expect(node(page, 'Sel')).toHaveAttribute('data-canon', String(Canon.draft))
    await expectDetails(page, 'Sel', 'Draft')

    // One thin line per parent link, starting under the parent and arriving on top of the child.
    await expect(page.locator('.familytree__line')).toHaveCount(4)
  })

  test('details open as a popover beside the node, by keyboard too, and close back to the eye', async ({
    page,
  }) => {
    await signUp(page)
    const { universeId, ids } = await seedFamily(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(treeUrl(universeId, ids.Lia))

    const eye = page.getByTestId('family-details-Mara')
    await eye.focus()
    await page.keyboard.press('Enter')
    const details = page.getByTestId('family-details')
    await expect(details).toBeVisible()
    await expect(details).toHaveAttribute('data-layout', 'popover')
    await expect(eye).toHaveAttribute('aria-expanded', 'true')
    await expect(details.getByRole('heading', { name: 'Mara' })).toBeFocused()
    await expect(details).toHaveAccessibleName('Mara')

    // Held against its node: near it, and wholly in the window.
    const box = (await details.boundingBox())!
    const at = (await node(page, 'Mara').boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - (at.x + at.width / 2))).toBeLessThan(box.width / 2 + 1)
    expect(box.y >= at.y + at.height || box.y + box.height <= at.y).toBe(true)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(1280)

    // Type, status, the place in this family and the links behind it, the family that is not parentage.
    await expect(details).toContainText('Character')
    await expect(details).toContainText('Canon')
    await expect(details.getByTestId('family-details-place')).toContainText(
      'Parent: Biological parent',
    )
    await expect(details.getByTestId('family-details-place')).toContainText('Nana bore Mara')
    await expect(details.getByTestId('family-details-place')).toContainText('Mara bore Lia')
    await expect(details.getByTestId('family-details-connection')).toHaveText(['married to Oren'])

    // Escape closes and the focus is back on the eye.
    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
    await expect(eye).toBeFocused()
    await expect(eye).toHaveAttribute('aria-expanded', 'false')

    // A press outside closes too.
    await eye.click()
    await expect(details).toBeVisible()
    await page.mouse.click(10, 890)
    await expect(details).toHaveCount(0)

    // The focal member's details: its own authored family, from its own side, linked to entries that are not drawn.
    const lia = await openDetails(page, 'Lia')
    await expect(lia.getByTestId('family-details-place')).toContainText(
      'This page shows this entry’s family.',
    )
    await expect(lia.getByTestId('family-details-connection')).toHaveText([
      'brother or sister of Tam',
      'ward of Wen',
    ])
    await expect(lia).not.toContainText('Rook')
    await expect(lia.getByRole('button', { name: 'Show this family' })).toHaveCount(0)
    await lia.getByRole('link', { name: 'Wen' }).click()
    await page.waitForURL(`**/lore/${ids.Wen}**`)
    await expect(page.getByTestId('entry-name')).toHaveText('Wen')

    // And from a relative's details, their family takes the focus.
    await page.goBack()
    await (
      await openDetails(page, 'Mara')
    )
      .getByRole('button', { name: 'Show this family' })
      .click()
    await page.waitForURL(`**/family-tree/${ids.Mara}`)
    await expect(node(page, 'Mara')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByTestId('family-details')).toHaveCount(0)
  })

  test('ordinary relationships stay apart, below the tree, and are no family', async ({ page }) => {
    await signUp(page)
    const { universeId, ids } = await seedFamily(page)
    await page.goto(treeUrl(universeId, ids.Lia))

    await expect(page.getByTestId('family-other-connections')).toHaveCount(0)
    const others = page.getByTestId('family-other-relationships')
    await expect(others).toContainText('Other relationships')
    await expect(others.getByTestId('family-other-relationship')).toHaveText(['Lia rival to Rook'])
    await expect(others.getByRole('link', { name: 'Rook' })).toHaveAttribute(
      'href',
      `/app/universes/${universeId}/lore/${ids.Rook}`,
    )
    await expect(node(page, 'Rook')).toHaveCount(0)

    // Every member's details hold family only.
    for (const name of ['Nana', 'Mara', 'Lia', 'Sel', 'Cai']) {
      const details = await openDetails(page, name)
      await expect(details).not.toContainText('rival')
      await page.keyboard.press('Escape')
      await expect(details).toHaveCount(0)
    }
  })

  for (const [width, colorScheme] of [
    [390, 'dark'],
    [360, 'light'],
  ] as const) {
    test(`at ${width}px ${colorScheme} the details are a bottom sheet and nothing scrolls sideways`, async ({
      page,
    }) => {
      await signUp(page)
      const { universeId, ids } = await seedFamily(page)
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 780 })
      await page.goto(treeUrl(universeId, ids.Lia))
      await expect(node(page, 'Lia')).toBeVisible()
      expect(await scrollsSideways(page)).toBe(false)

      // Smaller circles that never overlap one another.
      const faces = await page
        .locator('.familynode__face')
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect),
        )
      for (const [index, one] of faces.entries()) {
        for (const other of faces.slice(index + 1)) {
          const apart =
            one.right <= other.left ||
            other.right <= one.left ||
            one.bottom <= other.top ||
            other.bottom <= one.top
          expect(apart).toBe(true)
        }
      }

      const details = await openDetails(page, 'Mara')
      await expect(details).toHaveAttribute('data-layout', 'sheet')
      const sheet = (await details.boundingBox())!
      expect(Math.round(sheet.width)).toBe(width)
      expect(Math.round(sheet.y + sheet.height)).toBe(780)
      await expect(details.getByRole('link', { name: 'Open entry' })).toBeInViewport()
      expect(await scrollsSideways(page)).toBe(false)

      await details.getByTestId('family-details-close').click()
      await expect(details).toHaveCount(0)
      await expect(page.getByTestId('family-details-Mara')).toBeFocused()
    })
  }

  test('a long family in details scrolls inside, with its actions kept in reach', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Many cousins '))
    const character = await characterTypeId(page, universeId)
    const cousin = await seedKind(page, universeId, 'cousin of', null, Family.other, true)
    const ada = await seedPerson(page, universeId, character, 'Ada')
    for (let index = 1; index <= 24; index += 1) {
      await seedLink(
        page,
        universeId,
        cousin,
        ada,
        await seedPerson(page, universeId, character, `Cousin ${index} of the long Northern line`),
      )
    }

    for (const [width, height] of [
      [1280, 720],
      [390, 700],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto(treeUrl(universeId, ada))
      const details = await openDetails(page, 'Ada')
      await expect(details.getByTestId('family-details-connection')).toHaveCount(24)
      await expect(details.getByRole('link', { name: 'Open entry' })).toBeInViewport()
      await expect(details.getByTestId('family-details-close')).toBeInViewport()
      const body = details.locator('.familydetails__body')
      expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      )
      await page.keyboard.press('Escape')
    }
  })

  test('lines follow the members when the window changes size', async ({ page }) => {
    await signUp(page)
    const { universeId, ids } = await seedFamily(page)

    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(treeUrl(universeId, ids.Lia))
      await expect(page.locator('.familytree__line')).toHaveCount(4)

      // The line from Mara down to Lia starts under Mara's name and ends on top of Lia's circle, centred on both.
      const ends = await page.evaluate(() => {
        const svg = document.querySelector('.familytree__lines')!.getBoundingClientRect()
        const box = (name: string) =>
          document.querySelector(`[data-testid="family-node-${name}"]`)!.getBoundingClientRect()
        const mara = box('Mara')
        const lia = box('Lia')
        const paths = [...document.querySelectorAll('.familytree__line')].map((path) =>
          (path.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number),
        )
        return {
          paths: paths.map((numbers) => ({
            x1: numbers[0] + svg.left,
            y1: numbers[1] + svg.top,
            x2: numbers[6] + svg.left,
            y2: numbers[7] + svg.top,
          })),
          mara: { x: mara.left + mara.width / 2, bottom: mara.bottom },
          lia: { x: lia.left + lia.width / 2, top: lia.top },
        }
      })
      const line = ends.paths.find(
        (path) =>
          Math.abs(path.x1 - ends.mara.x) < 1.5 &&
          Math.abs(path.y1 - ends.mara.bottom) < 1.5 &&
          Math.abs(path.x2 - ends.lia.x) < 1.5,
      )
      expect(line, `line Mara to Lia at ${width}px`).toBeTruthy()
      expect(Math.abs(line!.y2 - ends.lia.top)).toBeLessThan(1.5)
    }
  })

  test('a group is enabled for the tree on purpose, and being in one enables nothing', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Woodland '))
    const created = await page.request.post(`/api/universes/${universeId}/entity-types`, {
      data: {
        name: 'Elf',
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        groups: [{ name: 'Family' }],
      },
    })
    expect(created.status()).toBe(201)
    const elf = ((await created.json()) as { id: string }).id
    const legolas = await seedPerson(page, universeId, elf, 'Legolas')

    // In a group called Family, and still not offered.
    await page.goto(treeUrl(universeId))
    const setup = page.getByTestId('family-setup')
    await setup.locator('summary').click()
    await expect(page.getByTestId('family-setup-types')).toContainText('Character')
    const family = page.getByTestId('family-group-Family')
    await expect(family).not.toBeChecked()
    await expect(setup).toContainText('Covers Elf')
    await expect(page.getByTestId('family-group-Characters')).not.toBeChecked()
    expect((await types(page, universeId)).find((type) => type.id === elf)!.familyTreeOffered).toBe(
      false,
    )

    // Turned on by its author: offered, while the type's own switch stays as it was.
    await family.check()
    await expect(family).toBeChecked()
    await expect
      .poll(
        async () =>
          (await types(page, universeId)).find((type) => type.id === elf)!.familyTreeOffered,
      )
      .toBe(true)
    expect(
      (await types(page, universeId)).find((type) => type.id === elf)!.familyTreeEligible,
    ).toBe(false)
    await page.reload()
    await page.getByTestId('family-setup').locator('summary').click()
    await expect(page.getByTestId('family-group-Family')).toBeChecked()

    // The entry's own page offers the tree now, and the tree opens without the not-enabled note.
    await page.goto(`/app/universes/${universeId}/lore/${legolas}`)
    await page.getByTestId('entity-family-tree').click()
    await page.waitForURL(`**/family-tree/${legolas}`)
    await expect(page.getByTestId('family-type-not-enabled')).toHaveCount(0)

    // And off again, from the same place.
    await page.getByTestId('family-setup').locator('summary').click()
    await page.getByTestId('family-group-Family').uncheck()
    await expect(page.getByTestId('family-type-not-enabled')).toBeVisible()
    expect((await types(page, universeId)).find((type) => type.id === elf)!.familyTreeOffered).toBe(
      false,
    )
  })
})
