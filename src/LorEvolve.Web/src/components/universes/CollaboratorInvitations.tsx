import { useI18n } from '../../i18n'
import { roleLabel } from '../../universes/access'
import type { Collaborators, PendingInvitation } from '../../universes/collaborators'
import { InvitationRow } from './InvitationRow'
import { Section } from '../Section'
import { QuietNote } from '../QuietNote'

/** The invitations nobody has claimed yet, each with a role to change, its link and Revoke. */
export function CollaboratorInvitations({
  universeId,
  data,
  highlight,
  created,
  setCreated,
  update,
  setAnnouncement,
}: {
  universeId: string
  data: Collaborators
  highlight: string | null
  created: PendingInvitation | null
  setCreated: (value: PendingInvitation | null) => void
  update: (change: (data: Collaborators) => Collaborators) => void
  setAnnouncement: (value: string) => void
}) {
  const { t } = useI18n()

  return (
    <Section
      title={t('universe.collab.pending')}
      className="collab__section"
      titleId="collab-pending-heading"
    >
      {data.invitations.length === 0 ? (
        <QuietNote spacing="block" testId="invitations-empty">
          {t('universe.collab.pendingEmpty')}
        </QuietNote>
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
                  t('universe.collab.invitationNowRole', {
                    email: next.email,
                    role: roleLabel(next.role),
                  }),
                )
              }}
              onRevoked={() => {
                update((current) => ({
                  ...current,
                  invitations: current.invitations.filter((item) => item.id !== invitation.id),
                }))
                if (created?.id === invitation.id) setCreated(null)
                setAnnouncement(t('universe.collab.revokedAnnounce', { email: invitation.email }))
              }}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}
