import { t, tx } from '../i18n'
import { Quoted } from '../components/NameList'
import { CANON_LABELS } from '../lore/types'
import { TrashBlock, TrashKind, type TrashItem, type TrashKindValue } from './types'

/** A row's identity: an id is only unique within its kind. */
export function keyOf(item: TrashItem) {
  return `${item.kind}:${item.id}`
}

/** Where a row was, in the words the author knows it by. */
export function whereItWas(item: TrashItem) {
  switch (item.kind) {
    case TrashKind.Entry:
      return (
        <>
          {item.entityTypeName ? <bdi>{item.entityTypeName}</bdi> : null}
          {item.entityTypeName && item.canonStatus !== null ? ' · ' : null}
          {item.canonStatus === null ? null : CANON_LABELS[item.canonStatus]}
          {item.projectName ? (
            <>
              {' · '}
              <bdi>{item.projectName}</bdi>
            </>
          ) : null}
        </>
      )
    case TrashKind.Story:
      return t('data.trash.where.story')
    case TrashKind.WorldRule:
      return t('data.trash.where.worldRule')
    case TrashKind.Relationship:
      return t('data.trash.where.relationship')
    case TrashKind.TimelineEvent:
      return item.canonStatus === null
        ? t('data.trash.where.timeline')
        : t('data.trash.where.timelineStatus', { status: CANON_LABELS[item.canonStatus] })
    default:
      return tx('data.trash.where.inStory', { story: <Quoted text={item.storyTitle ?? ''} /> })
  }
}

/** Why a row cannot come back yet, if it cannot. */
export function blockedText(item: TrashItem) {
  if (item.blockedBy === TrashBlock.StoryInTrash) {
    return tx('data.trash.blocked.story', { story: <Quoted text={item.storyTitle ?? ''} /> })
  }
  if (item.blockedBy === TrashBlock.EntryInTrash) {
    return t('data.trash.blocked.entry')
  }
  return null
}

export function backText(item: TrashItem) {
  const name = <Quoted text={item.name} />
  const story = <Quoted text={item.storyTitle ?? ''} />
  switch (item.kind) {
    case TrashKind.Entry:
      return tx('data.trash.back.entry', { name })
    case TrashKind.Story:
      return tx('data.trash.back.story', { name })
    case TrashKind.Chapter:
      return tx('data.trash.back.chapter', { name, story })
    case TrashKind.Scene:
      return tx('data.trash.back.scene', { name, story })
    case TrashKind.PlotArc:
      return tx('data.trash.back.arc', { name, story })
    case TrashKind.WorldRule:
      return tx('data.trash.back.worldRule', { name })
    case TrashKind.Relationship:
      return tx('data.trash.back.relationship', { name })
    case TrashKind.TimelineEvent:
      return tx('data.trash.back.timelineEvent', { name })
  }
}

/**
 * What deleting a row permanently takes with it, in the author's words. Only what the row owns: a chapter's scenes went
 * to Unchaptered when it was put in the Trash, so they are not among it.
 */
export function eraseText(kind: TrashKindValue) {
  switch (kind) {
    case TrashKind.Entry:
      return t('data.trash.erasing.entry')
    case TrashKind.Story:
      return t('data.trash.erasing.story')
    case TrashKind.Chapter:
      return t('data.trash.erasing.chapter')
    case TrashKind.Scene:
      return t('data.trash.erasing.scene')
    case TrashKind.PlotArc:
      return t('data.trash.erasing.arc')
    case TrashKind.WorldRule:
      return t('data.trash.erasing.worldRule')
    case TrashKind.Relationship:
      return t('data.trash.erasing.relationship')
    case TrashKind.TimelineEvent:
      return t('data.trash.erasing.timelineEvent')
  }
}
