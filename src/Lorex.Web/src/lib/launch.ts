import { currentTheme, THEME_COLOR } from './theme'

/*
  Lifts the launch layer (043.5) that `index.html` draws over an installed Lorex's first paint.

  It knows nothing of routes or sessions. It waits for two things: the logo to finish arriving and rest a moment, and
  the shell underneath to have drawn something real - the root holds content and no screen is still on its pending
  plate (`.session-pending`, which both the session probe and a screen's code fetch draw). Then the layer moves down
  and fades, and is removed. A shell that is not ready after `GIVE_UP_MS` is revealed anyway: its own pending plate is
  honest, and a launch screen that never leaves is worse.
*/

/** How long the logo rests once it has arrived, before the layer lifts. */
const SETTLE_MS = 180
const SETTLE_REDUCED_MS = 240
const GIVE_UP_MS = 8000

function shellIsReady() {
  const root = document.getElementById('root')
  return (
    root !== null &&
    root.childElementCount > 0 &&
    document.querySelector('.session-pending') === null
  )
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function revealWhenReady() {
  const html = document.documentElement
  if (html.dataset.launch !== 'on') {
    // A browser tab, or a reload in a window that already launched: the layer is never shown, so it goes.
    document.getElementById('launch')?.remove()
    return
  }

  const layer = document.getElementById('launch')
  const logo = layer?.querySelector<HTMLElement>('.launch__logo')
  if (!layer || !logo) {
    html.removeAttribute('data-launch')
    return
  }

  const giveUpAt = performance.now() + GIVE_UP_MS
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The logo's own entrance, however long the first paint took to start it.
  const arrived = Promise.all(
    (logo.getAnimations?.() ?? []).map((animation) => animation.finished),
  ).then(
    () => undefined,
    () => undefined,
  )

  void arrived
    .then(() => wait(reduced ? SETTLE_REDUCED_MS : SETTLE_MS))
    .then(
      () =>
        new Promise<void>((resolve) => {
          const check = () =>
            shellIsReady() || performance.now() > giveUpAt
              ? resolve()
              : requestAnimationFrame(check)
          check()
        }),
    )
    .then(() => {
      html.dataset.launch = 'leaving'
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR[currentTheme()])

      let done = false
      const finish = () => {
        if (done) return
        done = true
        layer.remove()
        html.removeAttribute('data-launch')
      }
      // The layer's own exit, not the logo's entrance bubbling up.
      layer.addEventListener('animationend', (event) => {
        if (event.target === layer) finish()
      })
      // A browser that skips the animation still loses the layer.
      setTimeout(finish, 1000)
    })
}
