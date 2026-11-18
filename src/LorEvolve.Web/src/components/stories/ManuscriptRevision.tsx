import { plainMentions } from '../../lore/mentions'
import { VersionActor } from '../VersionActor'
import { t, useI18n } from '../../i18n'
import { formatDateTime } from '../../lib/dates'
import {
  ManuscriptRevisionKind,
  type ManuscriptRevisionDetail,
  type ManuscriptRevisionSummary,
} from '../../stories/types'

/** What a version was, in a few words. */
function describeVersion(
  revision: ManuscriptRevisionSummary,
  revisions: ManuscriptRevisionSummary[],
) {
  if (revision.kind === ManuscriptRevisionKind.Restored) {
    const from = revisions.find((candidate) => candidate.id === revision.restoredFromRevisionId)
    return from
      ? t('manuscript.history.restoredFrom', { number: from.number })
      : t('manuscript.history.restoredEarlier')
  }
  if (revision.isEmpty) return t('manuscript.history.emptied')
  return revision.kind === ManuscriptRevisionKind.Created
    ? t('manuscript.history.first')
    : t('manuscript.history.saved')
}

/** One saved version in the history list: when, what, who, and the buttons to view or put it back. */
export function ManuscriptRevision({
  revision,
  index,
  revisions,
  id,
  blocked,
  blockedId,
  viewing,
  busyId,
  view,
  restore,
}: {
  revision: ManuscriptRevisionSummary
  index: number
  revisions: ManuscriptRevisionSummary[]
  id: string
  blocked: string | null
  blockedId: string
  viewing: { id: string; detail: ManuscriptRevisionDetail | null } | null
  busyId: string | null
  view: (revisionId: string) => Promise<void>
  restore: (revision: ManuscriptRevisionSummary) => Promise<void>
}) {
  const { t } = useI18n()
  const isViewing = viewing?.id === revision.id
  const snapshotId = `${id}-version-${revision.number}`
  return (
    <li className="version" data-version={revision.number}>
      <p className="version__when">
        <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
      </p>

      <div className="version__body">
        <p className="version__what" data-testid="manuscript-version-what">
          {describeVersion(revision, revisions)}
          {index === 0 ? (
            <span className="version__now">{t('manuscript.history.savedNow')}</span>
          ) : null}
        </p>
        <p className="version__meta">
          <span>{t('manuscript.history.version', { number: revision.number })}</span>
          <VersionActor name={revision.actorName} />
        </p>
      </div>

      <div className="version__tools">
        <button
          className="button button--text button--sm"
          type="button"
          aria-expanded={isViewing}
          aria-controls={snapshotId}
          aria-label={t(
            isViewing ? 'manuscript.history.hideVersion' : 'manuscript.history.viewVersion',
            { number: revision.number },
          )}
          onClick={() => void view(revision.id)}
          data-testid="manuscript-version-view"
        >
          {isViewing ? t('manuscript.history.hide') : t('manuscript.history.view')}
        </button>
        {index > 0 ? (
          <button
            className="button button--text button--sm"
            type="button"
            disabled={blocked !== null}
            aria-describedby={blocked ? blockedId : undefined}
            aria-label={t('manuscript.history.restoreVersion', {
              number: revision.number,
            })}
            onClick={() => void restore(revision)}
            data-testid="manuscript-version-restore"
          >
            {busyId === revision.id
              ? t('manuscript.history.restoring')
              : t('manuscript.history.restoreButton')}
          </button>
        ) : null}
      </div>

      {isViewing ? (
        <div
          className="version__snapshot"
          id={snapshotId}
          data-testid="manuscript-version-snapshot"
        >
          {viewing.detail === null ? (
            <p className="history__quiet" role="status">
              {t('manuscript.history.opening')}
            </p>
          ) : viewing.detail.content === '' ? (
            <p className="entry__blank">{t('manuscript.history.noText')}</p>
          ) : (
            <div
              className="mshistory__text prose"
              role="region"
              aria-label={t('manuscript.history.textOf', { number: revision.number })}
              tabIndex={0}
            >
              {plainMentions(viewing.detail.content)}
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}
