import { expect, test, type Locator, type Page } from '@playwright/test'
import { openAccountMenu } from './support/account'
import { png, type Rgb } from './support/png'
import { colours, expectShows, expectSquareCovered } from './support/pixels'

/**
 * One journey through the account screen, and the one measurement a phone needs.
 *
 * What the API knows about an account is settled by `AuthEndpointTests` and, for the photo,
 * `ProfileImageTests` - which can reach states this screen cannot. What only a browser can show is
 * that the screen is reachable from where an author actually is, inside a universe; that it is a
 * user-level route rather than a section of that universe; that what it prints is the real account
 * and not a placeholder someone typed in; and that a photo can actually be put on it, framed,
 * reframed, replaced and taken away, with the circle showing the part that was chosen.
 *
 * The pictures are made of coloured bands, so "the avatar shows the part I chose" is read out of
 * the pixels rather than trusted from an address.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

const RED: Rgb = [220, 30, 30]
const GREEN: Rgb = [30, 160, 60]
const BLUE: Rgb = [30, 30, 220]

/** Three vertical bands, red to blue. The centred square is the green one, and never the answer. */
function thirds(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(600, 200, (x) => (x < 200 ? RED : x < 400 ? GREEN : BLUE)),
  }
}

/** A flat picture of one colour, for the steps where what it shows does not matter. */
function plain(name: string, rgb: Rgb) {
  return { name, mimeType: 'image/png', buffer: png(400, 400, () => rgb) }
}

/**
 * Around half a megabyte of noise, for the one test that throttles the uplink. Noise rather than a
 * flat colour because a flat PNG compresses to almost nothing and there would be no bytes to watch
 * go out.
 */
function noisy(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(400, 400, (x, y) => [(x * 7 + y) % 256, (y * 13 + x) % 256, (x + y * 3) % 256]),
  }
}

/**
 * Drags the picture under the square as far as it will go. The cropper keeps the square inside the
 * picture, so an overlong drag lands exactly on the edge - which is what makes it repeatable.
 */
async function dragPicture(page: Page, direction: 'left' | 'right') {
  const stage = page.getByTestId('image-crop-stage')
  const box = (await stage.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + (direction === 'right' ? box.width : -box.width), y, { steps: 12 })
  await page.mouse.up()
}

/**
 * The circle, once it is actually showing `expected`.
 *
 * Polled rather than read once, because every step that changes the avatar changes it twice: the
 * page renders the new address, and the browser then fetches and decodes what is at it. Sampling
 * in between would read the picture that is on its way out.
 */
async function expectAvatarShows(page: Page, expected: Rgb) {
  const avatar = page.getByTestId('profile-avatar')
  await expect(avatar).toHaveJSProperty('tagName', 'IMG')

  await expect
    .poll(async () => {
      try {
        const [pixel] = await colours(avatar, [[0.5, 0.5]])
        return pixel.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) < 50)
      } catch {
        // The element was swapped under the read, which is the case this poll exists for.
        return false
      }
    })
    .toBe(true)

  // Settled, so the whole square can be checked rather than one pixel of it.
  await expectShows(avatar, expected)
}

/** The open cropper, once its picture has loaded and its square can be saved. */
async function openCropper(page: Page): Promise<Locator> {
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  return dialog
}

/**
 * Holds the profile-photo write open until the returned release is called.
 *
 * Nothing here waits on how fast localhost is. The point of a held response is the opposite: the
 * server's part of the save is made to take as long as the test needs, so "the browser has sent
 * the bytes but the photo is not saved yet" is a state that can actually be looked at rather than
 * a moment that has to be caught.
 */
