import { expect, test, type Page } from '@playwright/test'

/**
 * A System's machine on the System editor's Machine tab (#358, ADR 0073): states as cards and transitions as arrows on
 * a canvas, the same as rows under it, each opened in a drawer, and one whole save under the System's version.
 *
 * What these tests hold is that nothing drawn is lost: a reload keeps every state, move and transition; the rows do all
 * the canvas does from the keyboard alone; a save over a System changed elsewhere keeps the drawing until the author
 * chooses; and a name save after a machine save is not refused by it.
 *
 * Each test registers its own account and builds what it needs through the API.
 */
const PASSWORD = 'Test-password-123!'

interface MachineState {
  id: string
  name: string
  value: string
  initial: boolean
  x: number
  y: number
}

interface Machine {
  version: number
  binding: { subjectType: string; attribute: string } | null
  states: MachineState[]
  transitions: {
    id: string
    fromStateId: string
    toStateId: string
    label: string | null
    guardRuleId: string | null
  }[]
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('machinist')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

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

/** A universe and one System in it, with the address of its Machine tab. */
async function seedSystem(page: Page) {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Machined '),
    description: null,
    accentColor: '#4f6bd6',
  })
  const name = unique('Sleep ')
  const system = await api<{ id: string }>(page, 'POST', `/api/universes/${universe.id}/systems`, {
    name,
    summary: '',
  })
  const systemUrl = `/api/universes/${universe.id}/systems/${system.id}`
  return {
    universeId: universe.id,
    systemId: system.id,
    name,
    systemUrl,
    address: `/app/universes/${universe.id}/world-logic/systems/${system.id}?tab=machine`,
  }
}

function machineOf(page: Page, systemUrl: string) {
  return api<Machine>(page, 'GET', `${systemUrl}/machine`)
}

/** Writes a machine through the API, under the System's current version. */
async function seedMachine(
  page: Page,
  systemUrl: string,
  states: Omit<MachineState, 'id'>[],
  transitions: { from: number; to: number; label?: string; guard?: string }[] = [],
) {
  const { version } = await machineOf(page, systemUrl)
  const ids = states.map(() => crypto.randomUUID())
  return api<Machine>(page, 'PUT', `${systemUrl}/machine`, {
    schemaVersion: 1,
    binding: { subjectType: 'Character', attribute: 'Mood' },
    states: states.map((state, index) => ({ ...state, id: ids[index] })),
    transitions: transitions.map((transition) => ({
      id: crypto.randomUUID(),
      fromStateId: ids[transition.from],
      toStateId: ids[transition.to],
      label: transition.label ?? null,
      guardRuleId: transition.guard ?? null,
    })),
    expectedVersion: version,
  })
}

async function seedRule(page: Page, universeId: string, title: string) {
  return (
    await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/system-rules`, {
      title,
      description: null,
    })
  ).id
}

/** Renames the System through the API, which moves its version on as any edit elsewhere would. */
async function renameElsewhere(page: Page, systemUrl: string, name: string) {
  const system = await api<{ version: number }>(page, 'GET', systemUrl)
  await api(page, 'PUT', systemUrl, {
    name,
    summary: '',
    projectId: null,
    expectedVersion: system.version,
  })
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="machine-state"][data-name="${name}"]`)
}

function handle(page: Page, name: string) {
  return page.getByRole('button', { name: `Draw a transition from ${name}`, exact: true })
}

/** Presses Save changes and waits for the machine PUT to answer. */
async function saveMachine(page: Page) {
  const answered = page.waitForResponse(
    (response) => response.url().endsWith('/machine') && response.request().method() === 'PUT',
  )
  await page.getByTestId('machine-save').click()
  return answered
}

async function addStateFromRows(page: Page, name: string, value: string) {
  await page.getByTestId('machine-add-state').click()
  await page.getByTestId('machine-state-name').fill(name)
  await page.getByTestId('machine-state-value').fill(value)
  await page.getByTestId('machine-state-apply').click()
  await expect(page.getByTestId('machine-state-drawer')).toBeHidden()
}

