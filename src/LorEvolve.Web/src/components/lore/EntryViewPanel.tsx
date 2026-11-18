import { KnowledgeView } from '../KnowledgeView'
import { EntityHistory } from '../EntityHistory'
import { ProgressionView } from '../ProgressionView'
import { RelationshipSection } from '../RelationshipSection'
import type { EntityDetail } from '../../lore/types'
import type { EntityType } from '../../lore/typeDefinitions'
import type { Chronology } from '../../chronology/types'

/**
 * Which of the entry's three views is open. Read from the address and written back to it, never held
 * as page state: each one is a place, so it reloads, it is linkable, and Back leaves it (ADR 0028).
 */
export type EntryView = 'article' | 'progression' | 'relations' | 'history'

/** The Progression, Relations and History views, each beside the picture. */
export function EntryViewPanel({
  view,
  universe,
  chronology,
  entityId,
  types,
  detail,
  historyKey,
  refreshDetail,
  reloadAfterRestore,
}: {
  view: EntryView
  universe: { id: string }
  chronology: Chronology
  entityId: string | undefined
  types: EntityType[]
  detail: EntityDetail | null
  historyKey: number
  refreshDetail: () => Promise<void>
  reloadAfterRestore: () => Promise<void>
}) {
  return view === 'progression' ? (
    <div className="entry__main entry__view">
      {detail ? (
        <ProgressionView
          key={detail.id}
          universeId={universe.id}
          entry={detail}
          definitions={types.find((type) => type.id === detail.entityTypeId)?.fields ?? []}
          chronology={chronology}
          onChanged={() => void refreshDetail()}
        />
      ) : null}
    </div>
  ) : view === 'relations' ? (
    <div className="entry__main entry__view">
      <RelationshipSection
        universeId={universe.id}
        entityId={entityId!}
        entityName={detail?.name ?? ''}
        chronology={chronology}
      />
      {/* What the entry knows, and who knows about it (issue 15): under its relations, read by every member. A
              fifth view would not fit the entry's bar on a phone, and knowledge is what this entry has with others. */}
      <KnowledgeView
        key={entityId}
        universeId={universe.id}
        entityId={entityId!}
        entityName={detail?.name ?? ''}
      />
    </div>
  ) : (
    <div className="entry__main entry__view">
      <EntityHistory
        universeId={universe.id}
        entityId={entityId!}
        chronology={chronology}
        reloadKey={historyKey}
        currentVersion={detail?.version ?? 0}
        onRestored={() => void reloadAfterRestore()}
      />
    </div>
  )
}
