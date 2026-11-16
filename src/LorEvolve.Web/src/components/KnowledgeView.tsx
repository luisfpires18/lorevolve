import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { Drawer } from './Drawer'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { useReturnFocus } from '../lib/returnFocus'
import { useUniverseAccess } from '../universes/access'
import {
  createKnowledgeRecord,
  deleteKnowledgeRecord,
  describeScene,
  KNOWLEDGE_STATEMENT_MAX_LENGTH,
  listKnowledge,
  updateKnowledgeRecord,
  type KnowledgeIssue,
  type KnowledgeRecord,
  type KnowledgeRecordInput,
} from '../knowledge/api'
import { getStory, listStories } from '../stories/api'
import { unchaptered } from '../stories/format'
import { readingOrder } from '../stories/structure'
import type { StoryDetail, StorySummary } from '../stories/types'

interface KnowledgeViewProps {
  universeId: string
  entityId: string
  entityName: string
}

/** Which way a record is read from this entry: what the entry knows, or who knows about the entry. */
type Side = 'knows' | 'about'

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
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setEditing({ side: 'knows', record: null })}
            data-testid="knowledge-add"
          >
            <ActionIcon icon={Plus} />
            {tx('ai.knowledge.add', { name: <bdi>{entityName}</bdi> })}
          </button>
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
          <button className="button button--secondary" type="button" onClick={reload}>
            {t('ai.knowledge.retry')}
          </button>
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
              <button
                className="button button--text"
                type="button"
                onClick={() => setEditing({ side: 'about', record: null })}
                data-testid="knowledge-add-about"
              >
                <ActionIcon icon={Plus} />
                {tx('ai.knowledge.addAbout', { name: <bdi>{entityName}</bdi> })}
              </button>
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

