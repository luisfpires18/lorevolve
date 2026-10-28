// Written in by Vite at build and dev time (`define` in vite.config.ts); never fetched.
declare const __LOREVOLVE_VERSION__: string
declare const __LOREVOLVE_BUILD_ID__: string

/** The application version: package.json's, or `MAJOR.MINOR.PATCH-dev` on a DEV deployment (devVersion.ts). */
export const APP_VERSION = __LOREVOLVE_VERSION__

/** Which build is running: a commit or deployment id, or a random one per local build. Not a version, and not shown. */
export const BUILD_ID = __LOREVOLVE_BUILD_ID__

/** How the version reads wherever it is shown: the home page's footer and the account menu. */
export const VERSION_LABEL = `LorEvolve v${APP_VERSION}`
