import { useRef } from 'react'
import { useI18n } from '../../i18n'
import {
  changeInvitationRole,
  revokeInvitation,
  type PendingInvitation,
} from '../../universes/collaborators'
import { CopyLink } from './CopyLink'
import { CollabRow } from './CollabRow'
import { useRoleChange } from './useRoleChange'
import { Button } from '../Button'
import { useKeepListInView } from '../entityPickerList'
import { quietlyGone } from '../../lib/errorText'
import { confirmAction } from '../../lib/confirm'
import { DateText } from '../DateText'

// ---------- Pending invitations ----------

export function InvitationRow({
  universeId,
  invitation,
  highlighted,
  onChanged,
  onRevoked,
}: {
  universeId: string
  invitation: PendingInvitation
  highlighted: boolean
  onChanged: (next: PendingInvitation) => void
  onRevoked: () => void
}) {
  const { t, tx } = useI18n()
  const row = useRef<HTMLLIElement>(null)
  const { busy, error, run, changeRole } = useRoleChange(
    (role) => changeInvitationRole(universeId, invitation.id, role),
    onChanged,
    t('universe.collab.invitationRoleFailed'),
  )
  useKeepListInView(row, highlighted, 0)

  // Revoke asks in a dialog; a person's Remove confirms inline (owner decision on #255).
  async function revoke() {
    const confirmed = await confirmAction({
      title: t('universe.collab.revokeTitle', { email: invitation.email }),
      message: t('universe.collab.revokeMessage'),
      confirmLabel: t('universe.collab.revokeConfirm'),
      variant: 'destructive',
    })
    if (!confirmed) return
    await run(async () => {
      try {
        await revokeInvitation(universeId, invitation.id)
      } catch (problem: unknown) {
        if (!quietlyGone(problem)) throw problem
      }
      onRevoked()
    }, t('universe.collab.revokeFailed'))
  }

  return (
    <CollabRow
      rowRef={row}
      highlighted={highlighted}
      testId="pending-invitation-row"
      data={{ 'data-email': invitation.email }}
      name={invitation.email}
      nameClassName="collab__email"
      meta={tx('universe.collab.expires', { date: <DateText value={invitation.expiresAt} /> })}
      roleLabel={t('universe.collab.invitationRole', { email: invitation.email })}
      role={invitation.role}
      onRole={(role) => void changeRole(role)}
      roleTestId="invitation-role"
      busy={busy}
      actions={
        <>
          <CopyLink
            claimToken={invitation.claimToken}
            label={t('universe.collab.copyInvite')}
            testId="copy-invite-link"
          />
          <Button
            tone="secondary"
            onClick={() => void revoke()}
            disabled={busy}
            aria-label={t('universe.collab.revokeLabel', { email: invitation.email })}
            data-testid="revoke-invitation"
          >
            {t('universe.collab.revoke')}
          </Button>
        </>
      }
      error={error}
    />
  )
}
