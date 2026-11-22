import { Link } from 'react-router-dom'
import { RowMenu } from '../RowMenu'
import { t, useI18n } from '../../i18n'
import { describeScene, type KnowledgeIssue, type KnowledgeRecord } from '../../knowledge/api'
import type { Side } from '../../knowledge/recordDraft'
import { GroupedRows } from '../relationships/RelationsList'
import { ReadingNote } from '../QuietNote'

// ---------- The list ----------

/** Getters, so each word is looked up in the current language when read, never frozen at import. */
const ISSUE_WORDS: Record<KnowledgeIssue, string> = {
  get knower_not_in_scene() {
    return t('ai.knowledge.issue.knowerNotInScene')
  },
  get scene_trashed() {
    return t('ai.knowledge.issue.sceneTrashed')
  },
  get knower_trashed() {
    return t('ai.knowledge.issue.knowerTrashed')
  },
  get subject_trashed() {
    return t('ai.knowledge.issue.subjectTrashed')
  },
}

interface RecordListProps {
  records: KnowledgeRecord[]
  side: Side
  universeId: string
  emptyText: string
  testId: string
  canEdit: boolean
  onEdit: (record: KnowledgeRecord) => void
  onRemove: (record: KnowledgeRecord) => void
}

/** Records as the API orders them, grouped under "Known from the start" and then each story's title. */
export function RecordList({
  records,
  side,
  universeId,
  emptyText,
  testId,
  canEdit,
  onEdit,
  onRemove,
}: RecordListProps) {
  const { tx } = useI18n()

  if (records.length === 0) {
    return <ReadingNote testId={`${testId}-empty`}>{emptyText}</ReadingNote>
  }

  const groups: { label: string; records: KnowledgeRecord[] }[] = []
  for (const record of records) {
    const label = record.scene === null ? t('ai.knowledge.fromStartGroup') : record.scene.storyTitle
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.records.push(record)
    } else {
      groups.push({ label, records: [record] })
    }
  }

  return (
    <GroupedRows
      level={4}
      className="knowledge__list"
      testId={testId}
      groups={groups.map((group) => ({
        label: group.label,
        rows: group.records.map((record) => (
          <li
            className="knowledge__row"
            key={record.id}
            data-testid="knowledge-record"
            data-side={side}
          >
            <p className="knowledge__statement" dir="auto" data-testid="knowledge-statement-text">
              {side === 'about' ? (
                <>
                  {tx('ai.knowledge.knowerKnows', {
                    knower: (
                      <Link to={`/app/universes/${universeId}/lore/${record.knower.id}`}>
                        <bdi>{record.knower.name}</bdi>
                      </Link>
                    ),
                  })}
                </>
              ) : null}
              {record.statement}
            </p>
            <p className="knowledge__meta">
              {side === 'knows' && record.subject ? (
                <>
                  {tx('ai.knowledge.about', {
                    subject: (
                      <Link to={`/app/universes/${universeId}/lore/${record.subject.id}`}>
                        <bdi>{record.subject.name}</bdi>
                      </Link>
                    ),
                  })}
                  {' · '}
                </>
              ) : null}
              {record.scene ? (
                <>
                  {tx('ai.knowledge.since', {
                    scene: (
                      <Link
                        to={`/app/universes/${universeId}/stories/${record.scene.storyId}#scene-${record.scene.sceneId}`}
                        data-testid="knowledge-scene-link"
                      >
                        <bdi>{record.scene.title}</bdi>
                      </Link>
                    ),
                    where: describeScene(record.scene),
                  })}
                </>
              ) : (
                t('ai.knowledge.fromStartMeta')
              )}
              {record.issues.map((issue) => (
                <span
                  className="knowledge__issue"
                  key={issue}
                  data-testid="knowledge-issue"
                  data-issue={issue}
                >
                  {ISSUE_WORDS[issue]}
                </span>
              ))}
            </p>
            {canEdit ? (
              <div className="knowledge__tools">
                <RowMenu
                  label={t('ai.knowledge.actions')}
                  triggerTestId="knowledge-actions"
                  onEdit={() => onEdit(record)}
                  editLabel={t('ai.knowledge.edit')}
                  editTestId="knowledge-edit"
                  onRemove={() => void onRemove(record)}
                  removeLabel={t('ai.knowledge.remove.button')}
                  removeTestId="knowledge-delete"
                />
              </div>
            ) : null}
          </li>
        )),
      }))}
    />
  )
}
