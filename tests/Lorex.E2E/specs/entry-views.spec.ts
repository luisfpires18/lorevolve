import { expect, test, type Page } from '@playwright/test'

/**
 * An entry's three views, and the header above them.
 *
 * The invariants: every action on the entry is in its header, reachable without scrolling however long the entry
 * has grown; each view is an address, so it reloads, it is linkable and the browser's Back leaves it; nothing is
 * shown on two views at once; and unsaved writing is asked about before a view is left, exactly as before, once.
 *
 * Also the duplicate relation refusal as an author meets it, from both places a relation can be made.
 * Credentials here are obviously synthetic.
 */
const PASSWORD = 'Test-password-123!'

const Canon = { idea: 0, draft: 1, canon: 2 } as const
const Family = { biological: 1 } as const

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
}

async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

// ---------- Setup through the API, for what a test is not about ----------

async function characterTypeId(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return types.find((type) => type.name === 'Character')!.id
}

async function seedEntity(
  page: Page,
  universeId: string,
  name: string,
  summary: string | null = null,
) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: await characterTypeId(page, universeId),
      name,
      summary,
      canonStatus: Canon.canon,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedKind(page: Page, universeId: string, name: string, familySemantic = 0) {
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName: `${name}, the other way`,
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
  return (await response.json()).id as string
}

/** A long article, so the entry is as tall as a real one and nothing can hide below it. */
async function seedArticle(page: Page, universeId: string, entityId: string) {
  const paragraph =
    'The Hearth had by then worked iron for eleven generations, and every one of them had written the same thing down in a slightly different hand. '
  const response = await page.request.put(
    `/api/universes/${universeId}/entities/${entityId}/article`,
    {
      data: {
        content: JSON.stringify({
          type: 'doc',
          content: Array.from({ length: 20 }, () => ({
            type: 'paragraph',
            content: [{ type: 'text', text: paragraph.repeat(3) }],
          })),
        }),
        expectedVersion: 0,
      },
    },
  )
  expect(response.status()).toBe(200)
}

