import { ChangeList, EditConflict } from '../EditConflict'
import type { CanonBlockingFinding } from '../../canon/types'
import { CanonBlockNotice } from '../CanonBlockNotice'
import { getEntity } from '../../lore/api'
import type { EntityDetail } from '../../lore/types'
import { useI18n } from '../../i18n'
import type { Draft } from '../../lore/entryDraft'
import { entryChanges } from '../../lore/entryChanges'
import type { EntityType } from '../../lore/typeDefinitions'
import type { Chronology } from '../../chronology/types'
import { Announce } from '../Announce'
import { FormMessage } from '../FormMessage'
import { Callout } from '../Callout'

/** What the entry has to say under its bar: a Canon block, a message, a sent suggestion, a conflict, and the announcer. */
export function EntryNotices({
  universe,
  chronology,
  entityId,
  isNew,
  types,
  detail,
  sent,
  isEditing,
  suggesting,
  message,
  blocked,
  conflict,
  announcement,
  draft,
  keepMine,
  takeLatest,
}: {
  universe: { id: string }
  chronology: Chronology
  entityId: string | undefined
  isNew: boolean
  types: EntityType[]
  detail: EntityDetail | null
  sent: boolean
  isEditing: boolean
  suggesting: boolean
  message: string | null
  blocked: CanonBlockingFinding[] | null
  conflict: boolean
  announcement: string
  draft: Draft
  keepMine: (latest: EntityDetail) => void
  takeLatest: (latest: EntityDetail) => void
}) {
  const { t } = useI18n()
  return (
    <>
      {blocked ? (
        // A blocked creation names an entry that was rolled back, so its ids lead
        // nowhere. Only an edit of something already stored can be linked.
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={!isNew} />
      ) : null}

      {message ? <FormMessage testId="entry-error">{message}</FormMessage> : null}

      {sent && !isEditing ? (
        <Callout look="callout" as="p" role="status" testId="suggestion-sent">
          {t('entity.page.suggestionSent')}
        </Callout>
      ) : null}

      {conflict && isEditing && !isNew && entityId !== undefined ? (
        <EditConflict
          what={t('entity.page.conflictWhat')}
          read={() => getEntity(universe.id, entityId)}
          renderLatest={(latest) => (
            <ChangeList changes={entryChanges(latest, draft, types, chronology, detail)} />
          )}
          onKeepMine={keepMine}
          onUseLatest={takeLatest}
          testId="entry-conflict"
          suggesting={suggesting}
        />
      ) : null}

      <Announce testId="entry-announcer">{announcement}</Announce>
    </>
  )
}
