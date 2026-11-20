import { useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { monogram } from '../../lib/monogram'
import { ApiError } from '../../lib/api'
import {
  changeCollaboratorRole,
  removeCollaborator,
  type Collaborator,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'
import { errorText } from '../../lib/errorText'
import { useConfirmFocus } from '../../lib/useConfirmFocus'
import { QuietNote } from '../QuietNote'
import { DateText } from '../DateText'
import { FormMessage } from '../FormMessage'

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
  useConfirmFocus(confirming, confirm, removeButton)

  async function changeRole(role: UniverseRoleValue) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await changeCollaboratorRole(universeId, member.userId, role))
    } catch (problem: unknown) {
      setError(errorText(problem, t('universe.collab.memberRoleFailed')))
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
      setError(errorText(problem, t('universe.collab.removeFailed')))
      setBusy(false)
    }
  }

  return (
    <li className="collab__row" data-testid="collaborator-row" data-username={member.username}>
      {/* A monogram for the eye to find a person by; drawn from the attribute, so it is never part of the row's text. */}
      <span
        className="collab__mark"
        aria-hidden="true"
        data-initial={monogram(member.username, '')}
      />
      <div className="collab__who">
        <p className="collab__name">
          <bdi>{member.username}</bdi>
        </p>
        <QuietNote className="collab__meta">
          {tx('universe.collab.joined', { date: <DateText value={member.joinedAt} /> })}
        </QuietNote>
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
      </div>
      {confirming ? (
        <InlineConfirm
          look="settings"
          className="collab__confirm"
          title={tx('universe.collab.removeConfirm', { name: <bdi>{member.username}</bdi> })}
          panelRef={confirm}
          onKeep={() => setConfirming(false)}
          busy={busy}
          testId="remove-collaborator-confirm"
        >
          <QuietNote spacing="block">{t('universe.collab.removeNote')}</QuietNote>
          <FormActions
            submitLabel={t('universe.collab.removeConfirmButton')}
            busy={busy}
            busyLabel={t('universe.collab.removing')}
            submitTone="danger"
            onSubmit={() => void remove()}
            submitTestId="confirm-remove-collaborator"
            onCancel={() => setConfirming(false)}
            cancelLabel={t('universe.collab.keep')}
            lockCancel
            inline
          />
        </InlineConfirm>
      ) : null}
      {error ? <FormMessage className="collab__error">{error}</FormMessage> : null}
    </li>
  )
}
