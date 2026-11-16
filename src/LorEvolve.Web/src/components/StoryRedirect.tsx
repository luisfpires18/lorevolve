import { Navigate, useLocation, useParams } from 'react-router-dom'
import { storyProjectPath } from '../projects/sections'

/**
 * A story's old address, sent to the same view of the story's project (#194).
 *
 * The scene id, the query and the hash all travel with it, so a manuscript link to one scene and a `#scene-` link
 * into the Structure both land where they did before. A replace, so the old address is not left in the history.
 */
export function StoryRedirect({ to }: { to: 'structure' | 'manuscript' }) {
  const { id, storyId, sceneId } = useParams<{ id: string; storyId: string; sceneId?: string }>()
  const { search, hash } = useLocation()
  const path = storyProjectPath(id!, storyId!, to, to === 'manuscript' ? sceneId : undefined)
  return <Navigate to={`${path}${search}${hash}`} replace />
}
