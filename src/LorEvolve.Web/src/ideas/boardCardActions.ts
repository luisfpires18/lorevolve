import { BOARD_MAX_CONNECTIONS, BoardCardKind, cardName, type BoardCard } from './boards'
import { freeSpot, LINKED_SIZE, NOTE_SIZE } from './boardPlacement'
import type { BoardSelection } from './boardSelection'
import type { PickedTarget } from '../components/IdeaBoardPicker'
import type { useI18n } from '../i18n'
import type { useBoardState } from './useBoardState'

/** A board editor's handlers for its cards and lines: adding, moving, joining, editing, taking off and choosing. */
export function boardCardActions({
  t,
  setDraft,
  centre,
  draft,
  setSelected,
  setAnnouncement,
  picking,
  setPicking,
  connecting,
  setConnecting,
}: ReturnType<typeof useBoardState> & { t: ReturnType<typeof useI18n>['t'] }) {
  function editCard(id: string, change: Partial<BoardCard>) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === id ? { ...card, ...change } : card)),
    }))
  }

  function place(card: Omit<BoardCard, 'id' | 'x' | 'y'>) {
    const at = centre.current?.() ?? { x: 0, y: 0 }
    const spot = freeSpot(draft.cards, at.x - card.width / 2, at.y - card.height / 2, card)
    const id = crypto.randomUUID()
    const placed: BoardCard = { ...card, id, x: Math.round(spot.x), y: Math.round(spot.y) }
    setDraft((current) => ({ ...current, cards: [...current.cards, placed] }))
    setSelected({ kind: 'card', id })
    setAnnouncement(t('ideas.board.cardAdded', { name: cardName(placed) }))
  }

  function addNote() {
    place({
      kind: BoardCardKind.Note,
      ...NOTE_SIZE,
      text: '',
      ideaId: null,
      entityId: null,
      name: null,
      excerpt: null,
      entityTypeName: null,
      isGone: false,
    })
  }

  function addPicked(target: PickedTarget) {
    const kind = picking === 'entry' ? BoardCardKind.Entity : BoardCardKind.Idea
    setPicking(null)
    place({
      kind,
      ...LINKED_SIZE,
      text: null,
      ideaId: kind === BoardCardKind.Idea ? target.id : null,
      entityId: kind === BoardCardKind.Entity ? target.id : null,
      name: target.name,
      excerpt: target.excerpt,
      entityTypeName: target.entityTypeName,
      isGone: false,
    })
  }

  /** A card dropped somewhere new is drawn over the others: it moves to the end of the draw order. */
  function moveCard(id: string, x: number, y: number) {
    setDraft((current) => {
      const card = current.cards.find((each) => each.id === id)
      if (!card) return current
      return {
        ...current,
        cards: [
          ...current.cards.filter((each) => each.id !== id),
          { ...card, x: Math.round(x), y: Math.round(y) },
        ],
      }
    })
  }

  function removeCard(card: BoardCard) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.filter((each) => each.id !== card.id),
      connections: current.connections.filter(
        (line) => line.fromCardId !== card.id && line.toCardId !== card.id,
      ),
    }))
    setSelected(null)
    setConnecting(null)
    setAnnouncement(t('ideas.board.cardRemoved', { name: cardName(card) }))
  }

  function connectTo(toCardId: string) {
    const from = connecting
    setConnecting(null)
    if (!from || from === toCardId) return
    const exists = draft.connections.find(
      (line) =>
        (line.fromCardId === from && line.toCardId === toCardId) ||
        (line.fromCardId === toCardId && line.toCardId === from),
    )
    if (exists) {
      setSelected({ kind: 'line', id: exists.id })
      setAnnouncement(t('ideas.board.alreadyJoined'))
      return
    }
    if (draft.connections.length >= BOARD_MAX_CONNECTIONS) {
      setAnnouncement(t('ideas.board.linesFull', { max: BOARD_MAX_CONNECTIONS }))
      return
    }
    const id = crypto.randomUUID()
    setDraft((current) => ({
      ...current,
      connections: [...current.connections, { id, fromCardId: from, toCardId, label: null }],
    }))
    setSelected({ kind: 'line', id })
    const ends = [from, toCardId].map((cardId) =>
      cardName(draft.cards.find((card) => card.id === cardId)!),
    )
    setAnnouncement(t('ideas.board.joined', { from: ends[0]!, to: ends[1]! }))
  }

  function editLine(id: string, label: string) {
    setDraft((current) => ({
      ...current,
      connections: current.connections.map((line) => (line.id === id ? { ...line, label } : line)),
    }))
  }

  function removeLine(id: string) {
    setDraft((current) => ({
      ...current,
      connections: current.connections.filter((line) => line.id !== id),
    }))
    setSelected(null)
    setAnnouncement(t('ideas.board.lineRemoved'))
  }

  function select(selection: BoardSelection) {
    if (selection === null) setConnecting(null)
    setSelected(selection)
  }

  return {
    editCard,
    place,
    addNote,
    addPicked,
    moveCard,
    removeCard,
    connectTo,
    editLine,
    removeLine,
    select,
  }
}
