import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { formatDate } from '../../lib/dates'
import {
  changeCollaboratorRole,
  removeCollaborator,
  type Collaborator,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'

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
      setError(problem instanceof Error ? problem.message : t('universe.collab.memberRoleFailed'))
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
      setError(problem instanceof Error ? problem.message : t('universe.collab.removeFailed'))
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
        <p className="collab__meta">
          {t('universe.collab.joined', { date: formatDate(member.joinedAt) })}
        </p>
      </div>
      <div className="collab__controls">
        <label className="visually-hidden" htmlFor={`${id}-role`}>
          {t('universe.collab.memberRole', { name: member.username })}
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
          aria-label={t('universe.collab.removeLabel', { name: member.username })}
          data-testid="remove-collaborator"
        >
          {t('universe.collab.remove')}
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
            {tx('universe.collab.removeConfirm', { name: <bdi>{member.username}</bdi> })}
          </p>
          <p className="settings__note">{t('universe.collab.removeNote')}</p>
          <div className="form__actions">
            <button
              className="button button--danger"
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              data-testid="confirm-remove-collaborator"
            >
              {busy ? t('universe.collab.removing') : t('universe.collab.removeConfirmButton')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t('universe.collab.keep')}
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
