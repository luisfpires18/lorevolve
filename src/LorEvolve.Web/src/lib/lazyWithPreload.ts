import { createElement, lazy, useState, type ComponentType } from 'react'

/** A lazy screen whose code can be fetched before it is first drawn. */
export type PreloadableScreen<P extends object> = ComponentType<P> & {
  preload: () => Promise<unknown>
}

/**
 * `lazy`, plus `preload`. A screen whose code has already arrived is drawn directly rather than through `lazy`, so its
 * boundary never shows the fallback - and so never meets React's throttle, which holds a fallback that has once been shown
 * for 300 ms however soon the code arrives. One fetch serves both, and one that failed stays failed, so a stale chunk
 * after a deploy still reaches the router's error screen.
 */
export function lazyWithPreload<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): PreloadableScreen<P> {
  let loaded: ComponentType<P> | undefined
  let fetching: Promise<{ default: ComponentType<P> }> | undefined
  const preload = () =>
    (fetching ??= load().then((module) => {
      loaded = module.default
      return module
    }))
  const Lazy = lazy(preload)

  function Screen(props: P) {
    // Chosen once for this mount: switching from the lazy wrapper to the module would remount the screen.
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy)
    return createElement(Component, props)
  }

  return Object.assign(Screen, { preload })
}
