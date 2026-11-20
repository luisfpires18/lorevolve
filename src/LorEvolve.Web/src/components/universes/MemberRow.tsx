import { useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { monogram } from '../../lib/monogram'
import {
  changeCollaboratorRole,
  removeCollaborator,
  type Collaborator,
} from '../../universes/collaborators'
import type { UniverseRoleValue } from '../../universes/types'
import { RoleSelect } from './RoleSelect'
import { Button } from '../Button'
import { ManageRow } from '../ManageRow'
import { errorText, quietlyGone } from '../../lib/errorText'
import { useConfirmFocus } from '../../lib/useConfirmFocus'
import { useFormSave } from '../../lib/useFormSave'
import { QuietNote } from '../QuietNote'
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
  const id = useId()
  // Every refusal shows the error's own message, or the action's fallback (`run`).
  const { isSaving: busy, message: error, save } = useFormSave({ needChange: null, failed: '' })
  const [confirming, setConfirming] = useState(false)
  const confirm = useRef<HTMLDivElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  useConfirmFocus(confirming, confirm, removeButton)

  const run = (work: () => Promise<unknown>, fallback: string) =>
    save(work, { refusal: (problem) => errorText(problem, fallback) })

  function changeRole(role: UniverseRoleValue) {
    return run(
      async () => onChanged(await changeCollaboratorRole(universeId, member.userId, role)),
      t('universe.collab.memberRoleFailed'),
    )
  }

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
    <ManageRow
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
      whoClassName="collab__who"
      name={member.username}
      meta={
        <QuietNote className="managerow__meta">
          {tx('universe.collab.joined', { date: <DateText value={member.joinedAt} /> })}
        </QuietNote>
      }
      controlsClassName="collab__controls"
      controls={
        <>
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
        </>
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
      errorClassName="collab__error"
    />
  )
}
