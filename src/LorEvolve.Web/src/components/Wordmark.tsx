interface WordmarkProps {
  /** The auth plate carries the mark large; everywhere else it sits at bar size. */
  large?: boolean
}

/**
 * Lore X. The book face keeps "Lore" and the one accent takes the X, parted by a gap
 * wide enough to read as two words.
 *
 * The product is still called LorEvolve, so the split is shown and not spoken: the drawn
 * halves are hidden from assistive technology and a plain "LorEvolve" stands in their place.
 */
export function Wordmark({ large = false }: WordmarkProps) {
  return (
    <span className={large ? 'wordmark wordmark--large' : 'wordmark'} data-testid="wordmark">
      <span className="wordmark__name">LorEvolve</span>
      <span aria-hidden="true">
        Lore<span className="wordmark__x">X</span>
      </span>
    </span>
  )
}
