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
  transitions: { from: number; to: number; label?: string }[] = [],
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
      guardRuleId: null,
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
