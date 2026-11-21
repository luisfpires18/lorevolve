import { useRef, useState } from 'react'
import { createIdea, deleteIdea, getIdea, IDEA_CHANGED, saveIdea } from './api'
import {
  fieldsOf,
  referenceKey,
  sameFields,
  storedFrom,
  type Fields,
  type Stored,
} from './ideaDraft'
import type { RecordKind } from './recordKind'
import type { IdeaDetail, IdeaInput, IdeaReference } from './types'
import { useIdeaDraft } from './useIdeaDraft'
import { useRecordEditor } from './useRecordEditor'
import { t } from '../i18n'

/** An idea for `useRecordEditor`: its API, its words, and what is its own. */
const IDEA: RecordKind<IdeaDetail, Fields, Stored, IdeaInput> = {
  kind: 'idea',
  words: 'ideas.editor',
  changedCode: IDEA_CHANGED,
  blank: (universeId) => ({
    title: '',
    body: '',
    universeId,
    universe: null,
    references: [],
    updatedAt: null,
    projectId: null,
  }),
  read: getIdea,
  create: createIdea,
  update: saveIdea,
  delete: deleteIdea,
  toStored: storedFrom,
  toFields: fieldsOf,
  toInput: (fields, expectedUpdatedAt, stored) => ({
    title: fields.title.trim(),
    body: fields.body,
    universeId: fields.universeId,
    references: fields.references.map(({ kind, id }) => ({ kind, id })),
    expectedUpdatedAt,
    // A project belongs to one universe, so moving the idea to another takes it off the project.
    projectId: fields.universeId === stored.universeId ? stored.projectId : null,
  }),
  same: sameFields,
  dependentsOf: (fields) => ({
    count: fields.references.length,
    without: { ...fields, references: [] },
  }),
  clearErrors: (change, fieldErrors, setFieldErrors) => {
    if (change.title === undefined || !fieldErrors.title) return
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.title
      return next
    })
  },
  needChange: () => t('ideas.editor.saveNeedsChange'),
  discarded: (isNew) => (isNew ? t('ideas.editor.discardedNew') : t('ideas.editor.discardedSaved')),
}

/** An idea's editor: `useRecordEditor` with the idea's draft step, its reference picker and its references. */
export function useIdeaEditor({
  ideaId,
  defaultUniverseId,
  contextUniverse,
  onCreated,
  onDeleted,
}: {
  ideaId: string | null
  defaultUniverseId: string | null
  contextUniverse: { id: string; name: string } | null
  onCreated: (idea: IdeaDetail) => void
  onDeleted: (idea: { id: string; title: string }) => void
}) {
  const [isPicking, setIsPicking] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const editor = useRecordEditor(IDEA, {
    id: ideaId,
    defaultUniverseId,
    contextUniverse,
    onCreated,
    onDeleted,
    useDraft: (state) =>
      useIdeaDraft(
        state,
        t('ideas.editor.leaveGuard', {
          name: state.draft.title.trim() || state.stored.title || t('ideas.editor.thisIdea'),
        }),
      ),
    afterRecover: () => requestAnimationFrame(() => editor.titleInput.current?.focus()),
  })
  const { draft, edit, setAnnouncement } = editor

  function addReference(reference: IdeaReference) {
    setIsPicking(false)
    if (!draft.references.some((current) => referenceKey(current) === referenceKey(reference))) {
      edit({ references: [...draft.references, reference] })
    }
    setAnnouncement(t('ideas.editor.referenceAdded', { name: reference.name }))
    requestAnimationFrame(() => addButton.current?.focus())
  }

  function removeReference(reference: IdeaReference) {
    edit({
      references: draft.references.filter(
        (current) => referenceKey(current) !== referenceKey(reference),
      ),
    })
    setAnnouncement(t('ideas.editor.referenceRemoved', { name: reference.name }))
    requestAnimationFrame(() => addButton.current?.focus())
  }

  return { ...editor, isPicking, setIsPicking, addButton, addReference, removeReference }
}
