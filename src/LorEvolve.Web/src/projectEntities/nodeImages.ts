import { apiFetch } from '../lib/api'
import type { EntityImageCrop, FieldImageRef } from '../lore/types'
import type { FieldImageApi } from '../components/FieldImageInput'

/**
 * The picture of one comic page or panel (#295), on the image field pipeline: the server answers a `FieldImageRef` whose
 * `fieldId` is the node id, so `FieldImageInput` drives it through this `api`.
 */
export function nodeImageApi(projectId: string, nodeId: string): FieldImageApi {
  const base = `/api/projects/${projectId}/structure/${nodeId}/image`

  return {
    url(image, variant) {
      const root = `${base}/${image.assetId}`
      return variant === 'original' ? `${root}/original` : `${root}/crop/${image.cropId}`
    },
    set(file: File, crop: EntityImageCrop) {
      const body = new FormData()
      body.append('file', file)
      body.append('crop', JSON.stringify(crop))
      return apiFetch<FieldImageRef>(base, { method: 'PUT', body })
    },
    setCrop(assetId: string, crop: EntityImageCrop) {
      return apiFetch<FieldImageRef>(`${base}/crop`, {
        method: 'PUT',
        body: JSON.stringify({ assetId, crop }),
      })
    },
    remove() {
      return apiFetch<void>(base, { method: 'DELETE' })
    },
  }
}
