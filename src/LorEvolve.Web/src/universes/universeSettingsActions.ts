import { downloadReadableExport, downloadUniverseBackup } from '../export/api'
import { discardUniverseDrafts } from '../lib/localDrafts'
import { getPublication } from '../publishing/api'
import { Visibility } from '../publishing/types'
import { deleteUniverse, setUniverseArchived } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { NavigateFunction } from 'react-router-dom'
import type { useAuth } from '../auth/useAuth'
import type { useI18n } from '../i18n'
import type { useUniverseSettingsState } from './useUniverseSettingsState'

/** Settings' handlers: the two downloads, archiving or restoring from the archive, and deleting. */
export function universeSettingsActions({
  universe,
  refresh,
  user,
  navigate,
  t,
  setBusy,
  setError,
  setConfirmingArchive,
  setIsPublic,
  setExporting,
  setExportedAs,
  setExportError,
}: ReturnType<typeof useUniverseSettingsState> & {
  universe: WorkspaceContext['universe']
  refresh: WorkspaceContext['refresh']
  user: ReturnType<typeof useAuth>['user']
  navigate: NavigateFunction
  t: ReturnType<typeof useI18n>['t']
}) {
  async function exportFile(kind: 'backup' | 'readable') {
    setExporting(kind)
    setExportedAs(null)
    setExportError(null)
    try {
      setExportedAs(
        await (kind === 'backup' ? downloadUniverseBackup : downloadReadableExport)(universe.id),
      )
    } catch (problem: unknown) {
      setExportError(
        problem instanceof Error ? problem.message : t('universe.settings.exportFailed'),
      )
    } finally {
      setExporting(null)
    }
  }

  async function toggleArchived() {
    setBusy(true)
    setError(null)
    try {
      refresh(await setUniverseArchived(universe.id, !universe.isArchived))
      setConfirmingArchive(false)
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : t('universe.settings.changeFailed'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Archive and publication are separate (ADR 0036): an archived universe that is public stays public until its author
   * makes it private. So archiving a public universe asks first and says so, read fresh from the server, rather than
   * letting "archived" be mistaken for "taken down". Restoring from the archive changes nothing public and never asks.
   */
  async function askToArchive() {
    if (universe.isArchived) {
      await toggleArchived()
      return
    }
    setBusy(true)
    setError(null)
    let publicNow: boolean | null = null
    try {
      publicNow = (await getPublication(universe.id)).visibility === Visibility.Public
      setIsPublic(publicNow)
    } catch {
      // Unknown: ask anyway rather than archive a possibly public universe without a word.
    }
    if (publicNow === false) {
      await toggleArchived()
      return
    }
    setConfirmingArchive(true)
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteUniverse(universe.id)
      // Nothing is left to recover unsaved writing into, so this device lets the universe's recovery copies go too.
      if (user) void discardUniverseDrafts(user.id, universe.id).catch(() => undefined)
      await navigate('/app', { replace: true })
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : t('universe.settings.deleteFailed'))
      setBusy(false)
    }
  }

  return { exportFile, toggleArchived, askToArchive, remove }
}
