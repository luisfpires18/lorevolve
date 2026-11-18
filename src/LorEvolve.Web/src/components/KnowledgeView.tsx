import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { t, useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'
import { useUniverseAccess } from '../universes/access'
import { deleteKnowledgeRecord, listKnowledge, type KnowledgeRecord } from '../knowledge/api'
import type { Side } from '../knowledge/recordDraft'
import { RecordList } from './knowledge/RecordList'
import { RecordForm } from './knowledge/RecordForm'
import { Button } from './Button'

interface KnowledgeViewProps {
  universeId: string
  entityId: string
  entityName: string
}

/**
 * An entry's Knowledge view (issue 15): what it knows, in the order the stories tell it, and who knows about it. Every
 * line is the author's own statement - nothing is inferred from scenes, relationships or prose, and nothing here changes
 * lore, Canon or a scene. Each record is anchored to the scene in which it is learnt, or marked known from the start; the
 * list reads what it can without guessing: a knower who is not in that scene's lore or point of view, and anything named
 * that is in the Trash. Members read; whoever edits content adds, changes and removes.
 */
export function KnowledgeView({ universeId, entityId, entityName }: KnowledgeViewProps) {
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const headingId = useId()
  const [knows, setKnows] = useState<KnowledgeRecord[] | null>(null)
  const [about, setAbout] = useState<KnowledgeRecord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reads, setReads] = useState(0)
  const [editing, setEditing] = useState<{ side: Side; record: KnowledgeRecord | null } | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listKnowledge(universeId, { knowerId: entityId }, controller.signal),
      listKnowledge(universeId, { subjectId: entityId }, controller.signal),
    ])
      .then(([mine, others]) => {
        setKnows(mine)
        setAbout(others)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [universeId, entityId, reads])

  const reload = () => {
    setFailed(false)
    setReads((current) => current + 1)
  }

  async function remove(record: KnowledgeRecord) {
    if (
      !(await confirmAction({
        title: t('ai.knowledge.remove.title'),
        message: t('ai.knowledge.remove.message', { statement: record.statement }),
        confirmLabel: t('ai.knowledge.remove.confirm'),
        cancelLabel: t('ai.knowledge.remove.cancel'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    setMessage(null)
    try {
      await deleteKnowledgeRecord(universeId, record.id)
      reload()
    } catch {
      setMessage(t('ai.knowledge.remove.failed'))
    }
  }

  const isLoading = knows === null || about === null

  return (
    <section
      className="relations knowledge"
      aria-labelledby={headingId}
      data-testid="knowledge-view"
    >
      <div className="relations__head">
        <h2 className="relations__title" id={headingId}>
          {t('ai.knowledge.title')}
        </h2>
        {access.editContent ? (
          <Button
            tone="secondary"
            icon={Plus}
            onClick={() => setEditing({ side: 'knows', record: null })}
            data-testid="knowledge-add"
          >
            {tx('ai.knowledge.add', { name: <bdi>{entityName}</bdi> })}
          </Button>
        ) : null}
      </div>
      <p className="relations__quiet">
        {tx('ai.knowledge.lede', { name: <bdi>{entityName}</bdi> })}
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="knowledge-error">
          {message}
        </p>
      ) : null}

      {failed ? (
        <div className="notice notice--error" role="alert" data-testid="knowledge-load-error">
          <p>{t('ai.knowledge.loadFailed')}</p>
          <Button tone="secondary" onClick={reload}>
            {t('ai.knowledge.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <p className="relations__quiet" role="status">
          {t('ai.knowledge.reading')}
        </p>
      ) : (
        <>
          <RecordList
            records={knows}
            side="knows"
            universeId={universeId}
            emptyText={t('ai.knowledge.emptyKnows', { name: entityName })}
            testId="knowledge-knows"
            canEdit={access.editContent}
            onEdit={(record) => setEditing({ side: 'knows', record })}
            onRemove={remove}
          />

          <div className="relations__head knowledge__abouthead">
            <h3 className="relations__reading knowledge__abouttitle">
              {tx('ai.knowledge.knownAbout', { name: <bdi>{entityName}</bdi> })}
            </h3>
            {access.editContent ? (
              <Button
                tone="text"
                icon={Plus}
                onClick={() => setEditing({ side: 'about', record: null })}
                data-testid="knowledge-add-about"
              >
                {tx('ai.knowledge.addAbout', { name: <bdi>{entityName}</bdi> })}
              </Button>
            ) : null}
          </div>
          <RecordList
            records={about}
            side="about"
            universeId={universeId}
            emptyText={t('ai.knowledge.emptyAbout', { name: entityName })}
            testId="knowledge-known-about"
            canEdit={access.editContent}
            onEdit={(record) => setEditing({ side: 'about', record })}
            onRemove={remove}
          />
        </>
      )}

      {editing ? (
        <RecordForm
          key={editing.record?.id ?? `new-${editing.side}`}
          universeId={universeId}
          entityId={entityId}
          entityName={entityName}
          side={editing.side}
          record={editing.record}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      ) : null}
    </section>
  )
}
