import { Link } from 'react-router-dom'
import { LoreArticle } from '../ArticleView'
import { worldPath, type PublicLoreDetail, type PublicUniverse } from '../../portal/api'
import { useWorkspaceLink } from '../../portal/useWorkspaceLink'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useI18n } from '../../i18n'
import { PublicCrumbs } from './PublicCrumbs'
import { PublicEditLink } from './PublicEditLink'

/** The public lore entry's reading page, split from `PublicLorePage`. */
export function Entry({ world, entry }: { world: PublicUniverse; entry: PublicLoreDetail }) {
  const { t, tx } = useI18n()
  useDocumentTitle(entry.name, world.name)
  const owner = useWorkspaceLink(world.slug, { lore: entry.slug })

  return (
    <article className="pread plore" data-testid="public-lore">
      <PublicCrumbs
        world={world}
        label={t('portal.lore.breadcrumb')}
        current={t('portal.lore.crumb')}
        testId="public-lore-world"
      />

      <header className="pread__head">
        <p className="pread__eyebrow" data-testid="public-lore-type">
          <bdi>{entry.typeName}</bdi>
        </p>
        <h1 className="pread__title" dir="auto">
          <bdi>{entry.name}</bdi>
        </h1>
        {entry.summary ? (
          <p className="pread__lede" dir="auto" data-testid="public-lore-summary">
            {entry.summary}
          </p>
        ) : null}
        <PublicEditLink
          to={
            owner?.entityId ? `/app/universes/${owner.universeId}/lore/${owner.entityId}` : null
          }
          label={t('portal.lore.edit')}
        />
      </header>

      <div className="plore__body" data-picture={entry.thumbnailUrl ? 'true' : 'false'}>
        {entry.thumbnailUrl ? (
          <figure className="plore__figure">
            <img
              src={entry.thumbnailUrl}
              alt={entry.name}
              width={320}
              height={320}
              decoding="async"
            />
          </figure>
        ) : null}
        <div className="plore__article" data-testid="public-lore-article">
          {entry.article ? <LoreArticle content={entry.article} /> : null}
        </div>
      </div>

      <footer className="pread__foot">
        <Link className="plink" to={worldPath(world.slug)}>
          {tx('portal.lore.moreFrom', { world: <bdi>{world.name}</bdi> })}
        </Link>
      </footer>
    </article>
  )
}