async function centreOf(page: Page, name: string) {
  const box = (await card(page, name).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('System machine', () => {
  test('states are created, moved, renamed and deleted on the canvas, and a reload keeps them', async ({
    page,
  }) => {
    await signUp(page)
    const system = await seedSystem(page)
    await seedMachine(page, system.systemUrl, [])

    await page.goto(system.address)
    await expect(page.getByTestId('machine-empty')).toBeVisible()

    await addStateFromRows(page, 'Dormant', 'dormant')
    await addStateFromRows(page, 'Awake', 'awake')
    await addStateFromRows(page, 'Restless', 'restless')
    await expect(page.getByTestId('machine-state')).toHaveCount(3)
    expect((await saveMachine(page)).ok()).toBe(true)

    // The pointer drags a state; pressing another opens it to be renamed.
    const awake = card(page, 'Awake')
    // The save bar sits at the foot of the page: bring the canvas back into view, since the mouse does not scroll.
    await awake.scrollIntoViewIfNeeded()
    const before = (await awake.boundingBox())!
    await page.mouse.move(before.x + 20, before.y + 20)
    await page.mouse.down()
    await page.mouse.move(before.x + 80, before.y + 140, { steps: 8 })
    await page.mouse.up()
    const beforeDrag = (await machineOf(page, system.systemUrl)).states
    const awakeLeft = await awake.evaluate((element) => element.style.left)

    await card(page, 'Dormant').click()
    await expect(page.getByTestId('machine-state-drawer')).toBeVisible()
    await page.getByTestId('machine-state-name').fill('Sleeping')
    await page.getByTestId('machine-state-apply').click()
    expect((await saveMachine(page)).ok()).toBe(true)

    await page.reload()
    await expect(card(page, 'Sleeping')).toBeVisible()
    await expect(card(page, 'Dormant')).toHaveCount(0)
    expect(await card(page, 'Awake').evaluate((element) => element.style.left)).toBe(awakeLeft)
    const saved = (await machineOf(page, system.systemUrl)).states
    const awakeSaved = saved.find((state) => state.name === 'Awake')!
    const awakeBefore = beforeDrag.find((state) => state.name === 'Awake')!
    expect(awakeSaved.y).toBeGreaterThan(awakeBefore.y)

    await card(page, 'Restless').click()
    await page.getByTestId('machine-state-delete').click()
    await page.getByRole('button', { name: 'Delete state', exact: true }).click()
    await expect(card(page, 'Restless')).toHaveCount(0)
    expect((await saveMachine(page)).ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('machine-state')).toHaveCount(2)
    const final = await machineOf(page, system.systemUrl)
    expect(final.states.map((state) => state.name).sort()).toEqual(['Awake', 'Sleeping'])
    expect(final.states.filter((state) => state.initial)).toHaveLength(1)
  })

  test('transitions are drawn from a handle, relabelled, re-guarded and deleted, and a reload keeps them', async ({
    page,
  }) => {
    await signUp(page)
    const system = await seedSystem(page)
    const calm = await seedRule(page, system.universeId, 'Calm enough')
    const loud = await seedRule(page, system.universeId, 'Loud enough')
    await seedMachine(page, system.systemUrl, [
      { name: 'Asleep', value: 'asleep', initial: true, x: 0, y: 0 },
      { name: 'Awake', value: 'awake', initial: false, x: 320, y: 0 },
      { name: 'Angry', value: 'angry', initial: false, x: 160, y: 220 },
    ])

    await page.goto(system.address)
    await expect(page.getByTestId('machine-state')).toHaveCount(3)

    // Dragging from a state's handle to another state draws a transition and opens it.
    await handle(page, 'Asleep').scrollIntoViewIfNeeded()
    const from = (await handle(page, 'Asleep').boundingBox())!
    const to = await centreOf(page, 'Awake')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    // Halfway, off the level of both states: a level line has no height, which Playwright reads as hidden.
    await page.mouse.move(to.x - 80, to.y + 60, { steps: 6 })
    await expect(page.getByTestId('machine-pending-line')).toBeVisible()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    const drawer = page.getByTestId('machine-transition-drawer')
    await expect(drawer).toBeVisible()
    await page.getByTestId('machine-transition-label').fill('wake')
    await page.getByTestId('machine-transition-guard').selectOption(calm)
    await page.getByTestId('machine-transition-apply').click()

    // Pressing a handle starts a transition that ends at the next state pressed.
    await handle(page, 'Awake').click()
    await expect(page.getByTestId('machine-connecting')).toBeVisible()
    await card(page, 'Angry').click()
    await expect(drawer).toBeVisible()
    await page.getByTestId('machine-transition-apply').click()

    await expect(page.getByTestId('machine-line')).toHaveCount(2)
    expect((await saveMachine(page)).ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('machine-line')).toHaveCount(2)
    let machine = await machineOf(page, system.systemUrl)
    const names = new Map(machine.states.map((state) => [state.id, state.name]))
    expect(
      machine.transitions.map((transition) => [
        names.get(transition.fromStateId),
        names.get(transition.toStateId),
        transition.label,
        transition.guardRuleId,
      ]),
    ).toEqual([
      ['Asleep', 'Awake', 'wake', calm],
      ['Awake', 'Angry', null, null],
    ])

    // The label opens its transition: relabel and re-guard one, delete the other.
    await page.getByTestId('machine-label').filter({ hasText: 'wake' }).click()
    await page.getByTestId('machine-transition-label').fill('rouse')
    await page.getByTestId('machine-transition-guard').selectOption(loud)
    await page.getByTestId('machine-transition-apply').click()

    await page.getByTestId('machine-label').filter({ hasText: 'No label' }).click()
    await page.getByTestId('machine-transition-delete').click()
    await page.getByRole('button', { name: 'Delete transition', exact: true }).click()
    await expect(page.getByTestId('machine-line')).toHaveCount(1)
    expect((await saveMachine(page)).ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('machine-label')).toHaveText('rouse')
    machine = await machineOf(page, system.systemUrl)
    expect(machine.transitions).toHaveLength(1)
    expect(machine.transitions[0].label).toBe('rouse')
    expect(machine.transitions[0].guardRuleId).toBe(loud)
  })

  test('everything the canvas does is done from the rows by keyboard alone', async ({ page }) => {
    await signUp(page)
    const system = await seedSystem(page)
    await page.goto(system.address)
    await expect(page.getByTestId('machine-empty')).toBeVisible()

    // Nothing below is a click: each step starts from a focused control and goes on by keys.
    await page.getByTestId('machine-binding-open').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('machine-binding-subject-type')).toBeFocused()
    await page.keyboard.type('Character')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Mood')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('machine-binding-drawer')).toBeHidden()

    for (const [name, value] of [
      ['Alpha', 'alpha'],
      ['Beta', 'beta'],
      ['Delta', 'delta'],
    ]) {
      await page.getByTestId('machine-add-state').focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('machine-state-name')).toBeFocused()
      await page.keyboard.type(name)
      await page.keyboard.press('Tab')
      await page.keyboard.type(value)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('machine-state-drawer')).toBeHidden()
    }

    // A transition, from Alpha to Beta by the drawer's own defaults.
    await page.getByTestId('machine-add-transition').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('machine-transition-from')).toBeFocused()
    await page.getByTestId('machine-transition-label').focus()
    await page.keyboard.type('go')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('machine-transition-drawer')).toBeHidden()

    // Move Alpha and rename Beta from their rows.
    const rows = page.getByTestId('machine-state-row')
    await rows.filter({ hasText: 'Alpha' }).getByTestId('machine-state-open').focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('machine-state-x').focus()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('400')
    await page.keyboard.press('Enter')

    await rows.filter({ hasText: 'Beta' }).getByTestId('machine-state-open').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Gamma')
    await page.keyboard.press('Enter')

    // Delete Delta, through its drawer and the confirmation.
    await rows.filter({ hasText: 'Delta' }).getByTestId('machine-state-open').focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('machine-state-delete').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Delete state', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(rows).toHaveCount(2)

    const answered = page.waitForResponse(
      (response) => response.url().endsWith('/machine') && response.request().method() === 'PUT',
    )
    await page.getByTestId('machine-save').focus()
    await page.keyboard.press('Enter')
    expect((await answered).ok()).toBe(true)

    let machine = await machineOf(page, system.systemUrl)
    expect(machine.binding).toEqual({ subjectType: 'Character', attribute: 'Mood' })
    expect(machine.states.map((state) => state.name)).toEqual(['Alpha', 'Gamma'])
    expect(machine.states[0].x).toBe(400)
    expect(machine.states[0].initial).toBe(true)
    expect(machine.transitions.map((transition) => transition.label)).toEqual(['go'])

    // And the transition goes the same way.
    await page.getByTestId('machine-transition-open').focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('machine-transition-delete').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Delete transition', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('machine-transition-row')).toHaveCount(0)
    const again = page.waitForResponse(
      (response) => response.url().endsWith('/machine') && response.request().method() === 'PUT',
    )
    await page.getByTestId('machine-save').focus()
    await page.keyboard.press('Enter')
    expect((await again).ok()).toBe(true)
    machine = await machineOf(page, system.systemUrl)
    expect(machine.transitions).toHaveLength(0)
  })

  test('at 375px the machine is edited from the rows with no sideways page scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signUp(page)
    const system = await seedSystem(page)
    await seedMachine(
      page,
      system.systemUrl,
      [
        { name: 'A state with a rather long name', value: 'first', initial: true, x: 0, y: 0 },
        { name: 'Second', value: 'second', initial: false, x: 320, y: 0 },
        { name: 'Third', value: 'third', initial: false, x: 160, y: 220 },
      ],
      [
        { from: 0, to: 1, label: 'onwards' },
        { from: 1, to: 2 },
      ],
    )

    await page.goto(system.address)
    await expect(page.getByTestId('machine-state')).toHaveCount(3)
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(await overflow()).toBeLessThanOrEqual(1)

    await page
      .getByTestId('machine-state-row')
      .filter({ hasText: 'Second' })
      .getByTestId('machine-state-open')
      .click()
    await page.getByTestId('machine-state-name').fill('Second, renamed')
    await page.getByTestId('machine-state-apply').click()
    expect((await saveMachine(page)).ok()).toBe(true)
    expect(await overflow()).toBeLessThanOrEqual(1)

    const machine = await machineOf(page, system.systemUrl)
    expect(machine.states.map((state) => state.name)).toContain('Second, renamed')
  })

  test('a save over a System changed elsewhere is refused and the drawing is kept', async ({
    page,
  }) => {
    await signUp(page)
    const system = await seedSystem(page)
    await seedMachine(page, system.systemUrl, [
      { name: 'Asleep', value: 'asleep', initial: true, x: 0, y: 0 },
    ])

    await page.goto(system.address)
    await addStateFromRows(page, 'Awake', 'awake')
    await renameElsewhere(page, system.systemUrl, `${system.name} II`)

    expect((await saveMachine(page)).status()).toBe(409)
    await expect(page.getByTestId('machine-conflict')).toBeVisible()
    await expect(page.getByTestId('machine-state-row')).toHaveCount(2)

    // Save mine over it writes the drawing over the newer version.
    const answered = page.waitForResponse(
      (response) => response.url().endsWith('/machine') && response.request().method() === 'PUT',
    )
    await page.getByTestId('machine-keep-mine').click()
    expect((await answered).ok()).toBe(true)
    await expect(page.getByTestId('machine-conflict')).toBeHidden()
    expect((await machineOf(page, system.systemUrl)).states).toHaveLength(2)

    // Load the saved version asks first, then lets the drawing go.
    await addStateFromRows(page, 'Angry', 'angry')
    await renameElsewhere(page, system.systemUrl, `${system.name} III`)
    expect((await saveMachine(page)).status()).toBe(409)
    await expect(page.getByTestId('machine-state-row')).toHaveCount(3)
    await page.getByTestId('machine-load-saved').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('machine-conflict')).toBeHidden()
    await expect(page.getByTestId('machine-state-row')).toHaveCount(2)
    await expect(card(page, 'Angry')).toHaveCount(0)
  })

  test('a refused save marks the row and the field it names', async ({ page }) => {
    await signUp(page)
    const system = await seedSystem(page)
    await seedMachine(page, system.systemUrl, [])

    await page.goto(system.address)
    await addStateFromRows(page, 'First', 'same')
    await addStateFromRows(page, 'Second', 'same')
    expect((await saveMachine(page)).status()).toBe(400)

    await expect(page.getByTestId('machine-error')).toBeVisible()
    const second = page.getByTestId('machine-state-row').filter({ hasText: 'Second' })
    await expect(second.getByTestId('machine-row-error')).toContainText('share this value')
    await expect(
      page
        .getByTestId('machine-state-row')
        .filter({ hasText: 'First' })
        .getByTestId('machine-row-error'),
    ).toHaveCount(0)

    await second.getByTestId('machine-state-open').click()
    await expect(page.getByTestId('machine-state-value')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('machine-state-drawer')).toContainText('share this value')

    // Changing it clears the mark, and the save goes through.
    await page.getByTestId('machine-state-value').fill('other')
    await page.getByTestId('machine-state-apply').click()
    await expect(second.getByTestId('machine-row-error')).toHaveCount(0)
    expect((await saveMachine(page)).ok()).toBe(true)
  })

  test('a name save after a machine save is not refused', async ({ page }) => {
    await signUp(page)
    const system = await seedSystem(page)
    await seedMachine(page, system.systemUrl, [])

    await page.goto(system.address)
    await addStateFromRows(page, 'Asleep', 'asleep')
    expect((await saveMachine(page)).ok()).toBe(true)

    await page.getByTestId('system-editor-tab-details').click()
    await page.getByTestId('system-editor-name').fill(`${system.name} renamed`)
    await page.getByTestId('system-editor-save').click()
    await expect(page.getByTestId('system-editor-announcer')).toHaveText('Saved.')
    await expect(page.getByTestId('system-editor-conflict')).toHaveCount(0)

    // And a machine save after that name save is not refused either.
    await page.getByTestId('system-editor-tab-machine').click()
    await addStateFromRows(page, 'Awake', 'awake')
    expect((await saveMachine(page)).ok()).toBe(true)
  })
})

