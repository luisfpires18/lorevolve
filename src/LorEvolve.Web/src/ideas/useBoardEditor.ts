import { useRef, useState } from 'react'
import {
  BoardCardKind,
  createIdeaBoard,
  deleteIdeaBoard,
  getIdeaBoard,
  IDEA_BOARD_CHANGED,
  saveIdeaBoard,
  type IdeaBoardDetail,
  type IdeaBoardInput,
} from './boards'
import {
  fieldsOf,
  inputOf,
  isBlank,
  parseCopy,
  sameFields,
  storedFrom,
  withoutEntries,
  type Fields,
  type Stored,
} from './boardDraft'
import type { BoardSelection } from './boardSelection'
import type { RecordKind } from './recordKind'
import { useRecordEditor } from './useRecordEditor'
import { t } from '../i18n'
import { useDraftedEditor } from '../lib/useDraftedEditor'

/** A board for `useRecordEditor`: its API, its words, and what is its own. */
const BOARD: RecordKind<IdeaBoardDetail, Fields, Stored, IdeaBoardInput> = {
  kind: 'idea-board',
  words: 'ideas.board',
  changedCode: IDEA_BOARD_CHANGED,
  blank: (universeId) => ({
    title: '',
    universeId,
    universe: null,
    cards: [],
    connections: [],
    updatedAt: null,
  }),
  read: getIdeaBoard,
  create: createIdeaBoard,
  update: saveIdeaBoard,
  delete: deleteIdeaBoard,
  toStored: storedFrom,
  toFields: fieldsOf,
  toInput: (fields, expectedUpdatedAt) => inputOf(fields, expectedUpdatedAt),
  same: sameFields,
  dependentsOf: (fields) => ({
    count: fields.cards.filter((card) => card.kind === BoardCardKind.Entity).length,
    without: withoutEntries(fields),
  }),
  clearErrors: (change, fieldErrors, setFieldErrors) => {
    if (change.title !== undefined && fieldErrors.title) setFieldErrors({})
  },
  // A 400 shows its first field's words.
  needChange: (fieldErrors) => Object.values(fieldErrors)[0],
  discarded: () => t('ideas.board.discarded'),
}

/** A board's editor: `useRecordEditor` with the board's draft step, its picker, selection, line drawing and layout. */
export function useBoardEditor({
  boardId,
  defaultUniverseId,
  contextUniverse,
  onCreated,
  onDeleted,
}: {
  boardId: string | null
  defaultUniverseId: string | null
  contextUniverse: { id: string; name: string } | null
  onCreated: (board: IdeaBoardDetail) => void
  onDeleted: (board: { id: string; title: string }) => void
}) {
  const [picking, setPicking] = useState<'idea' | 'entry' | null>(null)
  const [selected, setSelected] = useState<BoardSelection>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [layout, setLayout] = useState<'board' | 'list'>('board')
  const centre = useRef<(() => { x: number; y: number }) | null>(null)
  const editor = useRecordEditor(BOARD, {
    id: boardId,
    defaultUniverseId,
    contextUniverse,
    onCreated,
    onDeleted,
    useDraft: (state) =>
      useDraftedEditor({
        ...state,
        isReady: state.load.kind === 'ready',
        isBlank,
        same: sameFields,
        parseCopy,
        leaveMessage: t('ideas.board.leaveGuard', {
          name: state.draft.title.trim() || state.stored.title || t('ideas.board.thisBoard'),
        }),
      }),
    resetView: () => {
      setSelected(null)
      setConnecting(null)
    },
  })

  return {
    ...editor,
    picking,
    setPicking,
    selected,
    setSelected,
    connecting,
    setConnecting,
    layout,
    setLayout,
    centre,
  }
}
