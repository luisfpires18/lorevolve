import { useI18n } from '../../i18n'
import { roleLabel } from '../../universes/access'
import type { Collaborators } from '../../universes/collaborators'
import { MemberRow } from './MemberRow'
import { CollabSection } from './CollabSection'

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
    <CollabSection
      title={t('universe.collab.people')}
      titleId="collab-people-heading"
      isEmpty={data.members.length === 0}
      emptyText={t('universe.collab.peopleEmpty')}
      emptyTestId="collaborators-empty"
      listTestId="collaborator-list"
    >
      {data.members.map((member) => (
        <MemberRow
          key={member.userId}
          universeId={universeId}
          member={member}
          onChanged={(next) => {
            update((current) => ({
              ...current,
              members: current.members.map((item) => (item.userId === next.userId ? next : item)),
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
    </CollabSection>
  )
}
