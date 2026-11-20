import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { WorldAttribution } from '../WorldAttribution'
import { worldPath, type PublicStoryDetail, type PublicUniverse } from '../../portal/api'
import { useWorkspaceLink } from '../../portal/useWorkspaceLink'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useI18n } from '../../i18n'
import { paragraphs } from '../../portal/storyParagraphs'
import { DateText } from '../DateText'

export function Story({ world, story }: { world: PublicUniverse; story: PublicStoryDetail }) {
  const { t, tx } = useI18n()
  useDocumentTitle(story.title, world.name)
  const owner = useWorkspaceLink(world.slug, { story: story.slug })
  const sections = [
    story.manuscript.length > 0 ? { id: 'manuscript', label: t('portal.story.manuscript') } : null,
    story.scenes.length > 0 ? { id: 'scenes', label: t('portal.story.scenes') } : null,
    story.plot.length > 0 ? { id: 'plot', label: t('portal.story.arcs') } : null,
  ].filter((section) => section !== null)

  return (
    <article className="pread pstory" data-testid="public-story">
      <nav className="pcrumbs" aria-label={t('portal.story.breadcrumb')}>
        <ol>
          <li>
            <Link
              className="pcrumbs__back"
              to={worldPath(world.slug)}
              data-testid="public-story-world"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              <bdi>{world.name}</bdi>
            </Link>
          </li>
          <li aria-current="page">{t('portal.story.crumb')}</li>
        </ol>
      </nav>

      <header className="pread__head pstory__head">
        <p className="pread__eyebrow">{t('portal.story.eyebrow')}</p>
        <h1 className="pread__title pstory__title" dir="auto">
          <bdi>{story.title}</bdi>
        </h1>
        <WorldAttribution
          world={world}
          className="pstory__byline"
          testId="public-story"
          after={
            <>
              <span aria-hidden="true"> · </span>
              <span>
                {tx('portal.story.published', { date: <DateText value={story.publishedAt} /> })}
              </span>
            </>
          }
        />
        <p className="pstory__summary" dir="auto" data-testid="public-story-summary">
          {story.publicSummary}
        </p>
        {owner?.storyId ? (
          <Link
            className="pread__edit"
            to={`/app/universes/${owner.universeId}/stories/${owner.storyId}`}
            data-testid="edit-in-workspace"
          >
            {t('portal.story.edit')}
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </Link>
        ) : null}
        {sections.length > 1 ? (
          <nav className="pstory__sections" aria-label={t('portal.story.sections')}>
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <a className="portal__pill" href={`#${section.id}`}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {story.manuscript.length > 0 ? (
        <section
          className="pstory__section"
          id="manuscript"
          aria-labelledby="pstory-manuscript"
          data-testid="public-story-manuscript"
        >
          <h2 className="pstory__heading" id="pstory-manuscript">
            {t('portal.story.manuscriptHeading')}
          </h2>
          {story.manuscript.length > 1 ? (
            <nav className="pstory__toc" aria-label={t('portal.story.manuscriptContents')}>
              <ol>
                {story.manuscript.map((part, index) => (
                  <li key={index}>
                    <a className="plink" href={`#part-${index + 1}`}>
                      <bdi>{part.title}</bdi>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {story.manuscript.map((part, index) => (
            <section
              className="pstory__part"
              id={`part-${index + 1}`}
              aria-labelledby={`part-${index + 1}-title`}
              key={index}
              data-testid="public-story-part"
            >
              <h3 className="pstory__parttitle" id={`part-${index + 1}-title`} dir="auto">
                <bdi>{part.title}</bdi>
              </h3>
              <div className="pstory__prose">
                {paragraphs(world.slug, part).map((paragraph, at) => (
                  <p key={at}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {story.scenes.length > 0 ? (
        <section
          className="pstory__section"
          id="scenes"
          aria-labelledby="pstory-scenes"
          data-testid="public-story-scenes"
        >
          <h2 className="pstory__heading" id="pstory-scenes">
            {t('portal.story.scenesHeading')}
          </h2>
          <ol className="pstory__scenes">
            {story.scenes.map((scene, index) => (
              <li className="pstory__scene" key={index} data-testid="public-story-scene">
                <h3 className="pstory__scenetitle" dir="auto">
                  <bdi>{scene.title}</bdi>
                </h3>
                {scene.summary ? (
                  <p className="pstory__scenesummary" dir="auto">
                    {scene.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {story.plot.length > 0 ? (
        <section
          className="pstory__section"
          id="plot"
          aria-labelledby="pstory-plot"
          data-testid="public-story-plot"
        >
          <h2 className="pstory__heading" id="pstory-plot">
            {t('portal.story.arcsHeading')}
          </h2>
          {story.plot.map((arc, index) => (
            <section
              className="pstory__arc"
              aria-labelledby={`arc-${index + 1}-title`}
              key={index}
              data-testid="public-story-arc"
            >
              <h3 className="pstory__arctitle" id={`arc-${index + 1}-title`} dir="auto">
                <bdi>{arc.title}</bdi>
              </h3>
              {arc.description ? (
                <p className="pstory__arcdescription" dir="auto">
                  {arc.description}
                </p>
              ) : null}
            </section>
          ))}
        </section>
      ) : null}

      <aside className="pstory__world" aria-label={t('portal.story.worldLabel')}>
        <img
          className="pstory__worldart"
          src={world.cardImageUrl}
          alt=""
          width={960}
          height={600}
          loading="lazy"
          decoding="async"
        />
        <div className="pstory__worldtext">
          <p className="pread__eyebrow">{t('portal.story.setIn')}</p>
          <p className="pstory__worldname" dir="auto">
            <bdi>{world.name}</bdi>
          </p>
          <p className="pstory__worldsummary" dir="auto">
            {world.publicSummary}
          </p>
          <Link className="portal__pill" to={worldPath(world.slug)}>
            {t('portal.story.exploreWorld')}
          </Link>
        </div>
      </aside>
    </article>
  )
}
