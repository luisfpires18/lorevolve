import { publishContent, unpublishContent } from './api'
import type { ContentKind, ContentPublicationState } from './types'
import { t } from '../i18n'
import { lacksSummary } from './contentPublicationWords'

/** ContentPublication's one handler: publishing the item or making it private. */
export function contentPublicationChange({
  universeId,
  kind,
  id,
  setBusy,
  setFailed,
  setAnnouncement,
  setState,
}: {
  universeId: string
  kind: ContentKind
  id: string
  setBusy: (value: boolean) => void
  setFailed: (value: string | null) => void
  setAnnouncement: (value: string) => void
  setState: (next: ContentPublicationState) => void
}) {
  async function change(publish: boolean) {
    setBusy(true)
    setFailed(null)
    setAnnouncement('')
    try {
      const next = publish
        ? await publishContent(universeId, kind, id)
        : await unpublishContent(universeId, kind, id)
      setState(next)
      setAnnouncement(
        !publish
          ? t('stories.publication.content.madePrivate')
          : next.universeIsPublic && !lacksSummary(kind, next)
            ? t('stories.publication.content.published')
            : t('stories.publication.content.selected'),
      )
    } catch {
      // Nothing changed: the state shown is still the stored one.
      setFailed(
        publish
          ? t('stories.publication.content.failedPublish')
          : t('stories.publication.content.failedPrivate'),
      )
    } finally {
      setBusy(false)
    }
  }
  return change
}