// ---------- The list ----------

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
function RecordList({
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

// ---------- The form ----------

interface RecordFormProps {
  universeId: string
  entityId: string
  entityName: string
  side: Side
  record: KnowledgeRecord | null
  onClose: () => void
  onSaved: () => void
}

interface Draft {
  other: EntityChoice | null
  statement: string
  knownFromStart: boolean
  storyId: string
  sceneId: string
}

function draftOf(record: KnowledgeRecord | null, side: Side): Draft {
  if (record === null) {
    return { other: null, statement: '', knownFromStart: false, storyId: '', sceneId: '' }
  }
  const other = side === 'knows' ? record.subject : record.knower
  return {
    other: other ? { id: other.id, name: other.name, typeName: other.typeName } : null,
    statement: record.statement,
    knownFromStart: record.knownFromStart,
    storyId: record.scene?.storyId ?? '',
    sceneId: record.scene?.sceneId ?? '',
  }
}

const draftKey = (draft: Draft) =>
  JSON.stringify([
    draft.other?.id ?? null,
    draft.statement,
    draft.knownFromStart,
    draft.storyId,
    draft.sceneId,
  ])

/**
 * One record, created or edited in a drawer. From the "knows" side the knower is this entry and the subject is chosen;
 * from the "about" side the subject is this entry and the knower is chosen. The scene is picked story first, then scene in
 * reading order, unless the record is known from the start.
 */
function RecordForm({
  universeId,
  entityId,
  entityName,
  side,
  record,
  onClose,
  onSaved,
}: RecordFormProps) {
  const { tx } = useI18n()
  const headingId = useId()
  const statementId = useId()
  const storyId = useId()
  const sceneId = useId()
  const startId = useId()
  const [initial] = useState(() => draftOf(record, side))
  const [draft, setDraft] = useState<Draft>(initial)
  const [stories, setStories] = useState<StorySummary[] | null>(null)
  const [storyRead, setStoryRead] = useState<StoryDetail | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = draftKey(draft) !== draftKey(initial)
  useReturnFocus()

  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('ai.knowledge.form.storiesFailed'))
      })
    return () => controller.abort()
  }, [universeId])

  useEffect(() => {
    if (draft.storyId === '') return
    const controller = new AbortController()
    getStory(universeId, draft.storyId, controller.signal)
      .then(setStoryRead)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('ai.knowledge.form.storyFailed'))
      })
    return () => controller.abort()
  }, [universeId, draft.storyId])

  // The story read is only the chosen story's: a read that arrives for a story no longer chosen is not shown.
  const story = storyRead && storyRead.id === draft.storyId ? storyRead : null
  const scenes = story ? readingOrder(story.arcs, story.chapters, story.scenes) : []
  const chapterLabel = (chapterId: string | null) => {
    if (chapterId === null || !story) return unchaptered()
    const index = story.chapters.findIndex((chapter) => chapter.id === chapterId)
    return index < 0
      ? unchaptered()
      : t('ai.knowledge.form.chapter', {
          number: index + 1,
          title: story.chapters[index].title,
        })
  }
  const groupedScenes = scenes.reduce<{ label: string; scenes: typeof scenes }[]>(
    (groups, scene) => {
      const label = chapterLabel(scene.chapterId)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.scenes.push(scene)
      else groups.push({ label, scenes: [scene] })
      return groups
    },
    [],
  )

  async function save() {
    setErrors({})
    setMessage(null)

    const input: KnowledgeRecordInput = {
      knowerEntityId: side === 'knows' ? entityId : (draft.other?.id ?? ''),
      subjectEntityId: side === 'knows' ? (draft.other?.id ?? null) : entityId,
      statement: draft.statement,
      sceneId: draft.knownFromStart ? null : draft.sceneId || null,
      knownFromStart: draft.knownFromStart,
    }

    const local: Record<string, string> = {}
    if (side === 'about' && !draft.other) local.other = t('ai.knowledge.form.chooseKnower')
    if (draft.statement.trim() === '') local.statement = t('ai.knowledge.form.sayWhat')
    if (!draft.knownFromStart && !draft.sceneId) {
      local.sceneId = t('ai.knowledge.form.chooseScene')
    }
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    setIsSaving(true)
    try {
      if (record) await updateKnowledgeRecord(universeId, record.id, input)
      else await createKnowledgeRecord(universeId, input)
      onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 400) {
        const fields = error.fieldErrors
        setErrors({
          other: fields[side === 'knows' ? 'subjectentityid' : 'knowerentityid'] ?? '',
          statement: fields.statement ?? '',
          sceneId: fields.sceneid ?? '',
        })
        if (
          !fields.statement &&
          !fields.sceneid &&
          !fields.subjectentityid &&
          !fields.knowerentityid
        ) {
          setMessage(error.message)
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage(t('ai.knowledge.form.gone'))
      } else {
        setMessage(t('ai.knowledge.form.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      testId="knowledge-form"
      titleId={headingId}
      eyebrow={t('ai.knowledge.form.eyebrow')}
      title={
        record
          ? t('ai.knowledge.form.titleEdit')
          : side === 'knows'
            ? tx('ai.knowledge.form.titleKnows', { name: <bdi>{entityName}</bdi> })
            : tx('ai.knowledge.form.titleAbout', { name: <bdi>{entityName}</bdi> })
      }
      context={<p className="drawer__context">{t('ai.knowledge.form.context')}</p>}
      isDirty={isDirty}
      leaveMessage={t('ai.knowledge.form.discard')}
      onClose={onClose}
      submitFrom="body"
      onSubmit={() => void save()}
      noValidate
      actions={(close) => (
        <>
          <button className="button" type="submit" disabled={isSaving} data-testid="knowledge-save">
            {isSaving
              ? record
                ? t('ai.knowledge.form.saving')
                : t('ai.knowledge.form.adding')
              : record
                ? t('ai.knowledge.form.save')
                : t('ai.knowledge.form.add')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void close()}
            data-testid="knowledge-cancel"
          >
            {t('ai.knowledge.form.cancel')}
          </button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="knowledge-form-error">
          {message}
        </p>
      ) : null}

      {side === 'knows' ? (
        <>
          <p className="field__label">{t('ai.knowledge.form.whoKnowsFixed')}</p>
          <p className="knowledge__fixed" data-testid="knowledge-knower">
            <bdi>{entityName}</bdi>
          </p>
          <EntityPicker
            label={t('ai.knowledge.form.aboutOptional')}
            universeId={universeId}
            value={draft.other}
            onChange={(other) => setDraft((current) => ({ ...current, other }))}
            excludeId={entityId}
          />
        </>
      ) : (
        <>
          <EntityPicker
            label={t('ai.knowledge.form.whoKnowsPicker')}
            universeId={universeId}
            value={draft.other}
            onChange={(other) => setDraft((current) => ({ ...current, other }))}
            excludeId={entityId}
          />
          <p className="field__label">{t('ai.knowledge.form.aboutFixed')}</p>
          <p className="knowledge__fixed" data-testid="knowledge-subject">
            <bdi>{entityName}</bdi>
          </p>
        </>
      )}
      {errors.other ? (
        <p className="field__error" data-testid="knowledge-other-error">
          {errors.other}
        </p>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor={statementId}>
          {t('ai.knowledge.form.statement')}
        </label>
        <textarea
          id={statementId}
          className="field__input field__input--area"
          rows={3}
          dir="auto"
          maxLength={KNOWLEDGE_STATEMENT_MAX_LENGTH}
          value={draft.statement}
          onChange={(event) =>
            setDraft((current) => ({ ...current, statement: event.target.value }))
          }
          aria-invalid={errors.statement ? true : undefined}
          aria-describedby={errors.statement ? `${statementId}-error` : undefined}
          data-testid="knowledge-statement"
        />
        {errors.statement ? (
          <p className="field__error" id={`${statementId}-error`}>
            {errors.statement}
          </p>
        ) : null}
      </div>

      <label className="checkbox" htmlFor={startId}>
        <input
          id={startId}
          type="checkbox"
          checked={draft.knownFromStart}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              knownFromStart: event.target.checked,
              storyId: event.target.checked ? '' : current.storyId,
              sceneId: event.target.checked ? '' : current.sceneId,
            }))
          }
          data-testid="knowledge-from-start"
        />{' '}
        {t('ai.knowledge.fromStartLabel')}
      </label>

      {draft.knownFromStart ? null : (
        <>
          <div className="field">
            <label className="field__label" htmlFor={storyId}>
              {t('ai.knowledge.form.story')}
            </label>
            <select
              id={storyId}
              className="field__input"
              value={draft.storyId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  storyId: event.target.value,
                  sceneId: '',
                }))
              }
              data-testid="knowledge-story"
            >
              <option value="">
                {stories === null
                  ? t('ai.knowledge.form.readingStories')
                  : t('ai.knowledge.form.chooseStory')}
              </option>
              {(stories ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={sceneId}>
              {t('ai.knowledge.form.scene')}
            </label>
            <select
              id={sceneId}
              className="field__input"
              value={draft.sceneId}
              disabled={draft.storyId === ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sceneId: event.target.value }))
              }
              aria-invalid={errors.sceneId ? true : undefined}
              aria-describedby={errors.sceneId ? `${sceneId}-error` : undefined}
              data-testid="knowledge-scene"
            >
              <option value="">
                {draft.storyId === ''
                  ? t('ai.knowledge.form.chooseStoryFirst')
                  : story === null
                    ? t('ai.knowledge.form.readingScenes')
                    : t('ai.knowledge.form.chooseSceneOption')}
              </option>
              {groupedScenes.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.sceneId ? (
              <p className="field__error" id={`${sceneId}-error`}>
                {errors.sceneId}
              </p>
            ) : null}
          </div>
        </>
      )}
    </Drawer>
  )
}
