import { useId, type ReactNode } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { ActionMenuItem } from '../ActionMenu'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { useFold } from '../fold'
import { arcLabel, chapterLabel, chapterNumber, sceneCountLabel } from '../../stories/format'
import { scenesIn } from '../../stories/structure'
import type { Chapter, Scene } from '../../stories/types'
import type { storyChapterMoves } from '../../stories/storyChapterMoves'
import type { storyRemovals } from '../../stories/storyRemovals'
import type { useStoryState } from '../../stories/useStoryState'
import type { chapterGroups } from '../../stories/structure'
import { StorySceneCards, type StorySceneCardsProps } from './StorySceneCards'

/** An arc a chapter may move into, or no arc at all when `id` is null, named as the menu reads it. */
interface ArcTarget {
  id: string | null
  label: string
}

export type StoryChapterSectionsProps = StorySceneCardsProps &
  Pick<ReturnType<typeof useStoryState>, 'setChapterForm'> &
  Pick<ReturnType<typeof storyChapterMoves>, 'moveChapter' | 'moveChapterArc'> &
  Pick<ReturnType<typeof storyRemovals>, 'removeChapter'> & {
    scenes: Scene[]
    opensOn: string | null
    arcIndex: (arcId: string | null) => number
    groups: ReturnType<typeof chapterGroups>
  }

/** Chapters as rows of a types list, each with its scenes. */
export function StoryChapterSections(
  props: StoryChapterSectionsProps & { group: Chapter[]; titleLevel: 3 | 4 },
) {
  const {
    group,
    titleLevel,
    scenes,
    opensOn,
    arcIndex,
    groups,
    setSceneForm,
    setChapterForm,
    moveChapter,
    moveChapterArc,
    removeChapter,
  } = props
  const { t } = useI18n()

  /** Every place a chapter may move to but the one it is in: each other arc, and no arc. */
  function arcTargets(chapter: Chapter): ArcTarget[] {
    const current =
      chapter.plotArcId !== null && arcIndex(chapter.plotArcId) >= 0 ? chapter.plotArcId : null
    return [
      ...groups.arcs
        .map((entry, index) => ({ id: entry.arc.id, label: arcLabel(index, entry.arc.title) }))
        .filter((target) => target.id !== current),
      ...(current === null ? [] : [{ id: null, label: '' }]),
    ]
  }

  return group.map((chapter, index) => {
    const inside = scenesIn(scenes, chapter.id)
    return (
      <StoryGroupRow
        key={chapter.id}
        noun="chapter"
        id={chapter.id}
        title={chapter.title}
        index={index}
        count={group.length}
        titleLevel={titleLevel}
        number={chapterNumber(index)}
        label={chapterLabel(index, chapter.title)}
        countLabel={inside.length > 0 ? sceneCountLabel(inside.length) : undefined}
        summary={chapter.summary}
        empty={inside.length > 0 ? undefined : t('stories.chapter.empty')}
        words={{
          add: t('stories.chapter.addScene'),
          edit: t('stories.chapter.edit'),
          more: t('stories.chapter.moreActions', { label: chapterLabel(index, chapter.title) }),
          delete: t('stories.chapter.delete'),
        }}
        menuItems={arcTargets(chapter).map((target) => (
          <ActionMenuItem
            icon={ArrowRightLeft}
            key={target.id ?? 'no-arc'}
            onClick={() => void moveChapterArc(chapter, target.id)}
            testId="chapter-move-to-arc"
          >
            {target.id === null
              ? t('stories.chapter.moveOutOfArc')
              : t('stories.chapter.moveToArc', { label: target.label })}
          </ActionMenuItem>
        ))}
        onMove={(by) => void moveChapter(chapter, by)}
        onAdd={() => setSceneForm({ mode: 'new', chapterId: chapter.id })}
        onEdit={() => setChapterForm({ mode: 'edit', chapter, index })}
        onDelete={() => void removeChapter(chapter, index)}
        startsOpen={chapter.id === opensOn}
      >
        <ul className="types__list" data-testid="chapter-scenes">
          <StorySceneCards {...props} container={inside} titleLevel={titleLevel === 4 ? 5 : 4} />
        </ul>
      </StoryGroupRow>
    )
  })
}