/**
 * The guard builder (#359): a transition's guard built from blocks in a drawer over the transition's own, saved as a
 * rule definition. What these tests hold is that the builder writes only what the schema describes, never loses what
 * it did not write, and stops a save it knows will be refused before sending anything.
 */
interface RuleDetail {
  id: string
  title: string
  version: number
  schemaVersion: number | null
  condition: unknown
  dependsOn: string[]
  exceptions: unknown
}

const SELF = { subject: 'self' }

function rulesUrl(universeId: string) {
  return `/api/universes/${universeId}/system-rules`
}

/** A rule written over the API, as MCP writes one. */
async function seedConditionRule(
  page: Page,
  universeId: string,
  title: string,
  condition: unknown,
  extra: Record<string, unknown> = {},
) {
  return api<RuleDetail>(page, 'POST', rulesUrl(universeId), {
    title,
    description: 'Written over MCP.',
    schemaVersion: 1,
    condition,
    ...extra,
  })
}

/** A System with two states and one transition, guarded by `guard` when given, opened on its Machine tab. */
async function openTransition(page: Page, guard?: (universeId: string) => Promise<string>) {
  await signUp(page)
  const system = await seedSystem(page)
  const guardRuleId = guard ? await guard(system.universeId) : undefined
  await seedMachine(
    page,
    system.systemUrl,
    [
      { name: 'Asleep', value: 'asleep', initial: true, x: 0, y: 0 },
      { name: 'Awake', value: 'awake', initial: false, x: 320, y: 0 },
    ],
    [{ from: 0, to: 1, label: 'wake', guard: guardRuleId }],
  )
  await page.goto(system.address)
  await page.getByTestId('machine-transition-open').click()
  await expect(page.getByTestId('machine-transition-drawer')).toBeVisible()
  return { ...system, guardRuleId }
}