async function holdSave(page: Page, route: '/api/profile/image' | '/api/profile/image/thumbnail') {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  let requests = 0

  await page.route(route, async (interception) => {
    // The write only. The same path answers a GET - it is how every avatar learns what to draw -
    // and holding or counting that would be counting the wrong thing.
    if (interception.request().method() !== 'PUT') {
      await interception.continue()
      return
    }

    requests += 1
    await held
    await interception.continue()
  })

  return {
    /** Lets the held request go. The route stays registered, so it keeps counting. */
    release,
    get requests() {
      return requests
    },
  }
}

/** The stage the cropper says it is at: the bar's own state, and the words beside it. */
async function stage(page: Page) {
  const bar = page.getByTestId('image-crop-progressbar')
  return {
    state: await bar.getAttribute('data-state'),
    value: await bar.getAttribute('aria-valuenow'),
    text: (await page.getByTestId('image-crop-stagetext').textContent()) ?? '',
  }
}

interface Account {
  username: string
  email: string
}

async function signUp(page: Page): Promise<Account> {
  const username = unique('keeper')
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { username, email }
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
}

test.describe('profile', () => {
  test('is reached from a universe and shows the account LorEvolve actually has', async ({
    page,
  }) => {
    const account = await signUp(page)
    await newUniverse(page)

    // The account is not a section of this universe, so it is not in the universe's sidebar.
    await expect(page.getByTestId('workspace-profile')).toHaveCount(0)
    await expect(page.locator('.sidebar').getByText('Profile', { exact: true })).toHaveCount(0)

    // It is on the global rail instead, in the one account menu LorEvolve has.
    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()

    // A user-level route: the universe is left behind rather than nested inside.
    await expect(page).toHaveURL('/app/profile')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    await expect(page.getByTestId('profile-name')).toHaveText(account.username)
    await expect(page.getByTestId('profile-email')).toHaveText(account.email)
    await expect(page.getByTestId('profile-universes')).toHaveText('1')
    await expect(page.getByText('Account ID')).toHaveCount(0)

    // Three tabs, Settings' pattern; Account is the page itself, and each other tab is its own address.
    await expect(page.getByTestId('profile-tabs').getByRole('tab')).toHaveText([
      'Account',
      'Usage',
      'Connected apps',
    ])
    await expect(page.getByTestId('profile-tab-account')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('profile-usage')).toBeHidden()
    await expect(page.getByTestId('connected-apps')).toBeHidden()
    await page.getByTestId('profile-tab-connected-apps').click()
    await expect(page).toHaveURL('/app/profile?tab=connected-apps')
    await expect(page.getByTestId('connected-apps')).toBeVisible()
    await expect(page.getByTestId('profile-email')).toBeHidden()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('profile-tab-usage')).toBeFocused()
    await expect(page.getByTestId('profile-usage')).toBeVisible()
    await page.getByTestId('profile-tab-account').click()
    await expect(page).toHaveURL('/app/profile')

    // No stored picture exists, so the circle carries the account's initial.
    await expect(page.getByTestId('profile-avatar')).toHaveText(account.username[0]!.toUpperCase())

    // The way back out is a link, not the browser's button: My workspace's own Universes.
    await page
      .getByRole('navigation', { name: 'My workspace' })
      .getByRole('link', { name: 'Universes' })
      .click()
    await expect(page).toHaveURL('/app')

    // And the universes screen carries the same menu, to the same place.
    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveURL('/app/profile')
  })

  test('a photo is added, framed, reframed, replaced and taken away', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    const avatar = page.getByTestId('profile-avatar')

    // With no photo, the circle carries the account's initial and offers only one action.
    await expect(avatar).toHaveText(/^[A-Z]$/)
    await expect(page.getByTestId('profile-photo-pick')).toHaveText('Upload photo')
    await expect(page.getByTestId('profile-photo-reframe')).toHaveCount(0)
    await expect(page.getByTestId('profile-photo-remove')).toHaveCount(0)

    // ---------- Choosing a file opens the cropper, and nothing is uploaded before it is kept ----------

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    let dialog = await openCropper(page)
    await expectSquareCovered(dialog)

    // The left band, chosen deliberately: it is neither the centred square nor what a later
    // reframe will pick, so every assertion below can only pass for the square that was framed.
    await dragPicture(page, 'right')
    await expectSquareCovered(dialog)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    // ---------- The circle shows it, as a circle ----------

    await expect(avatar).toHaveJSProperty('tagName', 'IMG')
    await expectAvatarShows(page, RED)

    const round = await avatar.evaluate((element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        radius: style.borderRadius,
        fit: style.objectFit,
        width: box.width,
        height: box.height,
      }
    })
    expect(round.radius).toBe('50%')
    expect(round.fit).toBe('cover')
    expect(Math.abs(round.width - round.height)).toBeLessThanOrEqual(1)

    // It survives a reload, so it is stored rather than held in this page's state.
    await page.reload()
    await expectAvatarShows(page, RED)

    // ---------- Edit photo reopens on the stored picture, and sends no file ----------

    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/api/profile/image')) {
        uploads.push(request.url())
      }
    })

    await page.getByTestId('profile-photo-reframe').click()
    dialog = await openCropper(page)

    // The whole picture is there to reframe, not the square that was cut from it: the cropper is
    // showing the stored original, which was never touched.
    await expectSquareCovered(dialog)
    await dragPicture(page, 'left')
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await expectAvatarShows(page, BLUE)

    // Only the thumbnail route was called - the picture itself was not sent again.
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toContain('/api/profile/image/thumbnail')

    // ---------- Replacing ----------

    await page.getByTestId('profile-photo-input').setInputFiles(plain('flat.png', GREEN))
    dialog = await openCropper(page)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await expectAvatarShows(page, GREEN)

    // ---------- Removing falls back to the monogram ----------

    await page.getByTestId('profile-photo-remove').click()

    await expect(avatar).toHaveText(/^[A-Z]$/)
    await expect(page.getByTestId('profile-photo-pick')).toHaveText('Upload photo')
    await expect(page.getByTestId('profile-photo-reframe')).toHaveCount(0)

    // And it stays gone.
    await page.reload()
    await expect(avatar).toHaveText(/^[A-Z]$/)
  })

  test('the cropper is reachable and dismissable from the keyboard', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    // The file input is hidden but not removed, so it is still what the keyboard reaches.
    await page.getByTestId('profile-photo-input').focus()
    await expect(page.getByTestId('profile-photo-input')).toBeFocused()

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    const dialog = await openCropper(page)

    // Escape leaves everything as it was, and nothing was uploaded.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('profile-avatar')).toHaveText(/^[A-Z]$/)
  })

  test('a save shows the bytes going, then says the server is still working', async ({ page }) => {
    test.setTimeout(90000)

    await signUp(page)
    await page.goto('/app/profile')

    // A deliberately slow uplink and a deliberately slow answer, so both stages last long enough
    // to be looked at. The rates are the test's own, not the machine's, which is exactly what
    // keeps this off how fast localhost happens to be: on a faster or slower machine the same two
    // states are reached in the same order and neither is a race.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      // Added between the last byte sent and the first byte of the answer, which is precisely the
      // window in which the photo is uploaded but not yet saved.
      latency: 2500,
      downloadThroughput: -1,
      uploadThroughput: 128 * 1024,
    })

    try {
      await page.getByTestId('profile-photo-input').setInputFiles(noisy('slow.png'))
      const dialog = await openCropper(page)
      await dialog.getByTestId('image-crop-confirm').click()

      // Stage A: a determinate bar with a real number on it, while the bytes are moving.
      const progress = page.getByTestId('image-crop-progress')
      await expect(progress).toBeVisible()
      await expect.poll(async () => (await stage(page)).state, { timeout: 30000 }).toBe('sending')

      const sending = await stage(page)
      expect(sending.text).toContain('Uploading')
      expect(Number(sending.value)).toBeGreaterThanOrEqual(0)
      expect(Number(sending.value)).toBeLessThanOrEqual(100)

      const bar = page.getByTestId('image-crop-progressbar')
      await expect(bar).toHaveAttribute('aria-valuemin', '0')
      await expect(bar).toHaveAttribute('aria-valuemax', '100')

      // Stage B: the body is away and the server has not answered. Reaching 100% uploaded is not
      // the photo being saved, and this is the part that says so.
      await expect.poll(async () => (await stage(page)).state, { timeout: 30000 }).toBe('working')

      const working = await stage(page)
      expect(working.text).toContain('Processing photo')

      // No frozen percentage claiming the save is finished when it is not.
      expect(working.value).toBeNull()

      // The status is announced rather than merely drawn, so a bar that moves is not the only
      // thing saying what is happening.
      await expect(page.getByTestId('image-crop-stagetext')).toHaveAttribute('role', 'status')

      await expect(dialog).toHaveCount(0, { timeout: 30000 })
      await expect(page.getByTestId('profile-avatar')).toHaveAttribute('data-avatar', 'photo')
    } finally {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      await cdp.detach()
    }
  })

  test('one press is one upload, however many times the button is pressed', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    const save = await holdSave(page, '/api/profile/image')

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    const dialog = await openCropper(page)
    const confirm = dialog.getByTestId('image-crop-confirm')
    await confirm.click()

    await expect(page.getByTestId('image-crop-progress')).toBeVisible()
    await expect(confirm).toBeDisabled()

    // Forced, so the press lands whatever the button's own state is doing: the guard is in the
    // handler, not in the styling.
    await confirm.click({ force: true })
    await confirm.click({ force: true })

    // And the crop cannot move under a save that has already been given its four numbers.
    await expect(page.getByTestId('image-crop-stage')).toHaveAttribute('inert', '')

    save.release()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('profile-avatar')).toHaveAttribute('data-avatar', 'photo')
    expect(save.requests, 'the photo was uploaded more than once').toBe(1)
  })

  test('a reframe says it is updating, and never invents a byte percentage', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    let dialog = await openCropper(page)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    const save = await holdSave(page, '/api/profile/image/thumbnail')

    await page.getByTestId('profile-photo-reframe').click()
    dialog = await openCropper(page)
    await dragPicture(page, 'left')
    await dialog.getByTestId('image-crop-confirm').click()

    // A reframe uploads nothing - four numbers go, and the original stays where it is - so there
    // is nothing to count, and the dialog says what it is doing in words instead of inventing a
    // percentage for work that has none.
    await expect.poll(async () => (await stage(page)).state).toBe('working')

    const working = await stage(page)
    expect(working.text).toContain('Updating photo')
    expect(working.text).not.toContain('%')
    expect(working.value).toBeNull()

    save.release()
    await expect(dialog).toHaveCount(0)
    expect(save.requests).toBe(1)
  })

  test('is closed to a signed-out visitor', async ({ page }) => {
    await page.goto('/app/profile')
    await expect(page).toHaveURL('/login')
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('reads in a 390px column without scrolling sideways', async ({ page }) => {
      await signUp(page)
      await page.goto('/app/profile')

      const avatar = page.getByTestId('profile-avatar')
      await expect(avatar).toBeVisible()

      // With a real photo in it too: the cropper, the actions and the circle all have to fit the
      // column, and the actions wrap rather than being reached for sideways.
      await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
      const dialog = await openCropper(page)
      await expectSquareCovered(dialog)
      await dialog.getByTestId('image-crop-confirm').click()
      await expect(dialog).toHaveCount(0)
      await expect(avatar).toHaveJSProperty('tagName', 'IMG')

      // Still a circle, and still in the middle of the column it is in.
      const box = (await avatar.boundingBox())!
      expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1)
      const viewport = page.viewportSize()!
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `the profile scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
    })
  })
})
