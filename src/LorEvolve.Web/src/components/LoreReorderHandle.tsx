import type { KeyboardEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { useI18n } from '../i18n'

/**
 * The grip a scene's lore chip is reordered by, and only the grip: the chip itself stays a link to the entry. A mouse drags
 * it (`@dnd-kit/core`'s mouse sensor - never a touch, which a phone needs for scrolling); a keyboard moves the chip one
 * place with the arrow keys. Where it may go is the list's to say (`onKey`); this is the control. Same shape as
 * `TypeReorderHandle`, without the lift: a scene's lore is one flat row, so a move needs no carrying.
 */
export function LoreReorderHandle({
  id,
  name,
  onKey,
}: {
  id: string
  name: string
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })

  return (
    <button
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      className="lorechip__grip"
      type="button"
      aria-label={t('stories.picks.reorder', { name })}
      aria-pressed={isDragging}
      onKeyDown={onKey}
      data-testid={`lore-reorder-${name}`}
    >
      <GripVertical aria-hidden="true" focusable="false" strokeWidth={1.75} />
    </button>
  )
}
