import { fraction, percent } from '../../maps/calibrationFractions'
import type { Fraction } from '../MapCalibration'

export function CalibrationCoordinate({
  label,
  index,
  axis,
  value,
  setPoint,
}: {
  label: string
  index: 0 | 1
  axis: 'x' | 'y'
  value: Fraction | null
  setPoint: (index: 0 | 1, change: Partial<Fraction>) => void
}) {
  return (
    <label className="mappinform__coord">
      <span>{label}</span>
      <input
        className="field__input"
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.01}
        value={value ? percent(value[axis]) : ''}
        onChange={(event) => {
          const parsed = fraction(event.target.value)
          setPoint(index, {
            [axis]: Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0,
          })
        }}
        data-testid={`map-calibration-${index === 0 ? 'a' : 'b'}-${axis}`}
      />
      <span aria-hidden="true">%</span>
    </label>
  )
}
