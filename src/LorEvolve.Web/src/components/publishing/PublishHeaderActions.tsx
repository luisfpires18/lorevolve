import { ArrowUpRight, Globe, Lock } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import { worldPath } from '../../portal/api'
import type { usePublishState } from '../../publishing/usePublishState'
import { Button } from '../Button'

/** The head of Publish: the public address and Make private while public, Publish world while private. */
export function PublishHeaderActions({
  isPublic,
  slug,
  busy,
  setProblem,
  setAnnouncement,
  setConfirming,
  askToPublish,
}: Pick<
  ReturnType<typeof usePublishState>,
  'busy' | 'setProblem' | 'setAnnouncement' | 'setConfirming'
> & {
  isPublic: boolean
  slug: string | null
  askToPublish: () => Promise<void>
}) {
  const { t } = useI18n()

  return isPublic ? (
    <>
      {slug ? (
        <Button tone="secondary" to={worldPath(slug)} data-testid="view-public-page">
          {t('universe.publish.viewPublic')}
          <ActionIcon icon={ArrowUpRight} />
        </Button>
      ) : null}
      <Button
        tone="danger-quiet"
        icon={Lock}
        disabled={busy}
        onClick={() => {
          setProblem(null)
          setAnnouncement(null)
          setConfirming({ kind: 'unpublish' })
        }}
        data-testid="unpublish"
      >
        {t('universe.publish.makePrivate')}
      </Button>
    </>
  ) : (
    <Button icon={Globe} disabled={busy} onClick={() => void askToPublish()} data-testid="publish">
      {t('universe.publish.publishWorld')}
    </Button>
  )
}
