import { Link } from 'react-router-dom'
import { useUniverseAccess } from '../universes/access'
import {
  CONFLICT_STATUS_LABELS,
  CanonConflictStatus,
  CanonSubjectKind,
  SEVERITY_LABELS,
  SUBJECT_KIND_LABELS,
} from '../canon/types'
import type { CanonConflict, CanonConflictSubject } from '../canon/types'
import { formatDate } from '../lib/dates'

interface Props {
  universeId: string
  conflict: CanonConflict
  isBusy: boolean
  onDismiss: () => void
  onReopen: () => void
}

/**
 * One finding, read as an editorial note rather than a row.
 *
 * The severity stands out in the margin the way a year does on the chronology, because it
 * is the first thing that decides whether this needs attention now. Everything the rule
 * already wrote - the title, the explanation - is shown as written: the wording is the
 * backend's, and rephrasing it here would put two voices on the same finding.
 */
export function ConflictEntry({ universeId, conflict, isBusy, onDismiss, onReopen }: Props) {
  const access = useUniverseAccess()
  const isResolved = conflict.status === CanonConflictStatus.Resolved
  const isDismissed = conflict.status === CanonConflictStatus.Dismissed

  return (
    <li
      className="finding"
      data-severity={conflict.severity}
      data-status={conflict.status}
      data-testid={`finding-${conflict.ruleCode}`}
    >
      <div className="finding__margin">
        <span className="finding__mark" aria-hidden="true" />
        <span className="finding__severity">{SEVERITY_LABELS[conflict.severity]}</span>
        <span className="finding__rule">{conflict.ruleCode}</span>
      </div>

      <div className="finding__body">
        <p className="finding__stamp">
          <span className="finding__status">{CONFLICT_STATUS_LABELS[conflict.status]}</span>
          <span className="finding__when">
            {isResolved && conflict.resolvedAt
              ? `Resolved ${formatDate(conflict.resolvedAt)}`
              : `Found ${formatDate(conflict.createdAt)}`}
          </span>
        </p>

        <h3 className="finding__title">{conflict.title}</h3>
        <p className="finding__account">{conflict.explanation}</p>

        {conflict.subjects.length > 0 ? (
          <ul className="finding__subjects">
            {conflict.subjects.map((subject) => (
              <li key={`${subject.kind}-${subject.subjectId}-${subject.role}`}>
                <span className="finding__role">{subject.role}</span>
                {subjectName(universeId, subject)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="finding__tools">
          {isResolved ? (
            <p className="finding__note">
              Evaluation closed this. It comes back on its own if the problem does.
            </p>
          ) : !access.editContent ? null : (
            <button
              className="button button--secondary button--sm"
              type="button"
              disabled={isBusy}
              onClick={isDismissed ? onReopen : onDismiss}
              data-testid={`${isDismissed ? 'reopen' : 'dismiss'}-${conflict.id}`}
            >
              {isDismissed ? 'Reopen' : 'Dismiss'}
            </button>
          )}
          {isDismissed ? (
            <p className="finding__note">
              Set aside while it lasts. Fixing it closes it; reintroducing it opens it again.
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/**
 * A named subject, linked when it has a place of its own: an entry, a world rule, and a moment -
 * which opens in the timeline's own editor. A null name means the record has gone, or is in the
 * Trash, and the universe has not been evaluated since, which is worth saying plainly rather than
 * showing a link into nothing.
 */
function subjectName(universeId: string, subject: CanonConflictSubject) {
  if (subject.name === null) {
    return <span className="finding__gone">no longer here</span>
  }

  const base = `/app/universes/${universeId}`
  const path =
    subject.kind === CanonSubjectKind.Entity
      ? `${base}/lore/${subject.subjectId}`
      : subject.kind === CanonSubjectKind.WorldRule
        ? `${base}/world-rules/${subject.subjectId}`
        : subject.kind === CanonSubjectKind.TimelineEntry
          ? `${base}/timeline?moment=${subject.subjectId}`
          : null

  if (subject.kind === CanonSubjectKind.Entity && path) {
    return (
      <Link to={path}>
        <bdi>{subject.name}</bdi>
      </Link>
    )
  }

  if (path) {
    return (
      <span>
        <Link to={path} data-testid={`finding-link-${subject.role}`}>
          <bdi>{subject.name}</bdi>
        </Link>
        <span className="finding__kind"> · {SUBJECT_KIND_LABELS[subject.kind].toLowerCase()}</span>
      </span>
    )
  }

  return (
    <span title={SUBJECT_KIND_LABELS[subject.kind]}>
      <bdi>{subject.name}</bdi>
      <span className="finding__kind"> · {SUBJECT_KIND_LABELS[subject.kind].toLowerCase()}</span>
    </span>
  )
}
