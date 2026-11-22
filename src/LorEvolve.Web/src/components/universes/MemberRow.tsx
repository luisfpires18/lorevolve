import { useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { monogram } from '../../lib/monogram'
import {
  changeCollaboratorRole,
  removeCollaborator,
  type Collaborator,
} from '../../universes/collaborators'
import { CollabRow } from './CollabRow'
import { useRoleChange } from './useRoleChange'
import { Button } from '../Button'
import { quietlyGone } from '../../lib/errorText'
import { useConfirmFocus } from '../../lib/useConfirmFocus'
import { DateText } from '../DateText'

// ---------- People ----------

export function MemberRow({
  universeId,
  member,
  onChanged,
  onRemoved,
}: {
  universeId: string
  member: Collaborator
  onChanged: (next: Collaborator) => void
  onRemoved: () => void
}) {
  const { t, tx } = useI18n()
  const { busy, error, run, changeRole } = useRoleChange(
    (role) => changeCollaboratorRole(universeId, member.userId, role),
    onChanged,
    t('universe.collab.memberRoleFailed'),
  )
  const [confirming, setConfirming] = useState(false)
  const confirm = useRef<HTMLDivElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  useConfirmFocus(confirming, confirm, removeButton)

  function remove() {
    return run(async () => {
      try {
        await removeCollaborator(universeId, member.userId)
      } catch (problem: unknown) {
        // Already gone - removed in another tab - is what was asked for.
        if (!quietlyGone(problem)) throw problem
      }
      onRemoved()
    }, t('universe.collab.removeFailed'))
  }

  return (
    <CollabRow
      testId="collaborator-row"
      data={{ 'data-username': member.username }}
      mark={
        // A monogram for the eye to find a person by; drawn from the attribute, so it is never part of the row's text.
        <span
          className="collab__mark"
          aria-hidden="true"
          data-initial={monogram(member.username, '')}
        />
      }
      name={member.username}
      meta={tx('universe.collab.joined', { date: <DateText value={member.joinedAt} /> })}
      roleLabel={t('universe.collab.memberRole', { name: member.username })}
      role={member.role}
      onRole={(role) => void changeRole(role)}
      roleTestId="collaborator-role"
      busy={busy}
      actions={
        <Button
          tone="danger-quiet"
          ref={removeButton}
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          aria-label={t('universe.collab.removeLabel', { name: member.username })}
          data-testid="remove-collaborator"
        >
          {t('universe.collab.remove')}
        </Button>
      }
      remove={
        confirming
          ? {
              className: 'collab__confirm',
              title: tx('universe.collab.removeConfirm', { name: <bdi>{member.username}</bdi> }),
              note: t('universe.collab.removeNote'),
              submitLabel: t('universe.collab.removeConfirmButton'),
              busyLabel: t('universe.collab.removing'),
              keepLabel: t('universe.collab.keep'),
              busy,
              onConfirm: () => void remove(),
              onKeep: () => setConfirming(false),
              panelRef: confirm,
              testId: 'remove-collaborator-confirm',
              submitTestId: 'confirm-remove-collaborator',
            }
          : null
      }
      error={error}
    />
  )
}