function entryUrl(universeId: string, entityId: string) {
  return `/app/universes/${universeId}/lore/${entityId}`
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('entry views', () => {
  test('an entry opens on its article, and Relations and History are addresses of their own', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Weapons of Order '))
    const akron = await seedEntity(
      page,
      universeId,
      'Akron Wright of the Seventh Hearth',
      'Smith, magistrate and reluctant father of the Wright line.',
    )
    const aaron = await seedEntity(page, universeId, 'Aaron Wright')
    const bore = await seedKind(page, universeId, 'bore', Family.biological)
    await seedLink(page, universeId, bore, akron, aaron)
    await seedArticle(page, universeId, akron)

    const url = entryUrl(universeId, akron)
    await page.goto(url)

    // ---- The header carries the identity and every action on the entry ----

    await expect(page.getByTestId('entry-name')).toHaveText('Akron Wright of the Seventh Hearth')
    await expect(page.getByTestId('entry-type')).toHaveText('Character')
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    // Unscrolled, at the top of an entry with a long article: all three, on screen.
    const viewport = page.viewportSize()!
    for (const testId of ['edit-entity', 'entity-family-tree', 'entity-actions']) {
      const box = (await page.getByTestId(testId).boundingBox())!
      expect(box.y + box.height, `${testId} is below the fold`).toBeLessThanOrEqual(viewport.height)
    }

    // The entry is taller than the screen, which is what makes the line above worth asserting.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
      viewport.height,
    )

    // Move to Trash is there and named, but kept out of the way: last, in the entry's ⋯ menu.
    await expect(page.getByTestId('trash-entity')).toHaveCount(0)
    await expect(page.getByTestId('entity-actions')).toHaveAccessibleName(
      'More actions for Akron Wright of the Seventh Hearth',
    )
    await page.getByTestId('entity-actions').click()
    await expect(page.getByTestId('trash-entity')).toHaveText(/Move to Trash/)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('trash-entity')).toHaveCount(0)

    // ---- Three views, three addresses ----

    // They are links in a labelled navigation, not a tablist: each one is somewhere to go.
    const views = page.getByTestId('entry-views')
    await expect(views).toHaveAttribute('aria-label', 'Entry views')
    await expect(views.getByRole('link')).toHaveCount(3)
    await expect(page.getByTestId('entry-view-article')).toHaveAttribute('aria-current', 'page')

    // The default address is the article, and the article is only there.
    await expect(page.getByTestId('article')).toBeVisible()
    await expect(page.getByTestId('relationship-list')).toHaveCount(0)
    await expect(page.getByTestId('history-list')).toHaveCount(0)

    await page.getByTestId('entry-view-relations').click()
    await page.waitForURL(`${url}/relations`)
    await expect(page.getByTestId('entry-view-relations')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('relationship-list')).toContainText('Aaron Wright')
    await expect(page.getByTestId('article')).toHaveCount(0)
    await expect(page.getByTestId('history-list')).toHaveCount(0)

    await page.getByTestId('entry-view-history').click()
    await page.waitForURL(`${url}/history`)
    await expect(page.getByTestId('entry-view-history')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('history-list')).toContainText('Created')
    await expect(page.getByTestId('article')).toHaveCount(0)
    await expect(page.getByTestId('relationship-list')).toHaveCount(0)

    // ---- Each one reloads, and the browser's Back and Forward work ----

    await page.reload()
    await expect(page).toHaveURL(`${url}/history`)
    await expect(page.getByTestId('history-list')).toContainText('Created')
    await expect(page.getByTestId('entry-name')).toHaveText('Akron Wright of the Seventh Hearth')

    await page.goBack()
    await expect(page).toHaveURL(`${url}/relations`)
    await expect(page.getByTestId('relationship-list')).toContainText('Aaron Wright')

    await page.goBack()
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('article')).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(`${url}/relations`)

    // And a link typed or shared, with nothing before it.
    await page.goto(`${url}/relations`)
    await expect(page.getByTestId('relationship-list')).toContainText('Aaron Wright')
    expect(await scrollsSideways(page)).toBe(false)
  })

  test('Edit is pressed from any view and opens the form where the details it edits are shown', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Ironvale '))
    const veyra = await seedEntity(page, universeId, 'Veyra Alkenmoor', 'Third daughter.')

    await page.goto(`${entryUrl(universeId, veyra)}/history`)
    await page.getByTestId('edit-entity').click()

    // The form edits the picture, the facts and the summary, so it opens on the view that shows them.
    await page.waitForURL(entryUrl(universeId, veyra))
    await expect(page.getByLabel('Summary')).toBeVisible()

    // While it is open, the entry's own navigation steps aside: one editor at a time.
    await expect(page.getByTestId('entry-views')).toHaveCount(0)

    await page.getByLabel('Summary').fill('Third daughter of a fraying house.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toHaveText('Third daughter of a fraying house.')
    await expect(page.getByTestId('entry-views')).toBeVisible()
  })

  test('unsaved article text is asked about once before a view is left, and kept when the author stays', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Gatewatch '))
    const warden = await seedEntity(page, universeId, 'Gatewarden')
    const url = entryUrl(universeId, warden)

    await page.goto(url)
    await page.getByTestId('article-write').click()
    await page.getByTestId('lore-editor').focus()
    await page.keyboard.type('Half a sentence about the wall')
    await expect(page.getByTestId('article-status')).toHaveText('Unsaved changes')

    // Staying: one question, the address unchanged, and every word still there.
    const asked: string[] = []
    page.once('dialog', (dialog) => {
      asked.push(dialog.message())
      void dialog.dismiss()
    })
    await page.getByTestId('entry-view-relations').click()
    await expect.poll(() => asked.length).toBe(1)
    expect(asked[0]).toContain('“Gatewarden” has unsaved changes')
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('lore-editor')).toContainText('Half a sentence about the wall')

    // History asks the same question, once.
    page.once('dialog', (dialog) => {
      asked.push(dialog.message())
      void dialog.dismiss()
    })
    await page.getByTestId('entry-view-history').click()
    await expect.poll(() => asked.length).toBe(2)
    await expect(page).toHaveURL(url)

    // While the article is being written the entry's own tools step aside: one editor at a time,
    // which is why pressing Edit cannot put a second form on the page beside it.
    await expect(page.getByTestId('edit-entity')).toHaveCount(0)
    await expect(page.getByTestId('entity-family-tree')).toHaveCount(0)
    await expect(page.getByTestId('entity-actions')).toHaveCount(0)

    // Leaving: asked once, not twice, and the view changes.
    page.once('dialog', (dialog) => {
      asked.push(dialog.message())
      void dialog.accept()
    })
    await page.getByTestId('entry-view-relations').click()
    await page.waitForURL(`${url}/relations`)
    expect(asked, 'the author was asked more than once about one departure').toHaveLength(3)

    // Gone with the article that was left, and the entry's tools are back where they belong. So the
    // one way out of the entry that is not a link - Move to Trash - can never be taken while there
    // is unsaved writing for the guard to miss: it is not on the page until the writing is done with.
    await expect(page.getByTestId('entity-family-tree')).toBeVisible()
    await expect(page.getByTestId('entity-actions')).toBeVisible()
  })

  test('an entry with no picture has no empty column where one would be', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Plainspoke '))
    const bare = await seedEntity(page, universeId, 'An entry with nothing pinned to it')

    await page.goto(entryUrl(universeId, bare))
    await expect(page.getByTestId('entry-image')).toHaveCount(0)

    // The article starts where the header ends, with no reserved space above it.
    const bar = (await page.getByTestId('entry-views').boundingBox())!
    const article = (await page.getByTestId('article').boundingBox())!
    expect(article.y - (bar.y + bar.height)).toBeLessThan(80)
    expect(await scrollsSideways(page)).toBe(false)
  })

  test('a search result and a family tree both open the entry on its article', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Findable '))
    const mara = await seedEntity(page, universeId, 'Mara Wright', 'Keeper of the second forge.')
    const lia = await seedEntity(page, universeId, 'Lia Wright')
    const bore = await seedKind(page, universeId, 'bore', Family.biological)
    await seedLink(page, universeId, bore, mara, lia)

    // The universe's search bar, from another screen entirely.
    await page.goto(`/app/universes/${universeId}/timeline`)
    const answered = page.waitForResponse(
      (response) =>
        response.url().includes('/search?') &&
        new URL(response.url()).searchParams.get('q') === 'Mara',
    )
    await page.getByTestId('universe-search-input').fill('Mara')
    await answered
    await page.getByTestId('universe-search-result').first().click()
    await page.waitForURL(new RegExp(`/lore/${mara}(#.*)?$`))
    await expect(page.getByTestId('entry-view-article')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('article')).toBeVisible()

    // And the family tree's Open entry.
    await page.goto(`/app/universes/${universeId}/family-tree/${mara}`)
    await page
      .getByTestId('family-node-Lia Wright')
      .getByRole('link', { name: 'Open entry' })
      .click()
    await page.waitForURL(entryUrl(universeId, lia))
    await expect(page.getByTestId('entry-name')).toHaveText('Lia Wright')
    await expect(page.getByTestId('article')).toBeVisible()
  })

  test('the same relation cannot be added twice, from Relations or from the family tree', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wright '))
    const akron = await seedEntity(page, universeId, 'Akron Wright')
    const aaron = await seedEntity(page, universeId, 'Aaron Wright')
    const bore = await seedKind(page, universeId, 'bore', Family.biological)
    await seedLink(page, universeId, bore, akron, aaron)

    // ---- From the entry's Relations view ----

    await page.goto(`${entryUrl(universeId, akron)}/relations`)
    await expect(page.getByTestId('relationship-list').locator('> li')).toHaveCount(1)

    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'bore' })
    await page.getByTestId('picker-input').click()
    await page.getByTestId('picker-input').fill('Aaron')
    await page.getByTestId('picker-option-Aaron Wright').click()
    await page.getByTestId('save-relationship').click()

    await expect(page.getByTestId('relationship-error')).toContainText('already exists')
    await expect(page.getByTestId('relationship-list').locator('> li')).toHaveCount(1)

    // ---- From the family tree's Add family connection ----

    await page.goto(`/app/universes/${universeId}/family-tree/${akron}`)
    await expect(page.getByTestId('family-node-Aaron Wright')).toHaveCount(1)

    await page.getByTestId('add-family-link').click()
    const form = page.getByTestId('family-link-form')
    await form.getByTestId('family-link-kind').selectOption({ label: 'bore (biological parent)' })
    await form.getByTestId('family-link-side').selectOption({ label: 'Akron Wright is the parent' })
    await form.getByTestId('picker-input').click()
    await form.getByTestId('picker-input').fill('Aaron')
    await form.getByTestId('picker-option-Aaron Wright').click()
    await page.getByTestId('save-family-link').click()

    await expect(page.getByTestId('family-link-error')).toContainText('already exists')

    // Nothing was written, so there is still one child and still one connection.
    await page.reload()
    await expect(page.getByTestId('family-node-Aaron Wright')).toHaveCount(1)

    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${akron}/relationships`)
    ).json()) as unknown[]
    expect(stored).toHaveLength(1)
  })
})
