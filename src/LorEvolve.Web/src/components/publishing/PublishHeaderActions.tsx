import { Link } from 'react-router-dom'
import { ArrowUpRight, Globe, Lock } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import { worldPath } from '../../portal/api'
import type { usePublishState } from '../../publishing/usePublishState'

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
        <Link
          className="button button--secondary"
          to={worldPath(slug)}
          data-testid="view-public-page"
        >
          {t('universe.publish.viewPublic')}
          <ActionIcon icon={ArrowUpRight} />
        </Link>
      ) : null}
      <button
        className="button button--secondary button--danger-quiet"
        type="button"
        disabled={busy}
        onClick={() => {
          setProblem(null)
          setAnnouncement(null)
          setConfirming({ kind: 'unpublish' })
        }}
        data-testid="unpublish"
      >
        <ActionIcon icon={Lock} />
        {t('universe.publish.makePrivate')}
      </button>
    </>
  ) : (
    <button
      className="button"
      type="button"
      disabled={busy}
      onClick={() => void askToPublish()}
      data-testid="publish"
    >
      <ActionIcon icon={Globe} />
      {t('universe.publish.publishWorld')}
    </button>
  )
}
