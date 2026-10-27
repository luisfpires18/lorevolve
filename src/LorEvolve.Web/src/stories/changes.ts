import { differing } from '../lib/editConflict'
import { STORY_STATUS_LABELS, type StoryDetail } from './types'

/** A story's form, as a story or a suggestion holds it. */
type StoryFields = Pick<StoryDetail, 'title' | 'premise' | 'status'>

/** What differs between two of a story's forms, in the form's own words. */
export function storyChanges(latest: StoryFields, mine: StoryFields) {
  return differing([
    { label: 'Title', latest: latest.title, mine: mine.title.trim() },
    { label: 'Premise', latest: latest.premise ?? '', mine: (mine.premise ?? '').trim() },
    {
      label: 'Status',
      latest: STORY_STATUS_LABELS[latest.status],
      mine: STORY_STATUS_LABELS[mine.status],
    },
  ])
}
