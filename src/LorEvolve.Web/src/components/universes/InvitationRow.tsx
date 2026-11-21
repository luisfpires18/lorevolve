import { useId, useRef } from 'react'
import { useI18n } from '../../i18n'
import {
  changeInvitationRole,
  revokeInvitation,
  type PendingInvitation,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'
import { CopyLink } from './CopyLink'
import { Button } from '../Button'
import { ManageRow } from '../ManageRow'
import { useKeepListInView } from '../entityPickerList'
import { errorText, quietlyGone } from '../../lib/errorText'
import { useFormSave } from '../../lib/useFormSave'
import { QuietNote } from '../QuietNote'
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
  const id = useId()
  const row = useRef<HTMLLIElement>(null)
  // Every refusal shows the error's own message, or the action's fallback (`run`).
  const { isSaving: busy, message: error, save } = useFormSave({ needChange: null, failed: '' })
  useKeepListInView(row, highlighted, 0)

  const run = (work: () => Promise<unknown>, fallback: string) =>
    save(work, { refusal: (problem) => errorText(problem, fallback) })

  function changeRole(role: UniverseRoleValue) {
    return run(
      async () => onChanged(await changeInvitationRole(universeId, invitation.id, role)),
      t('universe.collab.invitationRoleFailed'),
    )
  }

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
    <ManageRow
      rowRef={row}
      highlighted={highlighted}
      testId="pending-invitation-row"
      data={{ 'data-email': invitation.email }}
      whoClassName="collab__who"
      name={invitation.email}
      nameClassName="collab__email"
      meta={
        <QuietNote className="managerow__meta">
          {tx('universe.collab.expires', { date: <DateText value={invitation.expiresAt} /> })}
        </QuietNote>
      }
      controlsClassName="collab__controls"
      controls={
        <>
          <label className="visually-hidden" htmlFor={`${id}-role`}>
            {t('universe.collab.invitationRole', { email: invitation.email })}
          </label>
          <RoleSelect
            id={`${id}-role`}
            value={invitation.role}
            onChange={(role) => void changeRole(role)}
            disabled={busy}
            testId="invitation-role"
          />
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
      errorClassName="collab__error"
    />
  )
}
