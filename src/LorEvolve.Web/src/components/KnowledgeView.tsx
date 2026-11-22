import { useEffect, useId, useState } from 'react'
import { t, useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'
import { useUniverseAccess } from '../universes/access'
import { deleteKnowledgeRecord, listKnowledge, type KnowledgeRecord } from '../knowledge/api'
import type { Side } from '../knowledge/recordDraft'
import { RecordList } from './knowledge/RecordList'
import { RecordForm } from './knowledge/RecordForm'
import { NewButton } from './NewButton'
import { LoadError } from './LoadError'
import { PanelHead } from './PanelHead'
import { ReadingNote } from './QuietNote'
import { FormMessage } from './FormMessage'

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
      <PanelHead
        look="display"
        titleId={headingId}
        title={t('ai.knowledge.title')}
        action={
          access.editContent ? (
            <NewButton
              tone="secondary"
              onClick={() => setEditing({ side: 'knows', record: null })}
              data-testid="knowledge-add"
            >
              {tx('ai.knowledge.add', { name: <bdi>{entityName}</bdi> })}
            </NewButton>
          ) : null
        }
      />
      <ReadingNote>{tx('ai.knowledge.lede', { name: <bdi>{entityName}</bdi> })}</ReadingNote>

      {message ? <FormMessage testId="knowledge-error">{message}</FormMessage> : null}

      {failed ? (
        <LoadError
          message={t('ai.knowledge.loadFailed')}
          onRetry={reload}
          retryLabel={t('ai.knowledge.retry')}
          testId="knowledge-load-error"
        />
      ) : isLoading ? (
        <ReadingNote role="status">{t('ai.knowledge.reading')}</ReadingNote>
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

          <PanelHead
            look="label"
            level={3}
            className="knowledge__abouthead"
            titleClassName="knowledge__abouttitle"
            title={tx('ai.knowledge.knownAbout', { name: <bdi>{entityName}</bdi> })}
            action={
              access.editContent ? (
                <NewButton
                  tone="secondary"
                  onClick={() => setEditing({ side: 'about', record: null })}
                  data-testid="knowledge-add-about"
                >
                  {tx('ai.knowledge.addAbout', { name: <bdi>{entityName}</bdi> })}
                </NewButton>
              ) : null
            }
          />
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
