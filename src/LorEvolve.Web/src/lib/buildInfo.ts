// Written in by Vite at build and dev time (`define` in vite.config.ts); never fetched.
declare const __LOREVOLVE_VERSION__: string
declare const __LOREVOLVE_BUILD_ID__: string
declare const __LOREVOLVE_EDITION__: 'web' | 'desktop'

/** The application version: package.json's, or `MAJOR.MINOR.PATCH-dev` on a DEV deployment (devVersion.ts). */
export const APP_VERSION = __LOREVOLVE_VERSION__

/** Which build is running: a commit or deployment id, or a random one per local build. Not a version, and not shown. */
export const BUILD_ID = __LOREVOLVE_BUILD_ID__

/**
 * The desktop edition (ADR 0070): one local author signed in by the app's window, no public portal, no publishing, no
 * sign-in screens, no collaborators, no connected AI apps. Fixed at build time, so the web build carries none of it.
 */
export const IS_DESKTOP = __LOREVOLVE_EDITION__ === 'desktop'

/** How the version reads wherever it is shown: the site footer and the account menu. */
export const VERSION_LABEL = `LorEvolve v${APP_VERSION}`
