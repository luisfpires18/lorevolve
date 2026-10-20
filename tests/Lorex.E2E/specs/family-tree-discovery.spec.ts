import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { expectDetails } from './support/familyTree'

/**
 * Family discovery (035): the Family Tree opens on the families already recorded, worked out from family links, so the
 * creator does not have to know whose tree to ask for. A family is a few names and a size, a link to the tree of one of
 * its members; the search and the page live in the address. Choosing a character stays as the second way in.
 *
 * Each test registers its own accounts and builds its own universe.
 */

const Family = { biological: 1, adoptive: 2, other: 3 } as const
const Role = { viewer: 1, reviewer: 2, editor: 3 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('kinfinder')
  const email = `${username}@example.test`
  const password = makeTestPassword()
  const registered = await page.request.post('/api/auth/register', {
    data: { username, email, password },
  })
  expect(registered.ok()).toBe(true)
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { usernameOrEmail: username, password },
      })
    ).ok(),
  ).toBe(true)
  return email
}

async function universe(page: Page) {
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Kindred '), description: null, accentColor: null },
  })
  expect(response.status()).toBe(201)
  const id = ((await response.json()) as { id: string }).id
  const types = (await (await page.request.get(`/api/universes/${id}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  return { id, character: types.find((type) => type.name === 'Character')!.id }
}

async function person(page: Page, world: { id: string; character: string }, name: string) {
  const response = await page.request.post(`/api/universes/${world.id}/entities`, {
    data: {
      entityTypeId: world.character,
      name,
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

async function kind(page: Page, universeId: string, name: string, familySemantic: number) {
  const symmetric = familySemantic === Family.other
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName: symmetric ? null : `${name}, the other way`,
      isSymmetric: symmetric,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic,
    },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

async function link(
  page: Page,
  universeId: string,
  kindId: string,
  source: string,
  target: string,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationships`, {
    data: {
      relationshipTypeId: kindId,
      sourceEntityId: source,
      targetEntityId: target,
      canonStatus: 2,
      startDate: null,
      endDate: null,
      notes: null,
    },
  })
  expect(response.status()).toBe(201)
}

/**
 * Three families: the household (Nana bore Mara; Mara bore Lia and Tam; Oren raised Lia and bore Tam; Lia bore Cai; Cai
 * raised Pip), a married pair and an adoptive pair.
 */
async function threeFamilies(page: Page) {
  const world = await universe(page)
  const bore = await kind(page, world.id, 'bore', Family.biological)
  const raised = await kind(page, world.id, 'raised', Family.adoptive)
  const wed = await kind(page, world.id, 'wed', Family.other)
  const ids: Record<string, string> = {}
  for (const name of [
    'Nana',
    'Mara',
    'Oren',
    'Lia',
    'Tam',
    'Cai',
    'Pip',
    'Bram',
    'Ysolde',
    'Kestrel',
    'Vane',
  ]) {
    ids[name] = await person(page, world, name)
  }
  await link(page, world.id, bore, ids.Nana, ids.Mara)
  await link(page, world.id, bore, ids.Mara, ids.Lia)
  await link(page, world.id, raised, ids.Oren, ids.Lia)
  await link(page, world.id, bore, ids.Mara, ids.Tam)
  await link(page, world.id, bore, ids.Oren, ids.Tam)
  await link(page, world.id, bore, ids.Lia, ids.Cai)
  await link(page, world.id, raised, ids.Cai, ids.Pip)
  await link(page, world.id, wed, ids.Bram, ids.Ysolde)
  await link(page, world.id, raised, ids.Kestrel, ids.Vane)
  return { world, ids }
}

const familiesUrl = (universeId: string) => `/app/universes/${universeId}/family-tree`

const cards = (page: Page) => page.getByTestId('family-card')

function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

async function share(browser: Browser, owner: Page, universeId: string, role: number) {
  const context = await browser.newContext()
  const member = await context.newPage()
  const email = await account(member)
  expect(
    (
      await owner.request.post(`/api/universes/${universeId}/invitations`, {
        data: { email, role },
      })
    ).ok(),
  ).toBe(true)
  const invitations = (await (await member.request.get('/api/invitations')).json()) as {
    id: string
    universeId: string
  }[]
  const invitation = invitations.find((candidate) => candidate.universeId === universeId)!
  expect((await member.request.post(`/api/invitations/${invitation.id}/accept`)).ok()).toBe(true)
  return { context, member }
}

test.describe('family discovery', () => {
  test('the families are there without asking, a member finds theirs, and the tree opens and comes back', async ({
    page,
  }) => {
    await account(page)
    const { world, ids } = await threeFamilies(page)

    // No typing: every family, a few names and its size, by the name it opens on.
    await page.goto(familiesUrl(world.id))
    await expect(cards(page)).toHaveText([
      'Bram, Ysolde2 members',
      'Kestrel, Vane2 members',
      'Lia, Cai, Mara7 members',
    ])
    await expect(page.getByTestId('family-count')).toHaveText('3 families')

    // A member far from the preview finds the family once, and is named on it.
    await page.getByLabel('Search families by member').fill('pip')
    await expect(cards(page)).toHaveText(['Lia, Pip, Cai7 members'])
    await expect(page).toHaveURL(/[?&]q=pip/)
    await expect(page.getByTestId('family-count')).toHaveText('1 family includes “pip”.')

    // Another member: the same family, still one.
    await page.getByLabel('Search families by member').fill('Nana')
    await expect(cards(page)).toHaveText(['Lia, Nana, Cai7 members'])

    // A reload keeps the search.
    await page.reload()
    await expect(page.getByLabel('Search families by member')).toHaveValue('Nana')
    await expect(cards(page)).toHaveText(['Lia, Nana, Cai7 members'])

    // Opening it is the tree as it always was, on Lia.
    await cards(page).first().click()
    await page.waitForURL(`**/family-tree/${ids.Lia}`)
    await expectDetails(page, 'Mara', 'Biological parent')
    await expectDetails(page, 'Pip', "Cai's adoptive child")

    // Back is the search it came from.
    await page.goBack()
    await expect(page).toHaveURL(/\/family-tree\?q=Nana$/)
    await expect(page.getByLabel('Search families by member')).toHaveValue('Nana')
    await expect(cards(page)).toHaveText(['Lia, Nana, Cai7 members'])

    // Another member takes the focus as before, and Back walks through both.
    await cards(page).first().click()
    await page.getByTestId('family-focus-Tam').click()
    await page.waitForURL(`**/family-tree/${ids.Tam}`)
    await expectDetails(page, 'Lia', 'Sibling')
    await page.goBack()
    await page.waitForURL(`**/family-tree/${ids.Lia}`)
    await page.goBack()
    await expect(page).toHaveURL(/\/family-tree\?q=Nana$/)

    // "Browse families" on a tree opened from the list goes back to the same search.
    await cards(page).first().click()
    await page.getByTestId('family-browse').click()
    await expect(page).toHaveURL(/\/family-tree\?q=Nana$/)
    await expect(cards(page)).toHaveText(['Lia, Nana, Cai7 members'])

    // A deep link to an entry is unchanged.
    await page.goto(`${familiesUrl(world.id)}/${ids.Oren}`)
    await expectDetails(page, 'Tam', 'Biological child')
    await page.getByTestId('family-browse').click()
    await expect(page).toHaveURL(/\/family-tree$/)
    await expect(cards(page)).toHaveCount(3)

    // Nothing found says so.
    await page.getByLabel('Search families by member').fill('Nobody here')
    await expect(page.getByTestId('family-count')).toHaveText(
      'No family has a member by that name.',
    )
    await expect(cards(page)).toHaveCount(0)
  })

  test('families come in pages that the address keeps, and a search starts from the first', async ({
    page,
  }) => {
    await account(page)
    const world = await universe(page)
    const wed = await kind(page, world.id, 'wed', Family.other)
    for (let index = 1; index <= 13; index++) {
      const n = String(index).padStart(2, '0')
      await link(
        page,
        world.id,
        wed,
        await person(page, world, `Pair ${n} A`),
        await person(page, world, `Pair ${n} B`),
      )
    }

    const requests: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.includes('/family-tree/')) requests.push(path)
    })

    await page.goto(familiesUrl(world.id))
    await expect(cards(page)).toHaveCount(12)
    await expect(page.getByTestId('family-count')).toHaveText('13 families')

    await page.getByTestId('family-next-page').click()
    await expect(page).toHaveURL(/[?&]page=2/)
    await expect(cards(page)).toHaveText(['Pair 13 A, Pair 13 B2 members'])
    await expect(page.getByRole('heading', { name: 'Families in this universe' })).toBeFocused()

    await page.reload()
    await expect(cards(page)).toHaveText(['Pair 13 A, Pair 13 B2 members'])

    await page.goBack()
    await expect(cards(page)).toHaveCount(12)

    await page.goForward()
    await page.getByLabel('Search families by member').fill('Pair 02')
    await expect(cards(page)).toHaveText(['Pair 02 A, Pair 02 B2 members'])
    await expect(page).not.toHaveURL(/page=/)

    // Summaries only: no tree was read for any family on the way.
    expect(requests.filter((path) => !path.endsWith('/family-tree/families'))).toEqual([])
  })

  test('with no family yet, choosing someone is the way in, and their first connection makes one', async ({
    page,
  }) => {
    await account(page)
    const world = await universe(page)
    await kind(page, world.id, 'married to', Family.other)
    await person(page, world, 'Samwise')
    await person(page, world, 'Rosie')

    await page.goto(familiesUrl(world.id))
    await expect(page.getByTestId('family-none')).toContainText('No families recorded yet.')
    await expect(page.getByTestId('family-search')).toHaveCount(0)

    const picker = page.getByTestId('family-picker')
    await picker.getByTestId('picker-input').click()
    await picker.getByTestId('picker-input').fill('Samwise')
    await picker.getByTestId('picker-option-Samwise').click()
    await page.waitForURL(/\/family-tree\/[0-9a-f-]+$/)

    await page.getByTestId('add-family-link').click()
    const form = page.getByTestId('family-link-form')
    await form.getByTestId('picker-input').click()
    await form.getByTestId('picker-input').fill('Rosie')
    await form.getByTestId('picker-option-Rosie').click()
    await page.getByTestId('save-family-link').click()
    await expectDetails(page, 'Samwise', 'married to Rosie')

    await page.getByTestId('family-browse').click()
    await expect(cards(page)).toHaveText(['Rosie, Samwise2 members'])

    // The character picker is still there beside the families, folded away.
    await page.getByTestId('family-find-character').click()
    await expect(page.getByTestId('family-find-character')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('family-picker').getByTestId('picker-input')).toBeFocused()
  })

  test('every role finds and opens families, and only an editor adds to one', async ({
    page,
    browser,
  }) => {
    await account(page)
    const { world, ids } = await threeFamilies(page)

    for (const [role, canEdit] of [
      [Role.viewer, false],
      [Role.reviewer, false],
      [Role.editor, true],
    ] as const) {
      const { context, member } = await share(browser, page, world.id, role)
      await member.goto(familiesUrl(world.id))
      await expect(cards(member)).toHaveCount(3)
      await member.getByLabel('Search families by member').fill('Tam')
      await expect(cards(member)).toHaveText(['Lia, Tam, Cai7 members'])
      await cards(member).first().click()
      await member.waitForURL(`**/family-tree/${ids.Lia}`)
      await expectDetails(member, 'Tam', 'Sibling')
      await expect(member.getByTestId('add-family-link')).toHaveCount(canEdit ? 1 : 0)
      await context.close()
    }
  })

  for (const width of [390, 360]) {
    test(`at ${width}px the families stack in one column and nothing scrolls sideways`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await context.newPage()
      await account(page)
      const { world } = await threeFamilies(page)
      const wed = await kind(page, world.id, 'sworn', Family.other)
      await link(
        page,
        world.id,
        wed,
        await person(page, world, 'Annaleigh-Marguerite of the Very Long Northern Causeway'),
        await person(page, world, 'Bartholomew Wexley-Thistlewaite the Younger'),
      )

      await page.goto(familiesUrl(world.id))
      await expect(cards(page)).toHaveCount(4)
      const boxes = await cards(page).evaluateAll((all) =>
        all.map((card) => card.getBoundingClientRect().left),
      )
      expect(new Set(boxes).size).toBe(1)
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await page.getByTestId('family-find-character').click()
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await context.close()
    })
  }
})