function builder(page: Page) {
  return page.getByTestId('guard-builder-drawer')
}

function block(page: Page, path: string) {
  return builder(page).locator(`[data-testid="guard-block"][data-path="${path}"]`)
}

/** Every POST and PUT to the rule routes, so a test can say none was sent. */
function ruleWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      /\/system-rules(\/[^/?]+)?$/.test(new URL(request.url()).pathname) &&
      ['POST', 'PUT'].includes(request.method())
    ) {
      writes.push(`${request.method()} ${request.url()}`)
    }
  })
  return writes
}

/** Presses the builder's Save and waits for the rule write it sends. */
async function saveGuard(page: Page, method: 'POST' | 'PUT') {
  const answered = page.waitForResponse(
    (response) =>
      /\/system-rules(\/[^/?]+)?$/.test(new URL(response.url()).pathname) &&
      response.request().method() === method,
  )
  await page.getByTestId('guard-builder-save').click()
  return answered
}

async function optionsOf(select: ReturnType<Page['locator']>) {
  return select
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
}

/** Cancels a builder with edits in it, through the discard question. */
async function discardBuilder(page: Page) {
  await page.getByTestId('guard-builder-cancel').click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(builder(page)).toBeHidden()
}

const compareMood = (op = 'eq') => ({
  kind: 'compare',
  left: { attribute: 'mood', of: SELF },
  op,
  right: { literal: 'calm', type: 'text' },
})

