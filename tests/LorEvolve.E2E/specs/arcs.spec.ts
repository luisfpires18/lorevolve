import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'
import { chooseFromMenu, openMenuFor } from './support/rowMenu'
import { post, signUp, unique, world } from './support/trash'

/**
 * A story's structure, end to end (ADR 0070): arcs holding chapters, chapters holding scenes, and each scene's own beats.
 * Each test registers its own account and builds its own universe through the API, so nothing depends on another test.
 *
 * The invariants under test: a chapter is in one arc or none, its number restarts in each arc, and moving it moves its
 * scenes with it; deleting an arc deletes no chapter; a scene's beats are its own, kept in the order set in its drawer,
 * and shown on the scene wherever it is drawn.
 */

interface Seeded {
  universeId: string
  storyId: string
  story: string
}

async function seedStory(page: Page, title: string): Promise<Seeded> {
  const universeId = await world(page)
  const storyId = await post(page, `/api/universes/${universeId}/stories`, {
    title,
    premise: null,
    status: 1,
  })
  return { universeId, storyId, story: `/api/universes/${universeId}/stories/${storyId}` }
}

const chapter = (page: Page, s: Seeded, title: string, plotArcId: string | null = null) =>
  post(page, `${s.story}/chapters`, { title, summary: null, notes: null, plotArcId })

const scene = (page: Page, s: Seeded, title: string, chapterId: string | null = null) =>
  post(page, `${s.story}/scenes`, {
    title,
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
    chapterId,
  })

const arc = (page: Page, s: Seeded, title: string, description: string | null = null) =>
  post(page, `${s.story}/plot-arcs`, { title, description, notes: null })

/** Each arc, chapter and scene as the Scenes view draws it, in page order. */
async function structure(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="arc-heading"], [data-testid="chapter-heading"], [data-testid="scene"]',
      ),
    ).map((element) =>
      element.dataset.testid === 'scene'
        ? `  ${element.dataset.title}`
        : (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  )
}

async function scrollsSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
}

