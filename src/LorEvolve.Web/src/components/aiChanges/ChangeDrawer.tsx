import { useState } from 'react'
import { ChangeStatus, type Change, type Proposal } from '../../aiChanges/types'
import { itemPath } from '../../aiChanges/itemPath'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { ChangeLines } from './ChangeLines'
import { ChangeWarnings } from './ChangeWarnings'
import { EditChange } from './EditChange'
import { ProseChange } from './ProseChange'

/** One change in full: every line, its prose, its warnings, editing it, and opening what it made. */
export function ChangeDrawer({
  universeId,
  proposal,
  change,
  action,
  needs,
  neededBy,
  editing,
  onEdit,
  onEdited,
  onClose,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  action: string
  needs: string[]
  neededBy: string[]
  editing: boolean
  onEdit: (on: boolean) => void
  onEdited: (next: Proposal) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const pending = change.status === ChangeStatus.Pending
  const link = change.status === ChangeStatus.Committed ? itemPath(universeId, change) : null

  return (
    <Drawer
      testId="ai-change-detail"
      titleId={`aichange-detail-${change.id}`}
      eyebrow={action}
      title={<bdi>{change.title}</bdi>}
      isDirty={editing && dirty}
      busy={saving}
      leaveMessage={t('review.aiChange.edit.leave')}
      closeTestId="ai-change-detail-close"
      onClose={() => {
        onEdit(false)
        onClose()
      }}
    >
      <ChangeLines change={change} lines={change.lines} />

      {change.prose ? <ProseChange change={change} /> : null}

      <ChangeWarnings change={change} pending={pending} needs={needs} neededBy={neededBy} />

      {link ? (
        <Button tone="text" size="sm" to={link} data-testid="ai-change-open-item">
          {t('review.aiChange.item.open')}
        </Button>
      ) : null}

      {change.editable && !editing ? (
        <Button
          tone="text"
          size="sm"
          onClick={() => {
            setDirty(false)
            onEdit(true)
          }}
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
          onDirty={setDirty}
          onSaving={setSaving}
          onCancel={() => onEdit(false)}
          onSaved={(next) => {
            onClose()
            onEdited(next)
          }}
        />
      ) : null}
    </Drawer>
  )
}
