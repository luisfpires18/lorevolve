import { ApiError } from '../lib/api'
import { getPublication, getSelectedLore, publishUniverse, unpublishUniverse } from './api'
import { REQUIREMENTS } from './types'
import type { useI18n } from '../i18n'
import type { usePublishState } from './usePublishState'

/** Publish's handlers: asking to publish with a fresh check, publishing, and making the universe private. */
export function publishActions({
  universeId,
  t,
  load,
  detailsDirty,
  setState,
  setConfirming,
  setBusy,
  setProblem,
  setAnnouncement,
}: ReturnType<typeof usePublishState> & {
  universeId: string
  t: ReturnType<typeof useI18n>['t']
  load: (signal?: AbortSignal) => Promise<void>
}) {
  async function askToPublish() {
    setProblem(null)
    setAnnouncement(null)

    if (detailsDirty) {
      setProblem([t('universe.publish.saveFirst')])
      return
    }

    setBusy(true)
    try {
      // Fresh, so the confirmation names exactly what is saved - including a name changed elsewhere - and exactly the
      // entries that would become public with it (Issue #47).
      const [fresh, selected] = await Promise.all([
        getPublication(universeId),
        getSelectedLore(universeId),
      ])
      setState(fresh)

      const stillMissing = REQUIREMENTS.filter((requirement) => requirement.key in fresh.missing)
      if (stillMissing.length > 0) {
        setProblem(stillMissing.map((requirement) => fresh.missing[requirement.key][0]))
        return
      }

      setConfirming({ kind: 'publish', state: fresh, selected })
    } catch (error: unknown) {
      setProblem([error instanceof Error ? error.message : t('universe.publish.checkFailed')])
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setProblem(null)
    try {
      const next = await publishUniverse(universeId)
      setState(next)
      setConfirming(null)
      setAnnouncement(t('universe.publish.published'))
    } catch (error: unknown) {
      setConfirming(null)
      setProblem(
        error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
          ? Object.values(error.fieldErrors)
          : [error instanceof Error ? error.message : t('universe.publish.publishFailed')],
      )
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function unpublish() {
    setBusy(true)
    setProblem(null)
    try {
      setState(await unpublishUniverse(universeId))
      setConfirming(null)
      setAnnouncement(t('universe.publish.madePrivate'))
    } catch (error: unknown) {
      setProblem([error instanceof Error ? error.message : t('universe.publish.privateFailed')])
    } finally {
      setBusy(false)
    }
  }

  return { askToPublish, publish, unpublish }
}