const IDS = {
  arc: { count: 'arc-chapter-count', summary: 'arc-description', add: 'arc-new-chapter' },
  chapter: { count: 'chapter-scene-count', summary: 'chapter-summary', add: 'chapter-new-scene' },
}

/**
 * One arc or chapter of a story (ADR 0070) as a types row: a heading - "Arc 2: Fall of the King", "Chapter 2: Ashes",
 * the number from its position and the name as written - its description or summary, and its chapters or scenes
 * beneath it, folded but for the one arc and the one chapter a story opens on. Its publication control comes first, then
 * Add chapter or Add scene (it opens the fold first) and Edit; the moves, `menuItems` (a chapter's moves into another
 * arc or out of every arc) and Delete, last, are in its menu, named with it. Ids and test ids start with `noun`.
 */
export function StoryGroupRow({
  noun,
  id,
  title,
  index,
  count,
  titleLevel,
  number,
  label,
  countLabel,
  summary,
  empty,
  words,
  publication,
  menuItems,
  onMove,
  onAdd,
  onEdit,
  onDelete,
  startsOpen,
  children,
}: {
  noun: 'arc' | 'chapter'
  id: string
  title: string
  /** The place among its siblings, from 0: its number, plus one. */
  index: number
  count: number
  titleLevel: 3 | 4
  number: string
  /** The number and title in words, "Arc 2: Fall of the King", for the fold and the menu. */
  label: string
  countLabel?: string
  summary: string | null
  /** Drawn instead of the children while it holds nothing. */
  empty?: string
  words: { add: string; edit: string; more: string; delete: string }
  publication?: ReactNode
  menuItems?: ReactNode[]
  onMove: (by: -1 | 1) => void
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
  startsOpen: boolean
  children: ReactNode
}) {
  const access = useUniverseAccess()
  const headingId = useId()
  const { open, setOpen, ref, bodyId } = useFold<HTMLLIElement>(startsOpen)

  return (
    <TypeRow
      ref={ref}
      id={`${noun}-${id}`}
      tabIndex={-1}
      data-title={title}
      data-open={open ? 'true' : undefined}
      testId={noun}
      name={title}
      heading={{
        level: titleLevel,
        id: headingId,
        testId: `${noun}-heading`,
        prefix: <span data-testid={`${noun}-number`}>{number}</span>,
      }}
      count={countLabel}
      countTestId={IDS[noun].count}
      actions={
        <>
          {publication}
          {access.editContent ? (
            <NewButton
              tone="secondary"
              onClick={() => {
                setOpen(true)
                onAdd()
              }}
              aria-describedby={headingId}
              data-testid={IDS[noun].add}
            >
              {words.add}
            </NewButton>
          ) : null}
          <TypeRowActions
            name={title}
            move={
              access.editContent
                ? {
                    isFirst: index === 0,
                    isLast: index === count - 1,
                    busy: false,
                    onMove: (direction) => onMove(direction === 'up' ? -1 : 1),
                  }
                : undefined
            }
            moveTestIds={{ up: `${noun}-move-up`, down: `${noun}-move-down` }}
            onEdit={access.editContent ? onEdit : undefined}
            editTestId={`${noun}-edit`}
            fold={{
              open: open,
              count: 0,
              onToggle: () => setOpen(!open),
              testId: `${noun}-toggle`,
              controls: bodyId,
              label,
            }}
            words={{ edit: words.edit, more: words.more }}
            menuItems={access.editContent && menuItems?.length ? menuItems : undefined}
            onDelete={access.editContent ? onDelete : undefined}
            deleteLabel={words.delete}
            deleteTestId={`${noun}-delete`}
            menuTestId={`${noun}-actions`}
          />
        </>
      }
    >
      <div id={bodyId} hidden={!open} data-fold={bodyId}>
        {summary ? (
          <p className="prose" data-testid={IDS[noun].summary}>
            {summary}
          </p>
        ) : null}
        {empty ? (
          <QuietNote spacing="flush" testId={`${noun}-empty`}>
            {empty}
          </QuietNote>
        ) : (
          children
        )}
      </div>
    </TypeRow>
  )
}
