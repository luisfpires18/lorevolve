import { Link } from 'react-router-dom'
import { Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import { describeScene, type KnowledgeIssue, type KnowledgeRecord } from '../../knowledge/api'
import type { Side } from '../../knowledge/recordDraft'

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
    return (
      <p className="relations__quiet" data-testid={`${testId}-empty`}>
        {emptyText}
      </p>
    )
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
    <ul className="relations__list knowledge__list" data-testid={testId}>
      {groups.map((group) => (
        <li className="relations__group" key={group.label}>
          <h4 className="relations__reading">
            <bdi>{group.label}</bdi>
          </h4>
          <ul className="relations__rows">
            {group.records.map((record) => (
              <li
                className="knowledge__row"
                key={record.id}
                data-testid="knowledge-record"
                data-side={side}
              >
                <p
                  className="knowledge__statement"
                  dir="auto"
                  data-testid="knowledge-statement-text"
                >
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
                    <ActionMenu label={t('ai.knowledge.actions')} triggerTestId="knowledge-actions">
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => onEdit(record)}
                        data-testid="knowledge-edit"
                      >
                        <ActionIcon icon={Pencil} />
                        {t('ai.knowledge.edit')}
                      </button>
                      <button
                        className="actionmenu__item actionmenu__item--danger"
                        type="button"
                        onClick={() => void onRemove(record)}
                        data-testid="knowledge-delete"
                      >
                        <ActionIcon icon={Trash} />
                        {t('ai.knowledge.remove.button')}
                      </button>
                    </ActionMenu>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
