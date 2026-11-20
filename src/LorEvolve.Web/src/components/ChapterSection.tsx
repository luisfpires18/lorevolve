import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { ArrowRightLeft } from 'lucide-react'
import { ActionMenuItem } from './ActionMenu'
import { RowMenu } from './RowMenu'
import { MoveItems } from './MoveItems'
import { useFold } from './fold'
import { OutlineItem } from './OutlineItem'
import { chapterLabel, chapterNumber, sceneCountLabel } from '../stories/format'
import type { Chapter } from '../stories/types'
import { NewButton } from './NewButton'

/** An arc a chapter may move into, or no arc at all when `id` is null, named as the menu reads it. */
export interface ArcTarget {
  id: string | null
  label: string
}

interface ChapterSectionProps {
  chapter: Chapter
  /** The chapter's place inside its arc - or among the chapters in no arc - from 0: its number, plus one. */
  index: number
  count: number
  sceneCount: number
  /** The heading's level: 3 on its own, 4 inside an arc. */
  titleLevel?: 3 | 4
  /** Every other place the chapter may move to: each other arc, and no arc (ADR 0070). */
  arcTargets?: ArcTarget[]
  onMoveToArc?: (chapter: Chapter, arcId: string | null) => void
  onMove: (chapter: Chapter, by: -1 | 1) => void
  onAddScene: (chapter: Chapter) => void
  onEdit: (chapter: Chapter, index: number) => void
  onDelete: (chapter: Chapter, index: number) => void
  /** The one chapter a story opens on: its scenes are in view without a click. */
  startsOpen?: boolean
  /** The chapter's scenes, already drawn. */
  children: ReactNode
}

/**
 * One chapter on its story's page: a modest heading - "Chapter 2: Ashes", the number from its position in its arc
 * and the name as written - its summary, and its scenes beneath it. Notes stay in the form. Its ⋯ menu also moves it
 * into another arc, or out of every arc (ADR 0070).
 *
 * A heading and a rule rather than a box, so a chapter groups its scenes without putting a card around
 * cards. Its one direct action is Add scene, which starts a scene in this chapter; Edit chapter, the moves
 * that can be made from here and Delete chapter, last, are in its ⋯ menu, named with the chapter.
 */
export function ChapterSection({
  chapter,
  index,
  count,
  sceneCount,
  titleLevel = 3,
  arcTargets = [],
  onMoveToArc,
  onMove,
  onAddScene,
  onEdit,
  onDelete,
  children,
  startsOpen = false,
}: ChapterSectionProps) {
  const { t } = useI18n()
  const access = useUniverseAccess()
  const headingId = useId()
  const fold = useFold<HTMLElement>(startsOpen)

  return (
    <OutlineItem
      variant="group"
      item={false}
      fold={fold}
      anchorId={`chapter-${chapter.id}`}
      dataTitle={chapter.title}
      titleId={headingId}
      titleLevel={titleLevel}
      testId="chapter"
      titleTestId="chapter-heading"
      metaTestId="chapter-scene-count"
      summaryTestId="chapter-summary"
      number={chapterNumber(index)}
      name={chapter.title}
      meta={sceneCount > 0 ? sceneCountLabel(sceneCount) : null}
      summary={chapter.summary}
      foldLabel={chapterLabel(index, chapter.title)}
      empty={sceneCount > 0 ? undefined : t('stories.chapter.empty')}
      tools={
        access.editContent ? (
          <>
            <NewButton
              tone="secondary"
              onClick={() => {
                fold.setOpen(true)
                onAddScene(chapter)
              }}
              aria-describedby={headingId}
              data-testid="chapter-new-scene"
            >
              {t('stories.chapter.addScene')}
            </NewButton>
            <RowMenu
              label={t('stories.chapter.moreActions', {
                label: chapterLabel(index, chapter.title),
              })}
              triggerTestId="chapter-actions"
              onEdit={() => onEdit(chapter, index)}
              editLabel={t('stories.chapter.edit')}
              editTestId="chapter-edit"
              divided
              onRemove={() => onDelete(chapter, index)}
              removeLabel={t('stories.chapter.delete')}
              removeTestId="chapter-delete"
            >
              <MoveItems
                first={index === 0}
                last={index === count - 1}
                testIds={{ up: 'chapter-move-up', down: 'chapter-move-down' }}
                onMove={(step) => onMove(chapter, step)}
              />
              {onMoveToArc
                ? arcTargets.map((target) => (
                    <ActionMenuItem
                      icon={ArrowRightLeft}
                      key={target.id ?? 'no-arc'}
                      onClick={() => onMoveToArc(chapter, target.id)}
                      testId="chapter-move-to-arc"
                    >
                      {target.id === null
                        ? t('stories.chapter.moveOutOfArc')
                        : t('stories.chapter.moveToArc', { label: target.label })}
                    </ActionMenuItem>
                  ))
                : null}
            </RowMenu>
          </>
        ) : null
      }
    >
      {children}
    </OutlineItem>
  )
}
