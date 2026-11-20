import { useCallback, useState } from 'react'
import { useI18n } from '../i18n'
import {
  getCollaborators,
  type Collaborators,
  type PendingInvitation,
} from '../universes/collaborators'
import { CollaboratorInvitations } from './universes/CollaboratorInvitations'
import { CollaboratorMembers } from './universes/CollaboratorMembers'
import { CopyLink } from './universes/CopyLink'
import { InviteForm } from './universes/InviteForm'
import { LoadError } from './LoadError'
import { Announce } from './Announce'
import { LoadingNote } from './LoadingNote'
import { useAsyncRead } from '../lib/useAsyncRead'
import { Section } from './Section'
import { QuietNote } from './QuietNote'

/**
 * Settings → Collaborators (ADR 0041 amendment): invite someone by email, and manage who works here. The owner's alone -
 * the tab is never offered to anyone else, and the API refuses them anyway.
 *
 * LorEvolve sends no email. An invitation is claimed only through its link, which the owner copies and sends by hand, by the
 * account with that address; this screen says exactly that and never claims a message went out. Creating one answers the
 * same whether an account holds the address or not.
 */
export function CollaboratorsPanel({ universeId }: { universeId: string }) {
  const { t, tx } = useI18n()
  const [announcement, setAnnouncement] = useState('')
  const [created, setCreated] = useState<PendingInvitation | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)

  const read = useCallback(
    (signal: AbortSignal) => getCollaborators(universeId, signal),
    [universeId],
  )
  const {
    load: state,
    setLoad: setState,
    retry,
    refresh,
  } = useAsyncRead(read, { failed: t('universe.collab.loadFailed') })

  function update(change: (data: Collaborators) => Collaborators) {
    setState((current) =>
      current.kind === 'ready' ? { kind: 'ready', value: change(current.value) } : current,
    )
  }

  const data = state.kind === 'ready' ? state.value : null

  return (
    <div className="collab" data-testid="collaborators-panel">
      <Announce testId="collaborators-announcer">{announcement}</Announce>

      <Section title={t('universe.collab.inviteHeading')} titleId="collab-invite-heading" narrow>
        <QuietNote spacing="block">{t('universe.collab.inviteNote')}</QuietNote>
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
            refresh()
          }}
        />
        {created ? (
          <div className="collab__created" data-testid="invitation-created">
            <p className="collab__createdtitle" role="status">
              {t('universe.collab.created')}
            </p>
            <QuietNote spacing="block">
              {tx('universe.collab.createdNote', {
                email: <bdi className="collab__email">{created.email}</bdi>,
              })}
            </QuietNote>
            <CopyLink
              claimToken={created.claimToken}
              label={t('universe.collab.copyCreated')}
              testId="copy-created-link"
            />
          </div>
        ) : null}
      </Section>

      {state.kind === 'loading' ? <LoadingNote>{t('universe.collab.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError
          message={state.message}
          onRetry={retry}
          retryLabel={t('universe.collab.retry')}
        />
      ) : null}

      {data ? (
        <>
          <CollaboratorMembers
            universeId={universeId}
            data={data}
            update={update}
            setAnnouncement={setAnnouncement}
          />

          <CollaboratorInvitations
            universeId={universeId}
            data={data}
            highlight={highlight}
            created={created}
            setCreated={setCreated}
            update={update}
            setAnnouncement={setAnnouncement}
          />
        </>
      ) : null}
    </div>
  )
}
