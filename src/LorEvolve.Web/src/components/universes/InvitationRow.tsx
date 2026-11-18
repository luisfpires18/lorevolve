import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { formatDate } from '../../lib/dates'
import {
  changeInvitationRole,
  revokeInvitation,
  type PendingInvitation,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'
import { CopyLink } from './CopyLink'

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
  const { t } = useI18n()
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
      setError(
        problem instanceof Error ? problem.message : t('universe.collab.invitationRoleFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
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
      setError(problem instanceof Error ? problem.message : t('universe.collab.revokeFailed'))
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
        <p className="collab__meta">
          {t('universe.collab.expires', { date: formatDate(invitation.expiresAt) })}
        </p>
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
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void revoke()}
          disabled={busy}
          aria-label={t('universe.collab.revokeLabel', { email: invitation.email })}
          data-testid="revoke-invitation"
        >
          {t('universe.collab.revoke')}
        </button>
      </div>
      {error ? (
        <p className="form__message collab__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}
