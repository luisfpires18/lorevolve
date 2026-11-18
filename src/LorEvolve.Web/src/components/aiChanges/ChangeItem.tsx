import { useId } from 'react'
import { ChangeStatus, type Change, type Proposal } from '../../aiChanges/types'
import { itemPath } from '../../aiChanges/itemPath'
import { useI18n } from '../../i18n'
import { actionWords, isProse } from '../../aiChanges/changeTraits'
import { ChangeDetails } from './ChangeDetails'
import { EditChange } from './EditChange'
import { Button } from '../Button'

export function ChangeItem({
  universeId,
  proposal,
  change,
  byKey,
  selectable,
  selected,
  onToggle,
  editing,
  onEdit,
  onEdited,
  onUploaded,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  byKey: Map<string, Change>
  selectable: boolean
  selected: boolean
  onToggle: (on: boolean) => void
  editing: boolean
  onEdit: (on: boolean) => void
  onEdited: (next: Proposal) => void
  onUploaded: (next: Proposal) => void
}) {
  const { t, tx } = useI18n()
  const titleId = useId()
  const detailsId = useId()
  const pending = change.status === ChangeStatus.Pending
  const link = change.status === ChangeStatus.Committed ? itemPath(universeId, change) : null
  const named = (keys: string[]) => keys.map((key) => byKey.get(key)?.title ?? key)
  // Only what still waits: a change already applied or rejected is nothing to select or reject with this one.
  const waiting = (keys: string[]) =>
    keys.filter((key) => byKey.get(key)?.status === ChangeStatus.Pending)
  const needs = waiting(change.dependsOn)
  const neededBy = waiting(change.neededBy)

  return (
    <li
      className="aichangeitem"
      data-testid="ai-change-item"
      data-key={change.key}
      data-status={change.status}
      data-conflict={change.isConflict ? 'true' : 'false'}
      aria-labelledby={titleId}
    >
      <div className="aichangeitem__head">
        {selectable ? (
          <input
            className="aichangeitem__check"
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            aria-labelledby={titleId}
            aria-describedby={detailsId}
            data-testid="ai-change-select"
          />
        ) : null}
        <div className="aichangeitem__heading">
          <span className="aichangeitem__action" data-action={change.action}>
            {isProse(change) ? t('review.aiChange.item.prose') : actionWords(change)}
          </span>
          <h2 className="aichangeitem__title" id={titleId} dir="auto">
            {change.title}
          </h2>
        </div>
        {!pending ? (
          <span className="aichangeitem__outcome" data-testid="ai-change-outcome">
            {change.resolvedByName
              ? tx(
                  change.status === ChangeStatus.Committed
                    ? 'review.aiChange.item.appliedBy'
                    : change.resolutionNote === 'expired'
                      ? 'review.aiChange.item.expiredBy'
                      : 'review.aiChange.item.rejectedBy',
                  { name: <bdi>{change.resolvedByName}</bdi> },
                )
              : change.status === ChangeStatus.Committed
                ? t('review.aiChange.item.applied')
                : change.resolutionNote === 'expired'
                  ? t('review.aiChange.item.expired')
                  : t('review.aiChange.item.rejected')}
          </span>
        ) : null}
      </div>

      <ChangeDetails
        detailsId={detailsId}
        universeId={universeId}
        proposal={proposal}
        change={change}
        pending={pending}
        needs={needs}
        neededBy={neededBy}
        named={named}
        onUploaded={onUploaded}
      />

      {link ? (
        <Button tone="text" size="sm" to={link} data-testid="ai-change-open-item">
          {t('review.aiChange.item.open')}
        </Button>
      ) : null}

      {change.editable && !editing ? (
        <Button
          tone="text"
          size="sm"
          onClick={() => onEdit(true)}
          aria-label={t('review.aiChange.item.editLabel', { title: change.title })}
          data-testid="ai-change-edit"
        >
          {t('review.aiChange.item.edit')}
        </Button>
      ) : null}

      {editing && change.editable ? (
        <EditChange
          universeId={universeId}
          proposal={proposal}
          change={change}
          values={change.editable}
          onCancel={() => onEdit(false)}
          onSaved={onEdited}
        />
      ) : null}
    </li>
  )
}
