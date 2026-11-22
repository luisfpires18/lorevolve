import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { PublicationState } from '../../publishing/types'
import { QuietNote } from '../QuietNote'

/** The author's public name as readers see it, or the way to set one on the Profile. */
export function PublishAuthor({ state }: { state: PublicationState }) {
  const { t, tx } = useI18n()

  return state.authorDisplayName ? (
    <QuietNote spacing="block" testId="publication-author">
      {state.originalCreator ? (
        <>
          {tx('universe.publish.author.curated', {
            name: <bdi>{state.authorDisplayName}</bdi>,
            creator: <bdi>{state.originalCreator}</bdi>,
          })}{' '}
        </>
      ) : (
        <>
          {tx('universe.publish.author.publishedAs', {
            name: <bdi>{state.authorDisplayName}</bdi>,
          })}{' '}
        </>
      )}
      <Link to="/app/profile">{t('universe.publish.author.change')}</Link>
    </QuietNote>
  ) : (
    <QuietNote spacing="block" testId="publication-author">
      {tx('universe.publish.author.none', {
        link: <Link to="/app/profile">{t('universe.publish.author.noneLink')}</Link>,
      })}
    </QuietNote>
  )
}
