import type { EntityImageCrop, EntityImageRef } from '../lore/types'

/**
 * What the cropper is open on. A file just picked is framed before anything is uploaded; a
 * picture already stored is reframed from its own original, which is never sent again.
 */
export type Framing =
  | {
      kind: 'file'
      file: File
      source: string
      /** Whether `source` was made for this cropper and is released with it. */
      ownsSource: boolean
      initial: EntityImageCrop | null
    }
  | { kind: 'stored'; image: EntityImageRef; source: string }
