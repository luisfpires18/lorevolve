import { useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { roleDescription } from '../../universes/access'
import {
  INVITATION_PENDING,
  inviteCollaborator,
  type PendingInvitation,
} from '../../universes/collaborators'
import { UniverseRole, type UniverseRoleValue } from '../../universes/types'
import { Field } from '../Field'
import { RoleSelect } from './RoleSelect'
import { FormActions } from '../FormActions'

// ---------- Inviting ----------

export function InviteForm({
  universeId,
  onCreated,
  onPending,
}: {
  universeId: string
  onCreated: (invitation: PendingInvitation) => void
  onPending: (invitationId: string) => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UniverseRoleValue>(UniverseRole.Editor)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; role?: string; form?: string }>({})
  const emailInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) {
      setErrors({ email: t('universe.collab.emailRequired') })
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
          email: t('universe.collab.alreadyPending'),
        })
        if (invitationId) onPending(invitationId)
      } else if (problem instanceof ApiError && Object.keys(problem.fieldErrors).length > 0) {
        setErrors({ email: problem.fieldErrors.email, role: problem.fieldErrors.role })
      } else {
        setErrors({
          form: problem instanceof Error ? problem.message : t('universe.collab.createFailed'),
        })
      }
      emailInput.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form collab__invite" onSubmit={submit} noValidate data-testid="invite-form">
      <Field
        label={t('universe.collab.email')}
        id="invite-email"
        error={
          errors.email ? <span data-testid="invite-email-error">{errors.email}</span> : undefined
        }
      >
        {(control) => (
          <input
            ref={emailInput}
            id={control.id}
            name="email"
            className="field__input"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={control['aria-invalid']}
            aria-describedby={control['aria-describedby']}
            data-testid="invite-email"
          />
        )}
      </Field>
      <Field label={t('universe.collab.role')} id="invite-role" error={errors.role}>
        {(control) => (
          <>
            <RoleSelect
              id="invite-role"
              value={role}
              onChange={setRole}
              describedBy={
                control['aria-describedby']
                  ? `invite-role-hint ${control['aria-describedby']}`
                  : 'invite-role-hint'
              }
              testId="invite-role"
            />
            <p
              className="field__hint collab__rolehint"
              id="invite-role-hint"
              data-testid="invite-role-hint"
            >
              {roleDescription(role)}
            </p>
          </>
        )}
      </Field>
      {errors.form ? (
        <p className="form__message" role="alert">
          {errors.form}
        </p>
      ) : null}
      <FormActions
        submitLabel={t('universe.collab.create')}
        busy={busy}
        busyLabel={t('universe.collab.creating')}
        submitTestId="create-invitation"
        inline
      />
    </form>
  )
}
