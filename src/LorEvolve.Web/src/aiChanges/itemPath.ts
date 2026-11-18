import { ChangeAction, ChangeResource, type Change } from './types'

/** Where a change's item opens once it exists: the same places search links to. */
export function itemPath(universeId: string, change: Change) {
  const id = change.resultId ?? change.targetId
  const universe = `/app/universes/${universeId}`
  const story = change.storyId ? `${universe}/stories/${change.storyId}` : null
  // Schema lives on its own screens: Types (an archived field, relation kinds and event kinds and methods included) and Chronology.
  if (
    change.resource === ChangeResource.LoreType ||
    change.resource === ChangeResource.LoreField ||
    change.resource === ChangeResource.LoreGroup ||
    change.resource === ChangeResource.RelationshipType
  ) {
    return `${universe}/types`
  }
  if (change.resource === ChangeResource.Chronology) return `${universe}/chronology`
  if (change.resource === ChangeResource.Media) {
    return change.targetId ? `${universe}/lore/${change.targetId}` : null
  }
  if (change.resource === ChangeResource.ValidationTerm) return `${universe}/types`
  if (change.action === ChangeAction.Remove) {
    // Everything removed waits in the Trash - an idea in its owner's deleted ideas - from where it comes back.
    return change.resource === ChangeResource.Idea
      ? `${universe}/ideas?view=deleted`
      : `${universe}/trash`
  }
  if (change.action === ChangeAction.Reorder) {
    if (!story) return null
    return story
  }
  if (!id) return null
  switch (change.resource) {
    case ChangeResource.LoreEntry:
    case ChangeResource.Article:
      return `${universe}/lore/${id}`
    case ChangeResource.Progression:
      return `${universe}/lore/${id}/progression`
    case ChangeResource.Relationship:
      return null
    case ChangeResource.Story:
      return `${universe}/stories/${id}`
    case ChangeResource.Chapter:
      return story ? `${story}#chapter-${id}` : null
    case ChangeResource.Scene:
      return story ? `${story}#scene-${id}` : null
    case ChangeResource.Manuscript:
      return story ? `${story}/manuscript/${id}` : null
    case ChangeResource.TimelineEvent:
      return `${universe}/timeline?moment=${id}`
    case ChangeResource.PlotArc:
      return story ? `${story}#arc-${id}` : null
    case ChangeResource.WorldRule:
      return `${universe}/world-rules/${id}`
    case ChangeResource.Idea:
      return `${universe}/ideas/${id}`
  }
}
