import { Field } from './Field'
import type { MapDetail, ReplacePinsPolicy } from '../maps/types'
import { useI18n } from '../i18n'
import { QuietNote } from './QuietNote'

export function MapFormReplace({
  map,
  pinCount,
  pins,
  setPins,
  fieldErrors,
}: {
  map: MapDetail | null
  pinCount: number
  pins: ReplacePinsPolicy | null
  setPins: (pins: ReplacePinsPolicy) => void
  fieldErrors: Record<string, string>
}) {
  const { t, tn, tx } = useI18n()

  return (
    <Field
      group="fieldset"
      label={t('places.mapForm.pinsLegend')}
      hint={
        pinCount === 0
          ? t('places.mapForm.noPins')
          : tn('places.mapForm.pinsPlaced', pinCount, { n: pinCount })
      }
      error={fieldErrors.pins}
    >
      {map?.calibration ? (
        <QuietNote spacing="hint" testId="map-replace-scale-note">
          {t('places.mapForm.scaleNote')}
        </QuietNote>
      ) : null}
      <label className="mapform__choice">
        <input
          type="radio"
          name="map-pins"
          value="keep"
          checked={pins === 'keep'}
          onChange={() => setPins('keep')}
          data-testid="map-replace-keep"
        />
        <span>
          {tx('places.mapForm.keep', {
            lead: <strong>{t('places.mapForm.keepLead')}</strong>,
          })}
        </span>
      </label>
      <label className="mapform__choice">
        <input
          type="radio"
          name="map-pins"
          value="remove"
          checked={pins === 'remove'}
          onChange={() => setPins('remove')}
          data-testid="map-replace-remove"
        />
        <span>
          {tx('places.mapForm.remove', {
            lead: <strong>{t('places.mapForm.removeLead')}</strong>,
          })}
        </span>
      </label>
    </Field>
  )
}
