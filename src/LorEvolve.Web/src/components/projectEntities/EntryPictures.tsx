import { useCallback } from 'react'
import { getProjectEntity } from '../../projectEntities/api'
import type { FieldImageRef } from '../../lore/types'
import type { ProjectField } from '../../projectEntities/types'
import { FieldImageInput } from '../FieldImageInput'
import { useAsyncRead } from '../../lib/useAsyncRead'

/**
 * An entry's pictures, one per Image field of its type: read from the entry itself, because the list carries no
 * pictures. Each is the field's own control, so a picture can be replaced, recropped or removed where it is read.
 */
export function EntryPictures({
  projectId,
  universeId,
  entryId,
  fields,
  busy,
}: {
  projectId: string
  universeId: string
  entryId: string
  fields: ProjectField[]
  busy: boolean
}) {
  // A read that fails shows the fields with no pictures, as an entry without any.
  const read = useCallback(
    (signal: AbortSignal) =>
      getProjectEntity(projectId, entryId, signal).then(
        (entry): FieldImageRef[] => entry.fieldImages,
        () => [],
      ),
    [projectId, entryId],
  )
  const { load, setLoad } = useAsyncRead(read)

  if (load.kind !== 'ready') return null
  const pictures = load.value

  return (
    <div className="entry__fieldimages" data-testid={`project-entry-images-${entryId}`}>
      {fields.map((field) => (
        <FieldImageInput
          key={field.id}
          universeId={universeId}
          entityId={entryId}
          fieldId={field.id}
          name={field.name}
          shape={field.imageShape}
          image={pictures.find((one) => one.fieldId === field.id) ?? null}
          pending={null}
          onPending={() => undefined}
          onChanged={(picture) =>
            setLoad((current) => ({
              kind: 'ready',
              value: [
                ...(current.kind === 'ready' ? current.value : []).filter(
                  (one) => one.fieldId !== field.id,
                ),
                ...(picture ? [picture] : []),
              ],
            }))
          }
          disabled={busy}
        />
      ))}
    </div>
  )
}
