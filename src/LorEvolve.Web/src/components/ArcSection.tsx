import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { Pencil, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { MoveItems } from './MoveItems'
import { useFold } from './fold'
import { OutlineItem } from './OutlineItem'
import { arcLabel, arcNumber, chapterCountLabel } from '../stories/format'
import type { PlotArc } from '../stories/types'
import { NewButton } from './NewButton'

interface ArcSectionProps {
  arc: PlotArc
  /** The arc's place in the story, from 0 - which is also its number, plus one. */
  index: number
  count: number
  /** How many chapters are told in it. */
  chapterCount: number
  onMove: (arc: PlotArc, by: -1 | 1) => void
  onAddChapter: (arc: PlotArc) => void
  onEdit: (arc: PlotArc, index: number) => void
  onDelete: (arc: PlotArc, index: number) => void
  /** The one arc a story opens on: its chapters are in view without a click. */
  startsOpen?: boolean
  /** The arc's chapters, already drawn. */
  children: ReactNode
  /** The arc's publication control (ADR 0039), drawn first among its tools. */
  publication?: ReactNode
}

/**
 * One arc of a story (ADR 0070): a heading - "Arc 2: Fall of the King", the number from its position and the name as
 * written - its description, and its chapters beneath it, numbered again from 1. Notes stay in the form.
 *
 * A heading and a rule rather than a box, so an arc groups its chapters without a card around them. Its one direct action
 * is Add chapter; Edit arc, the moves that can be made from here and Delete arc, last, are in its ⋯ menu.
 */
export function ArcSection({
  arc,
  index,
  count,
  chapterCount,
  onMove,
  onAddChapter,
  onEdit,
  onDelete,
  children,
  publication,
  startsOpen = false,
}: ArcSectionProps) {
  const { t } = useI18n()
  const access = useUniverseAccess()
  const headingId = useId()
  const fold = useFold<HTMLElement>(startsOpen)

  return (
    <OutlineItem
      variant="group"
      top
      item={false}
      fold={fold}
      anchorId={`arc-${arc.id}`}
      dataTitle={arc.title}
      titleId={headingId}
      testId="arc"
      titleTestId="arc-heading"
      metaTestId="arc-chapter-count"
      summaryTestId="arc-description"
      number={arcNumber(index)}
      name={arc.title}
      meta={chapterCount > 0 ? chapterCountLabel(chapterCount) : null}
      summary={arc.description}
      foldLabel={arcLabel(index, arc.title)}
      empty={chapterCount > 0 ? undefined : t('stories.arc.empty')}
      tools={
        <>
          {publication}
          {access.editContent ? (
            <>
              <NewButton
                tone="secondary"
                onClick={() => {
                  fold.setOpen(true)
                  onAddChapter(arc)
                }}
                aria-describedby={headingId}
                data-testid="arc-new-chapter"
              >
                {t('stories.arc.addChapter')}
              </NewButton>
              <ActionMenu
                label={t('stories.arc.moreActions', { label: arcLabel(index, arc.title) })}
                triggerTestId="arc-actions"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => onEdit(arc, index)}
                  data-testid="arc-edit"
                >
                  <ActionIcon icon={Pencil} />
                  {t('stories.arc.edit')}
                </button>
                <MoveItems
                  first={index === 0}
                  last={index === count - 1}
                  testIds={{ up: 'arc-move-up', down: 'arc-move-down' }}
                  onMove={(step) => onMove(arc, step)}
                />
                <hr className="actionmenu__divider" />
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  onClick={() => onDelete(arc, index)}
                  data-testid="arc-delete"
                >
                  <ActionIcon icon={Trash} />
                  {t('stories.arc.delete')}
                </button>
              </ActionMenu>
            </>
          ) : null}
        </>
      }
    >
      {children}
    </OutlineItem>
  )
}
