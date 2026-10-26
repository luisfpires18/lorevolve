import { currentTheme, THEME_COLOR } from './theme'

/*
  Lifts the launch layer (043.5) that `index.html` draws over an installed Lorex's first paint, or a browser's first
  visit to Lorex's home in a session, once its opening has played.

  It knows nothing of routes or sessions. It waits for two things: the opening to finish - the logo resolving and the
  book, world, game and screen drawing themselves around it - and rest a moment, and the shell underneath to have drawn
  something real: the root holds content and no screen is still on its pending plate (`.session-pending`, which both the
  session probe and a screen's code fetch draw). Then a red edge rises and the layer wipes away, and is removed. A shell
  that is not ready after `GIVE_UP_MS` is revealed anyway: its own pending plate is honest, and a launch screen that
  never leaves is worse. A tap, click or key skips straight to the app.
*/

/** How long the opening rests once it has played, before the layer lifts. */
const SETTLE_MS = 180
const SETTLE_REDUCED_MS = 240
const GIVE_UP_MS = 8000
/** Longer than the edge and the wipe together (index.html), so the layer is gone even if no animationend arrives. */
const LEAVE_FALLBACK_MS = 1600

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
  const restoreChrome = () =>
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[currentTheme()])

  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.removeEventListener('keydown', finish)
    layer.remove()
    html.removeAttribute('data-launch')
    restoreChrome()
  }
  // Skipping: the app has been starting underneath, so it is simply uncovered.
  layer.addEventListener('pointerdown', finish, { once: true })
  window.addEventListener('keydown', finish, { once: true })

  // The opening's own animations, however long the first paint took to start them - never the layer's failsafe.
  const played = Promise.all(
    (layer.getAnimations?.({ subtree: true }) ?? [])
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
      .filter((animation) => (animation as CSSAnimation).animationName !== 'launch-failsafe')
      .map((animation) => animation.finished),
  ).then(
    () => undefined,
    () => undefined,
  )

  void played
    .then(() => wait(reduced ? SETTLE_REDUCED_MS : SETTLE_MS))
    .then(
      () =>
        new Promise<void>((resolve) => {
          const check = () =>
            done || shellIsReady() || performance.now() > giveUpAt
              ? resolve()
              : requestAnimationFrame(check)
          check()
        }),
    )
    .then(() => {
      if (done) return
      html.dataset.launch = 'leaving'
      restoreChrome()
      // The layer's own exit, not the opening's animations bubbling up.
      layer.addEventListener('animationend', (event) => {
        if (event.target === layer) finish()
      })
      // A browser that skips the animation still loses the layer.
      setTimeout(finish, LEAVE_FALLBACK_MS)
    })
}
