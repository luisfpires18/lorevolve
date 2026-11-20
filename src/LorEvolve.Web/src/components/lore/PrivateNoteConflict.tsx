import { EditConflict, LatestText } from '../EditConflict'
import { getPrivateNote, type PrivateNote } from '../../lore/privateNote'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'

/** The note was saved somewhere else while it was open: the latest, and the two ways out. */
export function PrivateNoteConflict({
  universeId,
  entityId,
  keepMine,
  reread,
}: {
  universeId: string
  entityId: string
  keepMine: (latest: PrivateNote) => void
  reread: () => void
}) {
  const { t } = useI18n()
  return (
    <EditConflict
      what={t('entity.privateNote.what')}
      read={() => getPrivateNote(universeId, entityId)}
      renderLatest={(latest) => (
        <LatestText label={t('entity.privateNote.latestLabel')}>
          {latest.content === '' ? (
            <QuietNote size="body">{t('entity.privateNote.latestBlank')}</QuietNote>
          ) : (
            <div className="recovery__prose prose" dir="auto">
              {latest.content}
            </div>
          )}
        </LatestText>
      )}
      onKeepMine={keepMine}
      onUseLatest={reread}
      testId="private-note-conflict"
    />
  )
}