test.describe('Guard builder', () => {
  test('a guard built in the drawer saves as a schema version 1 condition and evaluates', async ({
    page,
  }) => {
    const system = await openTransition(page)
    await page.getByTestId('machine-transition-new-guard').click()
    await expect(builder(page)).toBeVisible()
    await expect(page.getByTestId('guard-builder-title')).toBeFocused()
    await page.getByTestId('guard-builder-title').fill('Calm and rested')

    // The new guard starts as one group holding one comparison.
    await expect(block(page, 'root')).toHaveAttribute('data-kind', 'all')
    await block(page, 'of.0').getByTestId('guard-attribute').fill('mood')
    await block(page, 'of.0').getByTestId('guard-literal-value').fill('calm')

    await page.getByTestId('guard-add').click()
    const second = block(page, 'of.1')
    await second.getByTestId('guard-attribute').fill('energy')
    await second.getByTestId('guard-literal-type').selectOption('number')
    await second.getByTestId('guard-literal-value').fill('3')
    await second.getByTestId('guard-op').selectOption('gte')

    await page.getByTestId('guard-add-kind').selectOption('exists')
    await page.getByTestId('guard-add').click()
    const exists = block(page, 'of.2')
    await exists.getByTestId('guard-source').selectOption('events')
    await exists.getByTestId('guard-add-clause').click()
    await exists.getByTestId('guard-clause-value').fill('rest')

    const created = await saveGuard(page, 'POST')
    expect(created.status()).toBe(201)
    const rule = (await created.json()) as RuleDetail
    await expect(builder(page)).toBeHidden()
    await expect(page.getByTestId('machine-transition-guard')).toHaveValue(rule.id)
    await page.getByTestId('machine-transition-apply').click()
    expect((await saveMachine(page)).ok()).toBe(true)

    const machine = await machineOf(page, system.systemUrl)
    expect(machine.transitions[0].guardRuleId).toBe(rule.id)
    const stored = await api<RuleDetail>(page, 'GET', `${rulesUrl(system.universeId)}/${rule.id}`)
    expect(stored.title).toBe('Calm and rested')
    expect(stored.schemaVersion).toBe(1)
    expect(stored.condition).toEqual({
      kind: 'all',
      of: [
        compareMood(),
        {
          kind: 'compare',
          left: { attribute: 'energy', of: SELF },
          op: 'gte',
          right: { literal: 3, type: 'number' },
        },
        {
          kind: 'exists',
          query: {
            from: 'events',
            where: [{ field: 'kind', op: 'eq', value: 'rest', type: 'text' }],
          },
        },
      ],
    })

    // The existing route evaluates it: without an entry for `self` the honest answer is unknown, never an error.
    const evaluated = await api<{ ruleId: string; schemaVersion: number; outcome: string }>(
      page,
      'POST',
      `${rulesUrl(system.universeId)}/${rule.id}/evaluate`,
    )
    expect(evaluated.ruleId).toBe(rule.id)
    expect(evaluated.schemaVersion).toBe(1)
    expect(['true', 'false', 'unknown']).toContain(evaluated.outcome)
  })

  test('a condition written over MCP opens in the builder and saves unchanged', async ({
    page,
  }) => {
    let seeded: RuleDetail | null = null
    let dependency = ''
    const named = crypto.randomUUID()
    const within = {
      kind: 'within',
      point: { field: 'at', from: 'events', of: SELF },
      from: { literal: 'year:1', type: 'timePoint' },
      to: { literal: 'year:90', type: 'timePoint' },
    }
    const exceptions = [
      { id: 'festival', scope: { kind: 'universe' }, when: { kind: 'always', value: 'false' } },
    ]
    const system = await openTransition(page, async (universeId) => {
      dependency = (await seedConditionRule(page, universeId, 'Rested enough', compareMood())).id
      seeded = await seedConditionRule(
        page,
        universeId,
        'Every kind of node',
        {
          kind: 'all',
          of: [
            { ...compareMood(), note: 'kept by the builder' },
            {
              kind: 'not',
              of: {
                kind: 'exists',
                query: {
                  from: 'events',
                  where: [
                    { field: 'subjectIds', op: 'contains', operandValue: SELF },
                    { field: 'at', op: 'gte', value: 'year:12', type: 'timePoint' },
                  ],
                },
              },
            },
            {
              kind: 'any',
              of: [
                { kind: 'related', relation: 'ally', from: SELF, to: { subject: named } },
                {
                  kind: 'compare',
                  left: {
                    count: {
                      from: 'relations',
                      where: [{ field: 'type', op: 'eq', value: 'ally', type: 'text' }],
                    },
                  },
                  op: 'gte',
                  right: { literal: 2, type: 'number' },
                },
              ],
            },
            within,
            { kind: 'ruleHolds', ruleId: dependency },
            { kind: 'always', value: 'true' },
          ],
        },
        { dependsOn: [dependency], exceptions },
      )
      return seeded.id
    })
    const rule = seeded as unknown as RuleDetail
    const ruleUrl = `${rulesUrl(system.universeId)}/${rule.id}`
    const writes = ruleWrites(page)

    await page.getByTestId('machine-transition-edit-guard').click()
    await expect(page.getByTestId('guard-builder-title')).toHaveValue('Every kind of node')
    await expect(block(page, 'of.3')).toHaveAttribute('data-kind', 'readonly')
    await expect(block(page, 'of.3').getByTestId('guard-summary')).toHaveText('Within a period')
    await expect(block(page, 'of.4').getByTestId('guard-summary')).toHaveText(
      'Rule Rested enough holds',
    )
    await expect(block(page, 'of.5').getByTestId('guard-summary')).toHaveText('Always true')
    // A named entry is kept as written, and the related row around it stays editable.
    await expect(block(page, 'of.2.of.0')).toHaveAttribute('data-kind', 'related')
    await expect(
      block(page, 'of.2.of.0').locator('[data-side="to"]').getByTestId('guard-operand-kind'),
    ).toHaveValue('kept')

    // Saving without an edit sends nothing and keeps the version.
    await page.getByTestId('guard-builder-save').click()
    await expect(builder(page)).toBeHidden()
    expect(writes).toEqual([])
    expect((await api<RuleDetail>(page, 'GET', ruleUrl)).version).toBe(rule.version)

    // One edit: everything it did not touch comes back as it was written.
    await page.getByTestId('machine-transition-edit-guard').click()
    await block(page, 'of.0').getByTestId('guard-op').selectOption('ne')
    expect((await saveGuard(page, 'PUT')).ok()).toBe(true)
    const stored = await api<RuleDetail>(page, 'GET', ruleUrl)
    const before = rule.condition as { of: Record<string, unknown>[] }
    const after = stored.condition as { of: Record<string, unknown>[] }
    expect(after.of[0]).toEqual({ ...before.of[0], op: 'ne' })
    expect(after.of.slice(1)).toEqual(before.of.slice(1))
    expect(after.of[3]).toEqual(within)
    expect(stored.exceptions).toEqual(exceptions)
    expect(stored.dependsOn).toEqual([dependency])
    expect(stored.version).toBe(rule.version + 1)
  })

  test('the builder offers only the closed sets', async ({ page }) => {
    await openTransition(page)
    await page.getByTestId('machine-transition-new-guard').click()
    const first = block(page, 'of.0')

    expect(await optionsOf(page.getByTestId('guard-group-kind'))).toEqual(['all', 'any'])
    expect(await optionsOf(page.getByTestId('guard-add-kind'))).toEqual([
      'all',
      'any',
      'not',
      'compare',
      'exists',
      'related',
    ])
    expect(await optionsOf(first.getByTestId('guard-operand-kind').first())).toEqual([
      'literal',
      'attribute',
      'self',
      'count',
    ])
    expect(await optionsOf(first.getByTestId('guard-literal-type'))).toEqual([
      'boolean',
      'number',
      'text',
      'timePoint',
    ])
    // Text is not ordered; a number is.
    expect(await optionsOf(first.getByTestId('guard-op'))).toEqual(['eq', 'ne'])
    await first.getByTestId('guard-literal-type').selectOption('timePoint')
    expect(await optionsOf(first.getByTestId('guard-literal-scope'))).toEqual([
      'calendar',
      'era',
      'year',
    ])
    await first.getByTestId('guard-literal-type').selectOption('number')
    expect(await optionsOf(first.getByTestId('guard-op'))).toEqual([
      'eq',
      'ne',
      'lt',
      'lte',
      'gt',
      'gte',
    ])

    await page.getByTestId('guard-add-kind').selectOption('exists')
    await page.getByTestId('guard-add').click()
    const exists = block(page, 'of.1')
    expect(await optionsOf(exists.getByTestId('guard-source'))).toEqual([
      'subjects',
      'relations',
      'events',
    ])
    const fields: Record<string, string[]> = {
      subjects: ['id', 'type'],
      relations: ['type', 'fromId', 'toId'],
      events: ['id', 'kind', 'method', 'subjectIds', 'at', 'canon'],
    }
    for (const [source, names] of Object.entries(fields)) {
      await exists.getByTestId('guard-source').selectOption(source)
      await exists.getByTestId('guard-add-clause').click()
      const clause = exists.getByTestId('guard-clause')
      // Only the source's own fields: never an `attributes.<name>` (#210).
      expect(await optionsOf(clause.getByTestId('guard-clause-field'))).toEqual(names)
      for (const name of names) {
        await clause.getByTestId('guard-clause-field').selectOption(name)
        const operators = await optionsOf(clause.getByTestId('guard-clause-op'))
        if (name === 'subjectIds') expect(operators).toEqual(['contains'])
        else expect(operators).not.toContain('contains')
      }
    }
  })

  test('depth, node and clause limits stop the save before any request', async ({ page }) => {
    let wide = ''
    // Twelve nots and a group put a comparison at depth 14 and its attribute's entry at 16: the deepest a save takes.
    let deep: unknown = { kind: 'all', of: [compareMood()] }
    for (let level = 0; level < 12; level += 1) deep = { kind: 'not', of: deep }
    await openTransition(page, async (universeId) => {
      wide = (
        await seedConditionRule(page, universeId, 'Wide', {
          kind: 'any',
          of: Array.from({ length: 255 }, () => ({ kind: 'always', value: 'false' })),
        })
      ).id
      return (await seedConditionRule(page, universeId, 'Deep', deep)).id
    })
    const writes = ruleWrites(page)

    // One more level under the deepest group passes the depth limit.
    await page.getByTestId('machine-transition-edit-guard').click()
    const groupPath = Array.from({ length: 12 }, () => 'of').join('.')
    await expect(block(page, groupPath)).toContainText('All of these, level 13')
    await block(page, groupPath).getByTestId('guard-add-kind').selectOption('not')
    await block(page, groupPath).getByTestId('guard-add').click()
    const added = `${groupPath}.of.1.of`
    await block(page, added).getByTestId('guard-attribute').fill('mood')
    await page.getByTestId('guard-builder-save').click()
    await expect(block(page, added).getByTestId('guard-block-error')).toHaveText(
      'This is nested too deeply. Take a level out.',
    )
    await expect(block(page, added)).toBeFocused()
    await discardBuilder(page)

    // Four more nodes beside 256 pass the node limit.
    await page.getByTestId('machine-transition-guard').selectOption(wide)
    await page.getByTestId('machine-transition-edit-guard').click()
    await expect(block(page, 'of.254')).toBeVisible()
    await page.getByTestId('guard-add').click()
    await block(page, 'of.255').getByTestId('guard-attribute').fill('mood')
    await page.getByTestId('guard-builder-save').click()
    await expect(builder(page).getByTestId('guard-block-error')).toHaveText(
      'This guard has too many parts. Remove some.',
    )
    await discardBuilder(page)

    // A search stops taking conditions at eight.
    await page.getByTestId('machine-transition-new-guard').click()
    await page.getByTestId('guard-add-kind').selectOption('exists')
    await page.getByTestId('guard-add').click()
    const addClause = block(page, 'of.1').getByTestId('guard-add-clause')
    for (let clause = 0; clause < 8; clause += 1) await addClause.click()
    await expect(block(page, 'of.1').getByTestId('guard-clause')).toHaveCount(8)
    await expect(addClause).toBeDisabled()

    expect(writes).toEqual([])
  })

  test('a refused save marks the block it names', async ({ page }) => {
    await openTransition(page)
    const refusals = [
      { code: 'type_mismatch', path: 'condition.of[1].right', message: 'Refused.' },
      { code: 'node_arity', path: 'exceptions[0].when', message: 'Refused.' },
    ]
    await page.route('**/system-rules', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await route.fulfill({ status: 400, json: refusals.shift() })
    })

    await page.getByTestId('machine-transition-new-guard').click()
    await page.getByTestId('guard-builder-title').fill('Refused')
    await block(page, 'of.0').getByTestId('guard-attribute').fill('mood')
    await page.getByTestId('guard-add').click()
    await block(page, 'of.1').getByTestId('guard-attribute').fill('energy')

    expect((await saveGuard(page, 'POST')).status()).toBe(400)
    await expect(block(page, 'of.1').getByTestId('guard-block-error')).toHaveText(
      'These two sides are of different types.',
    )
    await expect(block(page, 'of.1')).toBeFocused()
    await expect(block(page, 'of.0').getByTestId('guard-block-error')).toHaveCount(0)

    // A path outside the condition is said once, at the top.
    expect((await saveGuard(page, 'POST')).status()).toBe(400)
    await expect(page.getByTestId('guard-builder-error')).toHaveText(
      'Something here is missing a part.',
    )
    await expect(builder(page).getByTestId('guard-block-error')).toHaveCount(0)
  })

  test('a guard rule changed elsewhere is refused and the edit is kept', async ({ page }) => {
    const system = await openTransition(
      page,
      async (universeId) =>
        (await seedConditionRule(page, universeId, 'Calm enough', compareMood())).id,
    )
    const ruleUrl = `${rulesUrl(system.universeId)}/${system.guardRuleId}`
    const renameElsewhere = async (title: string) => {
      const current = await api<RuleDetail>(page, 'GET', ruleUrl)
      await api(page, 'PUT', ruleUrl, {
        title,
        description: 'Written over MCP.',
        projectId: null,
        schemaVersion: 1,
        condition: current.condition,
        dependsOn: [],
        expectedVersion: current.version,
      })
    }

    await page.getByTestId('machine-transition-edit-guard').click()
    await block(page, 'root').getByTestId('guard-op').selectOption('ne')
    await renameElsewhere('Calm enough, renamed')
    expect((await saveGuard(page, 'PUT')).status()).toBe(409)
    await expect(page.getByTestId('guard-conflict')).toBeVisible()
    await expect(block(page, 'root').getByTestId('guard-op')).toHaveValue('ne')

    // Save mine over it writes the edit over the newer version.
    const answered = page.waitForResponse(
      (response) => response.url().endsWith(ruleUrl) && response.request().method() === 'PUT',
    )
    await page.getByTestId('guard-keep-mine').click()
    expect((await answered).ok()).toBe(true)
    await expect(builder(page)).toBeHidden()
    let stored = await api<RuleDetail>(page, 'GET', ruleUrl)
    expect(stored.condition).toEqual(compareMood('ne'))
    expect(stored.title).toBe('Calm enough')

    // Load the saved version asks first, then lets the edit go.
    await page.getByTestId('machine-transition-edit-guard').click()
    await block(page, 'root').getByTestId('guard-op').selectOption('eq')
    await renameElsewhere('Calm enough, again')
    expect((await saveGuard(page, 'PUT')).status()).toBe(409)
    await page.getByTestId('guard-load-saved').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('guard-conflict')).toBeHidden()
    await expect(page.getByTestId('guard-builder-title')).toHaveValue('Calm enough, again')
    await expect(block(page, 'root').getByTestId('guard-op')).toHaveValue('ne')
    stored = await api<RuleDetail>(page, 'GET', ruleUrl)
    expect(stored.condition).toEqual(compareMood('ne'))
  })

  test('the guard is built by keyboard alone', async ({ page }) => {
    const system = await openTransition(page)
    await page.getByTestId('machine-transition-cancel').click()
    await expect(page.getByTestId('machine-transition-drawer')).toBeHidden()

    // Nothing below is a click: each step starts from a focused control and goes on by keys.
    await page.getByTestId('machine-transition-open').focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('machine-transition-new-guard').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('guard-builder-title')).toBeFocused()
    await page.keyboard.type('Typed guard')

    await block(page, 'of.0').getByTestId('guard-attribute').focus()
    await page.keyboard.type('mood')
    await page.keyboard.press('Tab')
    await expect(block(page, 'of.0').getByTestId('guard-op')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(block(page, 'of.0').getByTestId('guard-operand-kind').nth(1)).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(block(page, 'of.0').getByTestId('guard-literal-value')).toBeFocused()
    await page.keyboard.type('calm')

    // A second block: the kind is chosen with the arrow keys, then added with Enter.
    await page.getByTestId('guard-add-kind').focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('guard-add-kind')).toHaveValue('not')
    await page.getByTestId('guard-add').focus()
    await page.keyboard.press('Enter')
    await block(page, 'of.1.of').getByTestId('guard-attribute').focus()
    await page.keyboard.type('fear')

    // Every control in the builder has a name a screen reader can say.
    const unnamed = await builder(page).evaluate((dialog) =>
      [...dialog.querySelectorAll<HTMLElement>('input, select, button')]
        .filter(
          (control) =>
            !control.getAttribute('aria-label') &&
            !(control as HTMLInputElement).labels?.length &&
            !control.textContent?.trim(),
        )
        .map((control) => control.outerHTML),
    )
    expect(unnamed).toEqual([])

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/system-rules') && response.request().method() === 'POST',
    )
    await page.getByTestId('guard-builder-save').focus()
    await page.keyboard.press('Enter')
    const rule = (await (await created).json()) as RuleDetail
    await expect(builder(page)).toBeHidden()
    await page.getByTestId('machine-transition-apply').focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('machine-save').focus()
    const answered = page.waitForResponse(
      (response) => response.url().endsWith('/machine') && response.request().method() === 'PUT',
    )
    await page.keyboard.press('Enter')
    expect((await answered).ok()).toBe(true)

    expect((await machineOf(page, system.systemUrl)).transitions[0].guardRuleId).toBe(rule.id)
    expect(rule.condition).toEqual({
      kind: 'all',
      of: [
        compareMood(),
        {
          kind: 'not',
          of: {
            kind: 'compare',
            left: { attribute: 'fear', of: SELF },
            op: 'eq',
            right: { literal: '', type: 'text' },
          },
        },
      ],
    })
  })

  test('at 375px a deep guard fits with no sideways page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    // Ten groups inside each other, each with a comparison: indenting stops at level 5.
    let deep: Record<string, unknown> = compareMood()
    for (let level = 0; level < 10; level += 1) {
      deep = { kind: level % 2 === 0 ? 'all' : 'any', of: [compareMood(), deep] }
    }
    await openTransition(
      page,
      async (universeId) =>
        (await seedConditionRule(page, universeId, 'A guard with a rather long title', deep)).id,
    )
    await page.getByTestId('machine-transition-edit-guard').click()
    const deepest = Array.from({ length: 10 }, () => 'of.1').join('.')
    await expect(block(page, deepest)).toHaveAttribute('data-kind', 'compare')
    await expect(builder(page)).toContainText('level 10')

    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(await overflow()).toBeLessThanOrEqual(1)
    const body = builder(page).locator('.drawer__body')
    expect(
      await body.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)

    // The deepest row's controls stay inside the drawer.
    const drawer = (await builder(page).boundingBox())!
    for (const control of await block(page, deepest).locator('input, select').all()) {
      await control.scrollIntoViewIfNeeded()
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(drawer.x)
      expect(box.x + box.width).toBeLessThanOrEqual(drawer.x + drawer.width + 1)
    }

    // An edit down there saves like any other.
    await block(page, deepest).getByTestId('guard-op').selectOption('ne')
    expect((await saveGuard(page, 'PUT')).ok()).toBe(true)
    expect(await overflow()).toBeLessThanOrEqual(1)
  })
})
