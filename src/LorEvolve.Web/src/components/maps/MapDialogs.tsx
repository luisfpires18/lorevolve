import { MapForm } from '../MapForm'
import { MapPinForm } from '../MapPinForm'
import type { MapDetail, MapPin } from '../../maps/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { MapDialog, PinForm } from '../../maps/useMapPageState'

export function MapDialogs({
  universe,
  map,
  pinForm,
  setPinForm,
  pinSaved,
  dialog,
  setDialog,
  replaceMap,
}: {
  universe: WorkspaceContext['universe']
  map: MapDetail
  pinForm: PinForm | null
  setPinForm: (form: PinForm | null) => void
  pinSaved: (saved: MapPin) => void
  dialog: MapDialog
  setDialog: (dialog: MapDialog) => void
  replaceMap: (map: MapDetail) => void
}) {
  return (
    <>
      {pinForm ? (
        <MapPinForm
          universeId={universe.id}
          mapId={map.id}
          pin={pinForm.kind === 'edit' ? pinForm.pin : null}
          at={pinForm.kind === 'new' ? pinForm.at : null}
          onClose={() => setPinForm(null)}
          onSaved={pinSaved}
        />
      ) : null}

      {dialog ? (
        // Keyed by mode: switching between the two forms starts the other one fresh, as two branches did.
        <MapForm
          key={dialog}
          mode={dialog}
          universeId={universe.id}
          map={map}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            replaceMap(saved)
          }}
        />
      ) : null}
    </>
  )
}
