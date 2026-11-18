import { Link } from 'react-router-dom'
import { unchaptered } from '../../stories/format'
import { t, useI18n } from '../../i18n'
import type { TimelineItem } from '../../timeline/types'

/** A scene: its title, where it sits in its story, and the ways to it. Its date is edited on the scene. */
export function SceneBody({
  item,
  scene,
  storyPath,
}: {
  item: TimelineItem
  scene: NonNullable<TimelineItem['scene']>
  storyPath: (id: string) => string
}) {
  const { tx } = useI18n()
  const base = storyPath(scene.storyId)
  return (
    <>
      <h3 className="moment__title">
        <bdi>{item.title}</bdi>
      </h3>
      <p className="moment__context">
        {tx('time.timeline.sceneIn', {
          story: <bdi>{scene.storyTitle}</bdi>,
          // A chapter by its title: its number restarts in each arc, so alone it would not say which one (ADR 0070).
          chapter: scene.chapterTitle !== null ? <bdi>{scene.chapterTitle}</bdi> : unchaptered(),
        })}
      </p>
      <p className="moment__links">
        <Link
          to={`${base}#scene-${item.sourceId}`}
          aria-label={t('time.timeline.openSceneLabel', { title: item.title })}
          data-testid="timeline-open-scene"
        >
          {t('time.timeline.openScene')}
        </Link>
        <Link
          to={`${base}/manuscript/${item.sourceId}`}
          aria-label={t('time.timeline.manuscriptLabel', { title: item.title })}
          data-testid="timeline-open-manuscript"
        >
          {t('time.timeline.manuscript')}
        </Link>
      </p>
    </>
  )
}
