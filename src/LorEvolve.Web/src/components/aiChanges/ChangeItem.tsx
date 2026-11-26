import { useId, useState } from 'react'
import { Eye } from 'lucide-react'
import { ChangeStatus, type Change, type Proposal } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import { actionWords, isProse } from '../../aiChanges/changeTraits'
import { ChangeDrawer } from './ChangeDrawer'
import { ChangeLines } from './ChangeLines'
import { MediaChange } from './MediaChange'
import { ChangeWarnings } from './ChangeWarnings'
import { IconButton } from '../IconButton'
import { QuietNote } from '../QuietNote'
import { SectionTitle } from '../Section'

/** How many lines a card shows before the details drawer has to be opened. */
const PREVIEW_LINES = 3

/** One change as a card: what it does to what, its first lines and anything stopping it; the eye opens it in full. */
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
  const { t, tn, tx } = useI18n()
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const detailsId = useId()
  const pending = change.status === ChangeStatus.Pending
  const named = (keys: string[]) => keys.map((key) => byKey.get(key)?.title ?? key)
  // Only what still waits: a change already applied or rejected is nothing to select or reject with this one.
  const waiting = (keys: string[]) =>
    keys.filter((key) => byKey.get(key)?.status === ChangeStatus.Pending)
  const needs = waiting(change.dependsOn)
  const neededBy = waiting(change.neededBy)
  const action = isProse(change) ? t('review.aiChange.item.prose') : actionWords(change)

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
            {action}
          </span>
          <SectionTitle id={titleId} dir="auto">
            {change.title}
          </SectionTitle>
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
        <IconButton
          icon={Eye}
          size="sm"
          label={t('review.aiChange.item.details', { title: change.title })}
          onClick={() => setOpen(true)}
          data-testid="ai-change-details"
        />
      </div>

      <div id={detailsId} className="aichangeitem__body">
        <ChangeLines change={change} lines={change.lines.slice(0, PREVIEW_LINES)} />
        {change.lines.length > PREVIEW_LINES ? (
          <QuietNote size="xs">
            {tn('review.aiChange.item.more', change.lines.length - PREVIEW_LINES, {
              n: change.lines.length - PREVIEW_LINES,
            })}
          </QuietNote>
        ) : null}
        {change.prose ? (
          <p className="aichangeitem__excerpt" dir="auto">
            {change.prose.proposed}
          </p>
        ) : null}
        {change.media ? (
          <MediaChange
            universeId={universeId}
            proposal={proposal}
            change={change}
            onUploaded={onUploaded}
          />
        ) : null}
        <ChangeWarnings
          change={change}
          pending={pending}
          needs={named(needs)}
          neededBy={named(neededBy)}
        />
      </div>

      {open ? (
        <ChangeDrawer
          universeId={universeId}
          proposal={proposal}
          change={change}
          action={action}
          needs={named(needs)}
          neededBy={named(neededBy)}
          editing={editing}
          onEdit={onEdit}
          onEdited={onEdited}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  )
}
