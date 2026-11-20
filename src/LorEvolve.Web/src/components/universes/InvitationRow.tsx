import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import {
  changeInvitationRole,
  revokeInvitation,
  type PendingInvitation,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'
import { CopyLink } from './CopyLink'
import { Button } from '../Button'
import { errorText } from '../../lib/errorText'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  async function changeRole(role: UniverseRoleValue) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await changeInvitationRole(universeId, invitation.id, role))
    } catch (problem: unknown) {
      setError(errorText(problem, t('universe.collab.invitationRoleFailed')))
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    const confirmed = await confirmAction({
      title: t('universe.collab.revokeTitle', { email: invitation.email }),
      message: t('universe.collab.revokeMessage'),
      confirmLabel: t('universe.collab.revokeConfirm'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    setError(null)
    try {
      await revokeInvitation(universeId, invitation.id)
      onRevoked()
    } catch (problem: unknown) {
      if (problem instanceof ApiError && problem.status === 404) {
        onRevoked()
        return
      }
      setError(errorText(problem, t('universe.collab.revokeFailed')))
      setBusy(false)
    }
  }

  return (
    <li
      ref={row}
      className={highlighted ? 'collab__row collab__row--highlight' : 'collab__row'}
      data-testid="pending-invitation-row"
      data-email={invitation.email}
    >
      <div className="collab__who">
        <p className="collab__name collab__email">
          <bdi>{invitation.email}</bdi>
        </p>
        <QuietNote className="collab__meta">
          {tx('universe.collab.expires', { date: <DateText value={invitation.expiresAt} /> })}
        </QuietNote>
      </div>
      <div className="collab__controls">
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
      </div>
      {error ? (
        <p className="form__message collab__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}
