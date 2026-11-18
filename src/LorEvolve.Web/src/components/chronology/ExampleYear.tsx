import { EraLabelPosition, type EraLabelPositionValue } from '../../chronology/types'

export /** A year of 10 written the way a period asks. An example of the format only - never a bound. */
function ExampleYear({ label, position }: { label: string; position: EraLabelPositionValue }) {
  return position === EraLabelPosition.AfterYear ? (
    <>
      10 <bdi>{label}</bdi>
    </>
  ) : (
    <>
      <bdi>{label}</bdi> 10
    </>
  )
}
