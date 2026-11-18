import { Visibility, type ContentKind, type ContentPublicationState } from './types'
import { t } from '../i18n'

/** What each kind lists publicly and what it keeps private - said before publishing, never discovered after. */
export function wordsOf(kind: ContentKind) {
  if (kind === 'entry') {
    return {
      listed: t('stories.publication.content.entry.listed'),
      kept: t('stories.publication.content.entry.kept'),
      isPublic: t('stories.publication.content.entry.isPublic'),
      willPublish: t('stories.publication.content.entry.willPublish'),
      onlyYou: t('stories.publication.content.entry.onlyYou'),
      publish: t('stories.publication.content.entry.publish'),
    }
  }
  return {
    listed: t('stories.publication.content.story.listed'),
    kept: t('stories.publication.content.story.kept'),
    isPublic: t('stories.publication.content.story.isPublic'),
    willPublish: t('stories.publication.content.story.willPublish'),
    onlyYou: t('stories.publication.content.story.onlyYou'),
    publish: t('stories.publication.content.story.publish'),
  }
}

export type Shown = 'private' | 'public' | 'selected'

/** Whether a story still lacks the public summary readers need (Task 011). Always false for an entry. */
export function lacksSummary(kind: ContentKind, state: ContentPublicationState) {
  return kind === 'story' && !state.publicSummary
}

export function shownOf(kind: ContentKind, state: ContentPublicationState): Shown {
  if (state.visibility !== Visibility.Public) return 'private'
  return state.universeIsPublic && !lacksSummary(kind, state) ? 'public' : 'selected'
}
