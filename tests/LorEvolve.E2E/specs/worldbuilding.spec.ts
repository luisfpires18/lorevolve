import { expect, test, type Page } from '@playwright/test'
import { expectDetails } from './support/familyTree'
import { answerConfirms } from './support/confirm'

/**
 * The worldbuilding workspaces as Design Refactor 006 left them: one direct verb per row and the rest behind ⋯, a
 * document's Delete never beside its Save, a chronology that reads on a phone, and a family tree whose generations
 * stack on a phone instead of scrolling out from under their names. Each test builds its own account and universe.
 */
const PASSWORD = 'Test-password-123!'
const DISCARD = 'Close without saving your changes? They will be lost.'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('builder')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function newUniverse(page: Page) {
  return (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('World '),
    description: null,
  }))!.id
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = (await api<{ id: string; name: string }[]>(
    page,
    'GET',
    `/api/universes/${universeId}/entity-types`,
  ))!
  return (await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: null,
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  }))!.id
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

/** What holds the focus, by test id. */
function focused(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
}

test.describe('worldbuilding workspaces', () => {
  test('a moment is Edit and a menu whose last item deletes it, created as a moment, and read on a phone', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const [era] = (await api<{ eras: { id: string }[] }>(
      page,
      'PUT',
      `/api/universes/${universeId}/chronology`,
      {
        eras: [
          {
            id: null,
            name: 'The Long Age of Lanterns After the Fall',
            abbreviation: null,
            direction: 0,
            labelPosition: 0,
          },
        ],
      },
    ))!.eras
    const title =
      'ليلة الحصاد and the harvest moon that followed the long winter of the nine houses'
    await api(page, 'POST', `/api/universes/${universeId}/timeline`, {
      title,
      description: null,
      canonStatus: 2,
      dateKind: 0,
      startYear: 1234,
      startMonth: null,
      startDay: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      eraLabel: null,
      entityIds: [],
      startEraId: era.id,
      endEraId: null,
    })

    await page.goto(`/app/universes/${universeId}/timeline`)
    // One word for the thing throughout: a moment.
    await expect(page.getByTestId('new-moment')).toHaveText('New moment')
    const row = page.locator(`[data-title="${title}"]`)

    // Edit is the one direct verb; Delete waits in the menu, the last thing in it, and the keyboard reaches it.
    await expect(row.getByTestId(`delete-moment-${title}`)).toHaveCount(0)
    const menu = row.getByRole('button', { name: `More actions for ${title}` })
    await menu.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('End')
    await expect.poll(() => focused(page)).toBe(`delete-moment-${title}`)
    await expect(row.locator('.actionmenu__item').last()).toHaveText('Delete moment')
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()

    // On a phone the year is one line beside its era, never a column of single digits, and nothing scrolls sideways.
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      await page.reload()
      const year = page.locator('.chron__yearnum').first()
      await expect(year).toHaveText('1234')
      expect(await year.evaluate((node) => node.getClientRects().length)).toBe(1)
      const box = (await year.boundingBox())!
      expect(box.height, `year at ${width}px`).toBeLessThan(48)
      expect(await scrollsSideways(page), `timeline at ${width}px`).toBe(false)
    }

    // The drawer calls it a moment too.
    await page.getByTestId('new-moment').click()
    await expect(page.getByTestId('moment-form')).toContainText('New moment')
    await expect(page.getByTestId('save-moment')).toHaveText('Create moment')
  })

  test("an idea's and a rule's Delete is in the menu beside its title, never beside Save", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const idea = (await api<{ id: string }>(page, 'POST', '/api/ideas', {
      title: 'What if the lanterns are alive?',
      body: '',
      universeId,
      references: [],
      expectedUpdatedAt: null,
    }))!
    const rule = (await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${universeId}/world-rules`,
      {
        title: 'The dead do not return',
        description: 'Nothing brings them back.',
        expectedUpdatedAt: null,
      },
    ))!

    for (const [url, kind, save] of [
      [`/app/universes/${universeId}/ideas/${idea.id}`, 'idea', 'idea-save'],
      [`/app/universes/${universeId}/world-rules/${rule.id}`, 'world-rule', 'world-rule-save'],
    ] as const) {
      await page.goto(url)
      await expect(page.getByTestId(save)).toBeVisible()
      // The bar that holds Save holds nothing destructive.
      const bar = page.getByTestId(save).locator('xpath=..')
      await expect(bar.getByRole('button')).toHaveCount(1)
      await expect(page.getByTestId(`${kind}-delete`)).toHaveCount(0)

      // The menu beside the title offers Delete, in the danger style and in words.
      const trigger = page.getByTestId(`${kind}-actions`)
      const heading = page.getByTestId(`${kind}-heading`)
      expect(
        Math.abs((await trigger.boundingBox())!.y - (await heading.boundingBox())!.y),
      ).toBeLessThan(40)
      await trigger.click()
      await expect(page.getByTestId(`${kind}-delete`)).toHaveClass(/actionmenu__item--danger/)
      await expect(page.getByTestId(`${kind}-delete`)).toContainText('Delete')
      await page.keyboard.press('Escape')
    }

    // A list row opens from anywhere on it, and its one link is named by the title alone.
    await page.goto(`/app/universes/${universeId}/world-rules`)
    const ruleRow = page.getByTestId('world-rule-row')
    await expect(ruleRow.getByRole('link')).toHaveAccessibleName('The dead do not return')
    const box = (await ruleRow.boundingBox())!
    await ruleRow.click({ position: { x: box.width - 12, y: box.height - 12 } })
    await page.waitForURL(new RegExp(`/world-rules/${rule.id}$`))
  })

  test('a family stacks by generation on a phone, and a connection being added asks before another family opens', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)
    const base = `/api/universes/${universeId}`
    const bore = (await api<{ id: string }>(page, 'POST', `${base}/relationship-types`, {
      name: 'bore',
      inverseName: 'born to',
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic: 1,
    }))!.id
    const raised = (await api<{ id: string }>(page, 'POST', `${base}/relationship-types`, {
      name: 'raised',
      inverseName: 'raised by',
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic: 2,
    }))!.id
    const child = await seedEntity(
      page,
      universeId,
      'Mara Varn, Keeper of the Eastern Lamps and Last Daughter of the Guild',
    )
    const mother = await seedEntity(page, universeId, 'Ilsa Varn')
    const guardian = await seedEntity(page, universeId, 'رامي الحداد')
    const grand = await seedEntity(page, universeId, 'נועה בת־אור')
    const link = (kind: string, parent: string, target: string) =>
      api(page, 'POST', `${base}/relationships`, {
        relationshipTypeId: kind,
        sourceEntityId: parent,
        targetEntityId: target,
        canonStatus: 2,
        startDate: null,
        endDate: null,
        notes: null,
      })
    await link(bore, mother, child)
    await link(raised, guardian, child)
    await link(bore, grand, mother)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/app/universes/${universeId}/family-tree/${child}`)
    await expect(page.getByTestId('family-tree')).toBeVisible()

    // Every generation's name and every card is whole on the screen: nothing scrolls sideways, the page or the tree.
    expect(await scrollsSideways(page)).toBe(false)
    const scroller = page.locator('.familytree__scroll')
    expect(await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    for (const label of await page.locator('.familytree__rowlabel').all()) {
      const box = (await label.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(391)
    }
    for (const card of await page.locator('.familynode').all()) {
      const box = (await card.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(391)
    }

    // One card a generation: the grandparent above the parents, the parents above the entry in focus.
    const top = async (name: string) =>
      (await page.getByTestId(`family-node-${name}`).boundingBox())!.y
    expect(await top('נועה בת־אור')).toBeLessThan(await top('Ilsa Varn'))
    expect(await top('Ilsa Varn')).toBeLessThan(
      await top('Mara Varn, Keeper of the Eastern Lamps and Last Daughter of the Guild'),
    )

    // What each connection is, in words: biological and adoptive as configured, the name in its own direction.
    await expectDetails(page, 'Ilsa Varn', 'Biological parent')
    await expectDetails(page, 'رامي الحداد', 'Adoptive parent')
    await expect(page.getByTestId('family-node-رامي الحداد').locator('bdi').first()).toHaveText(
      'رامي الحداد',
    )

    // A connection being added is asked about before another family opens, and staying keeps it.
    const asked: string[] = []
    const answers: boolean[] = []
    await answerConfirms(page, () => answers.shift() ?? false, asked)
    await page.getByTestId('add-family-link').click()
    const form = page.getByTestId('family-link-form')
    await form.getByTestId('family-link-side').selectOption('child')
    await page.getByTestId('family-focus-Ilsa Varn').click()
    await expect.poll(() => asked.length).toBe(1)
    await expect
      .poll(() => asked[0])
      .toBe('This family connection has not been added. Leave without saving it?')
    await expect(form).toBeVisible()
    await expect(form.getByTestId('family-link-side')).toHaveValue('child')

    // Put back, it is nothing to lose; changed again, Cancel asks once.
    await form.getByTestId('family-link-side').selectOption('parent')
    await form.getByTestId('family-link-side').selectOption('child')
    answers.push(true)
    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toEqual([asked[0], DISCARD])

    // With nothing unsaved, another family opens at once.
    await page.getByTestId('family-focus-Ilsa Varn').click()
    await page.waitForURL(new RegExp(`/family-tree/${mother}$`))
    await expect.poll(() => asked).toHaveLength(2)
  })
})
