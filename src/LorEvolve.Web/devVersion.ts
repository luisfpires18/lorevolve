/**
 * The version a build shows. package.json holds the release version and is the base; a DEV deployment is that version's
 * MAJOR.MINOR with a patch counted on by Deploy DEV's run number, marked `-dev`. Everything else - a local build, CI, a
 * future release - shows package.json's version unchanged.
 *
 * `github.run_number` only ever rises, never returns for a re-run (a re-run is the same number, a new attempt), and needs
 * no commit, token or store. So the version is never written down anywhere and never bumped by hand.
 *
 * `DEV_RUN_BASELINE` is the last Deploy DEV run that showed package.json's version as it is. Run 101 is therefore
 * `0.1.1-dev`, run 102 `0.1.2-dev`. When package.json's version changes, set the baseline to the latest run number in
 * the same commit, so the next DEV build is the new version's `.1-dev`.
 */
export const DEV_RUN_BASELINE = 100

export function displayVersion(packageVersion: string, devRun: string | undefined): string {
  if (!devRun) return packageVersion

  const release = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageVersion)
  if (!release) {
    throw new Error(`package.json's version "${packageVersion}" is not MAJOR.MINOR.PATCH.`)
  }

  // A run at or below the baseline would reuse a version already shown, or go backwards: refuse to build at all.
  const run = Number(devRun)
  if (!Number.isInteger(run) || run <= DEV_RUN_BASELINE) {
    throw new Error(`LOREVOLVE_DEV_RUN "${devRun}" is not a run number above ${DEV_RUN_BASELINE}.`)
  }

  const [, major, minor, patch] = release
  return `${major}.${minor}.${Number(patch) + run - DEV_RUN_BASELINE}-dev`
}
