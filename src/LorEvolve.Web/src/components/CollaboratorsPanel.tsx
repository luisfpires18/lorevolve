import { useEffect, useState } from 'react'
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
import { errorText } from '../lib/errorText'

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
  const { t, tx } = useI18n()
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
          message: errorText(problem, t('universe.collab.loadFailed')),
        })
      })
    return () => {
      controller.abort()
    }
  }, [universeId, reloadKey, t])

  function update(change: (data: Collaborators) => Collaborators) {
    setState((current) =>
      current.kind === 'ready' ? { kind: 'ready', data: change(current.data) } : current,
    )
  }

  const data = state.kind === 'ready' ? state.data : null

  return (
    <div className="collab" data-testid="collaborators-panel">
      <Announce testId="collaborators-announcer">{announcement}</Announce>

      <section className="settings__section" aria-labelledby="collab-invite-heading">
        <h2 className="settings__heading" id="collab-invite-heading">
          {t('universe.collab.inviteHeading')}
        </h2>
        <p className="settings__note">{t('universe.collab.inviteNote')}</p>
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
              {t('universe.collab.created')}
            </p>
            <p className="settings__note">
              {tx('universe.collab.createdNote', {
                email: <bdi className="collab__email">{created.email}</bdi>,
              })}
            </p>
            <CopyLink
              claimToken={created.claimToken}
              label={t('universe.collab.copyCreated')}
              testId="copy-created-link"
            />
          </div>
        ) : null}
      </section>

      {state.kind === 'loading' ? <LoadingNote>{t('universe.collab.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError
          message={state.message}
          onRetry={() => setReloadKey((key) => key + 1)}
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