test.describe('arcs', () => {
  test('an author groups chapters into arcs, numbered again in each, and moving or deleting an arc keeps every scene', async ({
    page,
  }) => {
    await signUp(page)
    const s = await seedStory(page, unique('The Great Forging '))
    const pestilence = await arc(
      page,
      s,
      'Pestilence Weapon',
      'The weapon the Assembly carries home.',
    )
    const tragic = await chapter(page, s, 'Tragic Expedition', pestilence)
    const loose = await chapter(page, s, 'Loose ends')
    const jungle = await chapter(page, s, 'The Jungle Conflict')
    await scene(page, s, "The King's Orders", tragic)
    await scene(page, s, 'Sylvara Border Trail', jungle)

    await page.goto(`/app/universes/${s.universeId}/stories/${s.storyId}`)
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Chapter 1: Loose ends',
        'Chapter 2: The Jungle Conflict',
        '  Sylvara Border Trail',
        'Arc 1: Pestilence Weapon',
        'Chapter 1: Tragic Expedition',
        "  The King's Orders",
      ])
    await expect(page.getByTestId('arc-description')).toHaveText(
      'The weapon the Assembly carries home.',
    )

    // Into the arc, last there; its scene goes with it.
    const jungleSection = page.locator(`#chapter-${jungle}`)
    await openMenuFor(jungleSection, 'chapter-move-to-arc')
    await expect(jungleSection.getByTestId('chapter-move-to-arc')).toHaveText([
      'Move to Arc 1: Pestilence Weapon',
    ])
    await jungleSection.getByTestId('chapter-move-to-arc').click()
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Chapter 1: Loose ends',
        'Arc 1: Pestilence Weapon',
        'Chapter 1: Tragic Expedition',
        "  The King's Orders",
        'Chapter 2: The Jungle Conflict',
        '  Sylvara Border Trail',
      ])

    // A second arc from the toolbar, and a chapter started in it.
    await page.getByTestId('new-arc').click()
    await page.getByTestId('plot-arc-title-input').fill('Obsidia and Azure')
    await page.getByTestId('save-plot-arc').click()
    await expect(page.getByTestId('plot-arc-form')).toHaveCount(0)
    await page
      .locator('[data-testid="arc"][data-title="Obsidia and Azure"]')
      .getByTestId('arc-new-chapter')
      .click()
    await page.getByTestId('chapter-title-input').fill('Unitas')
    await page.getByTestId('save-chapter').click()
    await expect(page.getByTestId('chapter-form')).toHaveCount(0)

    // The second arc goes first.
    await chooseFromMenu(
      page.locator('[data-testid="arc"][data-title="Obsidia and Azure"]'),
      'arc-move-up',
    )
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Chapter 1: Loose ends',
        'Arc 1: Obsidia and Azure',
        'Chapter 1: Unitas',
        'Arc 2: Pestilence Weapon',
        'Chapter 1: Tragic Expedition',
        "  The King's Orders",
        'Chapter 2: The Jungle Conflict',
        '  Sylvara Border Trail',
      ])

    // Out of every arc, and back to the chapters in none.
    await chooseFromMenu(page.locator(`#chapter-${tragic}`), 'chapter-move-to-arc')
    await expect.poll(() => structure(page)).not.toContain('Chapter 1: Tragic Expedition')

    // Deleting an arc takes no chapter and no scene: they are in no arc while it is in the Trash.
    await chooseFromMenu(
      page.locator('[data-testid="arc"][data-title="Pestilence Weapon"]'),
      'arc-delete',
    )
    await acceptConfirm(page)
    await expect(page.locator('[data-testid="arc"][data-title="Pestilence Weapon"]')).toHaveCount(0)
    await expect(page.getByTestId('scene')).toHaveCount(2)
    await expect(page.locator(`#chapter-${jungle}`)).toBeVisible()
    await expect(page.locator(`#chapter-${loose}`)).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('scene')).toHaveCount(2)
    await expect(page.getByTestId('arc')).toHaveCount(1)
  })

  test("a scene's beats are written, reordered and removed in its drawer, and shown wherever the scene is", async ({
    page,
  }) => {
    await signUp(page)
    const s = await seedStory(page, unique('Beats '))
    const council = await scene(page, s, 'The Council')

    await page.goto(`/app/universes/${s.universeId}/stories/${s.storyId}`)
    const card = page.locator(`#scene-${council}`)
    await expect(card.getByTestId('scene-beats')).toHaveCount(0)

    await card.getByTestId('scene-edit').click()
    const form = page.getByTestId('scene-form')
    await form.getByTestId('scene-beat-add').click()
    await expect(form.getByTestId('scene-beat-title').first()).toBeFocused()
    await page.keyboard.type('Marcus instructs Theo')
    await form.getByTestId('scene-beat-add').click()
    await expect(form.getByTestId('scene-beat-title').nth(1)).toBeFocused()
    await page.keyboard.type('Marcus reads orders')
    await form.getByTestId('scene-beat-note').nth(1).fill('Sealed by the king.')
    await form.getByTestId('scene-beat-up').nth(1).click()
    await expect(form.getByTestId('scene-beat-title').nth(0)).toHaveValue('Marcus reads orders')
    await expect(form.getByTestId('scene-beat-title').nth(1)).toHaveValue('Marcus instructs Theo')

    // A row left empty is no beat.
    await form.getByTestId('scene-beat-add').click()
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)

    await expect(card.getByTestId('scene-beat')).toHaveText([
      'Marcus reads ordersSealed by the king.',
      'Marcus instructs Theo',
    ])

    // The drawer counts beats as a change: Cancel asks; removing one and saving keeps the other.
    await card.getByTestId('scene-edit').click()
    await form.getByTestId('scene-beat-remove').first().click()
    await page.getByTestId('cancel-scene').click()
    await expect(page.getByTestId('confirm-dialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-cancel').click()
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)
    await expect(card.getByTestId('scene-beat')).toHaveText(['Marcus instructs Theo'])

    // The manuscript shows the same beats above the prose.
    await card.getByTestId('scene-write').click()
    await expect(page.getByTestId('manuscript-beat')).toHaveText(['Marcus instructs Theo'])

    await page.reload()
    await expect(page.getByTestId('manuscript-beat')).toHaveText(['Marcus instructs Theo'])
  })

  test('an existing chapter joins an arc from its drawer, its scenes with it, and a beat is added from the scene menu', async ({
    page,
  }) => {
    await signUp(page)
    const s = await seedStory(page, unique('Joining '))
    await arc(page, s, 'The Pestilence War')
    const tragic = await chapter(page, s, 'The Tragic Expedition')
    const orders = await scene(page, s, "The King's Orders", tragic)

    await page.goto(`/app/universes/${s.universeId}/stories/${s.storyId}`)
    // The empty arc says how a chapter gets into it.
    await expect(page.getByTestId('arc-empty')).toContainText('Edit chapter, then choose')

    // Edit chapter: the Arc field, on no arc, moves the chapter and its scene into the arc.
    await chooseFromMenu(page.locator(`#chapter-${tragic}`), 'chapter-edit')
    const select = page.getByTestId('chapter-arc-select')
    await expect(select).toHaveValue('')
    await select.selectOption({ label: 'Arc 1: The Pestilence War' })
    await page.getByTestId('save-chapter').click()
    await expect(page.getByTestId('chapter-form')).toHaveCount(0)
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Arc 1: The Pestilence War',
        'Chapter 1: The Tragic Expedition',
        "  The King's Orders",
      ])

    // Reopened, the drawer names the arc it is in; nothing changed asks nothing.
    await chooseFromMenu(page.locator(`#chapter-${tragic}`), 'chapter-edit')
    await expect(page.getByTestId('chapter-arc-select')).not.toHaveValue('')
    await page.getByTestId('cancel-chapter').click()
    await expect(page.getByTestId('chapter-form')).toHaveCount(0)

    // Add beat from the scene's menu: the drawer opens on a new beat row, focused.
    const card = page.locator(`#scene-${orders}`)
    await chooseFromMenu(card, 'scene-add-beat')
    const form = page.getByTestId('scene-form')
    await expect(form.getByTestId('scene-beat-title').last()).toBeFocused()
    await page.keyboard.type('Marcus reads orders')
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)
    await expect(card.getByTestId('scene-beat')).toHaveText(['Marcus reads orders'])

    // Opened that way and left empty, the drawer has nothing to save and closes without asking.
    await chooseFromMenu(card, 'scene-add-beat')
    await expect(form.getByTestId('scene-beat-title')).toHaveCount(2)
    await page.getByTestId('cancel-scene').click()
    await expect(form).toHaveCount(0)
    await expect(card.getByTestId('scene-beat')).toHaveText(['Marcus reads orders'])
  })

  test('arcs, chapters and beats stay usable from a phone to a wide desktop', async ({ page }) => {
    await signUp(page)
    const s = await seedStory(page, unique('Wide '))
    const long = await arc(
      page,
      s,
      'An arc whose title runs on past where any sensible heading would stop, and then some',
      'Its description runs on as well, long enough to wrap on a phone and hold a measure on a desktop.',
    )
    const inArc = await chapter(
      page,
      s,
      'A chapter whose title also runs on past any sensible heading',
      long,
    )
    const first = await scene(
      page,
      s,
      'A scene with a title long enough to wrap onto a second line',
      inArc,
    )
    const read = (await (await page.request.get(`${s.story}/scenes/${first}`)).json()) as {
      version: number
    }
    const saved = await page.request.put(`${s.story}/scenes/${first}`, {
      data: {
        title: 'A scene with a title long enough to wrap onto a second line',
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId: inArc,
        expectedVersion: read.version,
        beats: [
          {
            title:
              'A beat whose title is long enough to wrap onto a second line on any narrow screen',
            note: null,
          },
          { title: 'Second', note: 'A note under it.' },
        ],
      },
    })
    expect(saved.ok()).toBe(true)

    for (const width of [360, 768, 1440]) {
      const edge = width + 1
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/app/universes/${s.universeId}/stories/${s.storyId}`)
      await expect(page.getByTestId('arc')).toHaveCount(1)
      expect(await scrollsSideways(page), `story at ${width}px`).toBe(false)

      const arcSection = page.getByTestId('arc')
      for (const control of ['arc-heading', 'arc-new-chapter', 'arc-actions']) {
        const box = await arcSection.getByTestId(control).boundingBox()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }
      for (const beat of await page.getByTestId('scene-beat').all()) {
        const box = await beat.boundingBox()
        expect(box!.x + box!.width, `beat at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // The drawer keeps its beats inside it.
      await page.getByTestId('scene-edit').click()
      const tools = page.getByTestId('scene-beat-remove').first()
      await tools.scrollIntoViewIfNeeded()
      await expect
        .poll(async () => {
          const box = await tools.boundingBox()
          return box ? box.x + box.width : Number.POSITIVE_INFINITY
        })
        .toBeLessThanOrEqual(edge)
      expect(await scrollsSideways(page), `scene form at ${width}px`).toBe(false)
      await page.getByTestId('cancel-scene').click()
      await expect(page.getByTestId('scene-form')).toHaveCount(0)
    }
  })
})
