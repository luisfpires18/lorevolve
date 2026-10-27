import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { formatDate } from '../lib/dates'
import { COLLABORATOR_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../universes/access'
import {
  changeCollaboratorRole,
  changeInvitationRole,
  getCollaborators,
  INVITATION_PENDING,
  invitationLink,
  inviteCollaborator,
  removeCollaborator,
  revokeInvitation,
  type Collaborator,
  type Collaborators,
  type PendingInvitation,
} from '../universes/collaborators'
import { UniverseRole, type UniverseRoleValue } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; data: Collaborators } | { kind: 'error'; message: string }

/**
 * Settings → Collaborators (ADR 0041 amendment): invite someone by email, and manage who works here. The owner's alone -
 * the tab is never offered to anyone else, and the API refuses them anyway.
 *
 * LorEvolve sends no email. An invitation is claimed only through its link, which the owner copies and sends by hand, by the
 * account with that address; this screen says exactly that and never claims a message went out. Creating one answers the
 * same whether an account holds the address or not.
 */
export function CollaboratorsPanel({ universeId }: { universeId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [created, setCreated] = useState<PendingInvitation | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getCollaborators(universeId, controller.signal)
      .then((data) => setState({ kind: 'ready', data }))
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: problem instanceof Error ? problem.message : 'Collaborators could not be read.',
        })
      })
    return () => {
      controller.abort()
    }
  }, [universeId, reloadKey])

  function update(change: (data: Collaborators) => Collaborators) {
    setState((current) =>
      current.kind === 'ready' ? { kind: 'ready', data: change(current.data) } : current,
    )
  }

  const data = state.kind === 'ready' ? state.data : null

  return (
    <div className="collab" data-testid="collaborators-panel">
      <p className="visually-hidden" role="status" data-testid="collaborators-announcer">
        {announcement}
      </p>

      <section className="settings__section" aria-labelledby="collab-invite-heading">
        <h2 className="settings__heading" id="collab-invite-heading">
          Invite someone
        </h2>
        <p className="settings__note">Invite someone to work on this universe.</p>
        <InviteForm
          universeId={universeId}
          onCreated={(invitation) => {
            setCreated(invitation)
            setHighlight(null)
            update((current) => ({ ...current, invitations: [invitation, ...current.invitations] }))
          }}
          onPending={(invitationId) => {
            setCreated(null)
            setHighlight(invitationId)
            setReloadKey((key) => key + 1)
          }}
        />
        {created ? (
          <div className="collab__created" data-testid="invitation-created">
            <p className="collab__createdtitle" role="status">
              Invitation created
            </p>
            <p className="settings__note">
              LorEvolve does not send email. Send{' '}
              <bdi className="collab__email">{created.email}</bdi> this link; they accept it signed
              in with that email:
            </p>
            <CopyLink
              claimToken={created.claimToken}
              label="Copy invite link"
              testId="copy-created-link"
            />
          </div>
        ) : null}
      </section>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading collaborators…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <section
            className="settings__section collab__section"
            aria-labelledby="collab-people-heading"
          >
            <h2 className="settings__heading" id="collab-people-heading">
              People
            </h2>
            {data.members.length === 0 ? (
              <p className="settings__note" data-testid="collaborators-empty">
                Nobody else works on this universe yet.
              </p>
            ) : (
              <ul className="collab__list" data-testid="collaborator-list">
                {data.members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    universeId={universeId}
                    member={member}
                    onChanged={(next) => {
                      update((current) => ({
                        ...current,
                        members: current.members.map((item) =>
                          item.userId === next.userId ? next : item,
                        ),
                      }))
                      setAnnouncement(`${next.username} is now ${ROLE_LABELS[next.role]}.`)
                    }}
                    onRemoved={() => {
                      update((current) => ({
                        ...current,
                        members: current.members.filter((item) => item.userId !== member.userId),
                      }))
                      setAnnouncement(`${member.username} no longer collaborates on this universe.`)
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section
            className="settings__section collab__section"
            aria-labelledby="collab-pending-heading"
          >
            <h2 className="settings__heading" id="collab-pending-heading">
              Pending invitations
            </h2>
            {data.invitations.length === 0 ? (
              <p className="settings__note" data-testid="invitations-empty">
                No invitations are waiting.
              </p>
            ) : (
              <ul className="collab__list" data-testid="pending-invitation-list">
                {data.invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    universeId={universeId}
                    invitation={invitation}
                    highlighted={highlight === invitation.id}
                    onChanged={(next) => {
                      update((current) => ({
                        ...current,
                        invitations: current.invitations.map((item) =>
                          item.id === next.id ? next : item,
                        ),
                      }))
                      setAnnouncement(
                        `The invitation to ${next.email} is now for ${ROLE_LABELS[next.role]}.`,
                      )
                    }}
                    onRevoked={() => {
                      update((current) => ({
                        ...current,
                        invitations: current.invitations.filter(
                          (item) => item.id !== invitation.id,
                        ),
                      }))
                      if (created?.id === invitation.id) setCreated(null)
                      setAnnouncement(`The invitation to ${invitation.email} was revoked.`)
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

// ---------- Inviting ----------

function InviteForm({
  universeId,
  onCreated,
  onPending,
}: {
  universeId: string
  onCreated: (invitation: PendingInvitation) => void
  onPending: (invitationId: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UniverseRoleValue>(UniverseRole.Editor)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; role?: string; form?: string }>({})
  const emailInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) {
      setErrors({ email: 'Enter the email address of the person to invite.' })
      emailInput.current?.focus()
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const invitation = await inviteCollaborator(universeId, email.trim(), role)
      setEmail('')
      onCreated(invitation)
    } catch (problem: unknown) {
      if (problem instanceof ApiError && problem.code === INVITATION_PENDING) {
        const invitationId = (problem.problem as { invitationId?: string } | null)?.invitationId
        setErrors({
          email:
            'This address already has a pending invitation. It is listed below, to change, copy or revoke.',
        })
        if (invitationId) onPending(invitationId)
      } else if (problem instanceof ApiError && Object.keys(problem.fieldErrors).length > 0) {
        setErrors({ email: problem.fieldErrors.email, role: problem.fieldErrors.role })
      } else {
        setErrors({
          form: problem instanceof Error ? problem.message : 'The invitation could not be created.',
        })
      }
      emailInput.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form collab__invite" onSubmit={submit} noValidate data-testid="invite-form">
      <div className="field">
        <label className="field__label" htmlFor="invite-email">
          Email
        </label>
        <input
          ref={emailInput}
          id="invite-email"
          name="email"
          className="field__input"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'invite-email-error' : undefined}
          data-testid="invite-email"
        />
        {errors.email ? (
          <p className="field__error" id="invite-email-error" data-testid="invite-email-error">
            {errors.email}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="invite-role">
          Role
        </label>
        <RoleSelect
          id="invite-role"
          value={role}
          onChange={setRole}
          describedBy={errors.role ? 'invite-role-hint invite-role-error' : 'invite-role-hint'}
          testId="invite-role"
        />
        <p
          className="field__hint collab__rolehint"
          id="invite-role-hint"
          data-testid="invite-role-hint"
        >
          {ROLE_DESCRIPTIONS[role]}
        </p>
        {errors.role ? (
          <p className="field__error" id="invite-role-error">
            {errors.role}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p className="form__message" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="form__actions">
        <button className="button" type="submit" disabled={busy} data-testid="create-invitation">
          {busy ? 'Creating' : 'Create invitation'}
        </button>
      </div>
    </form>
  )
}

// ---------- People ----------

function MemberRow({
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
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useRef<HTMLDivElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true
      confirm.current?.focus()
    } else if (wasConfirming.current) {
      wasConfirming.current = false
      removeButton.current?.focus()
    }
  }, [confirming])

  async function changeRole(role: UniverseRoleValue) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await changeCollaboratorRole(universeId, member.userId, role))
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : 'The role could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await removeCollaborator(universeId, member.userId)
      onRemoved()
    } catch (problem: unknown) {
      // Already gone - removed in another tab - is what was asked for.
      if (problem instanceof ApiError && problem.status === 404) {
        onRemoved()
        return
      }
      setError(problem instanceof Error ? problem.message : 'They could not be removed.')
      setBusy(false)
    }
  }

  return (
    <li className="collab__row" data-testid="collaborator-row" data-username={member.username}>
      {/* A monogram for the eye to find a person by; drawn from the attribute, so it is never part of the row's text. */}
      <span
        className="collab__mark"
        aria-hidden="true"
        data-initial={Array.from(member.username)[0]?.toUpperCase() ?? ''}
      />
      <div className="collab__who">
        <p className="collab__name">
          <bdi>{member.username}</bdi>
        </p>
        <p className="collab__meta">Joined {formatDate(member.joinedAt)}</p>
      </div>
      <div className="collab__controls">
        <label className="visually-hidden" htmlFor={`${id}-role`}>
          Role for {member.username}
        </label>
        <RoleSelect
          id={`${id}-role`}
          value={member.role}
          onChange={(role) => void changeRole(role)}
          disabled={busy}
          testId="collaborator-role"
        />
        <button
          ref={removeButton}
          className="button button--secondary button--danger-quiet"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          aria-label={`Remove ${member.username}`}
          data-testid="remove-collaborator"
        >
          Remove
        </button>
      </div>
      {confirming ? (
        <div
          className="settings__confirm collab__confirm"
          role="group"
          aria-labelledby={`${id}-confirm`}
          tabIndex={-1}
          ref={confirm}
          data-testid="remove-collaborator-confirm"
        >
          <p className="settings__confirmtitle" id={`${id}-confirm`}>
            Remove <bdi>{member.username}</bdi> from this universe?
          </p>
          <p className="settings__note">
            They lose access straight away. Nothing they wrote, changed or trashed is undone, and
            their account is not affected.
          </p>
          <div className="form__actions">
            <button
              className="button button--danger"
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              data-testid="confirm-remove-collaborator"
            >
              {busy ? 'Removing' : 'Remove'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="form__message collab__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

// ---------- Pending invitations ----------

function InvitationRow({
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
      setError(problem instanceof Error ? problem.message : 'The role could not be changed.')
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
      setError(problem instanceof Error ? problem.message : 'The invitation could not be revoked.')
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
        <p className="collab__meta">Expires {formatDate(invitation.expiresAt)}</p>
      </div>
      <div className="collab__controls">
        <label className="visually-hidden" htmlFor={`${id}-role`}>
          Role for {invitation.email}
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
          label="Copy invite link"
          testId="copy-invite-link"
        />
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void revoke()}
          disabled={busy}
          aria-label={`Revoke the invitation to ${invitation.email}`}
          data-testid="revoke-invitation"
        >
          Revoke
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

// ---------- Shared pieces ----------

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  describedBy,
  testId,
}: {
  id: string
  value: UniverseRoleValue
  onChange: (role: UniverseRoleValue) => void
  disabled?: boolean
  describedBy?: string
  testId: string
}) {
  return (
    <select
      id={id}
      name={id}
      className="field__input field__input--select collab__role"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) as UniverseRoleValue)}
      disabled={disabled}
      aria-describedby={describedBy}
      data-testid={testId}
    >
      {COLLABORATOR_ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  )
}

/**
 * Copies an invitation's link. When the clipboard cannot be written - an older browser, a denied permission, a page not
 * served over https - the link is shown selected instead, so it can be copied by hand. Never a silent failure.
 */
function CopyLink({
  claimToken,
  label,
  testId,
}: {
  claimToken: string
  label: string
  testId: string
}) {
  const link = invitationLink(claimToken)
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const manualInput = useRef<HTMLInputElement>(null)
  const inputId = useId()

  useEffect(() => {
    if (status === 'manual') manualInput.current?.select()
  }, [status])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(link)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }

  return (
    <span className="collab__copy">
      <button
        className="button button--secondary"
        type="button"
        onClick={() => void copy()}
        data-testid={testId}
      >
        {label}
      </button>
      <span className="collab__copystatus" role="status" data-testid={`${testId}-status`}>
        {status === 'copied' ? 'Invite link copied.' : ''}
      </span>
      {status === 'manual' ? (
        <span className="collab__manual">
          <label className="field__label" htmlFor={inputId}>
            Copy this link
          </label>
          <input
            ref={manualInput}
            id={inputId}
            name="invite-link"
            className="field__input"
            type="text"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
            data-testid={`${testId}-manual`}
          />
        </span>
      ) : null}
    </span>
  )
}
