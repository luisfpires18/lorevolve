import { useI18n } from '../../i18n'
import { roleLabel } from '../../universes/access'
import type { Collaborators } from '../../universes/collaborators'
import { MemberRow } from './MemberRow'

/** The people who work here, each with a role to change and a way to remove them. */
export function CollaboratorMembers({
  universeId,
  data,
  update,
  setAnnouncement,
}: {
  universeId: string
  data: Collaborators
  update: (change: (data: Collaborators) => Collaborators) => void
  setAnnouncement: (value: string) => void
}) {
  const { t } = useI18n()

  return (
    <section className="settings__section collab__section" aria-labelledby="collab-people-heading">
      <h2 className="settings__heading" id="collab-people-heading">
        {t('universe.collab.people')}
      </h2>
      {data.members.length === 0 ? (
        <p className="settings__note" data-testid="collaborators-empty">
          {t('universe.collab.peopleEmpty')}
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
                setAnnouncement(
                  t('universe.collab.nowRole', {
                    name: next.username,
                    role: roleLabel(next.role),
                  }),
                )
              }}
              onRemoved={() => {
                update((current) => ({
                  ...current,
                  members: current.members.filter((item) => item.userId !== member.userId),
                }))
                setAnnouncement(t('universe.collab.removedAnnounce', { name: member.username }))
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
