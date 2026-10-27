interface WordmarkProps {
  /** The auth plate carries the mark large; everywhere else it sits at bar size. */
  large?: boolean
}

/** LorEvolve, in the book face: one word, drawn as it is spoken (the logo's own lettering, ADR 0067). */
export function Wordmark({ large = false }: WordmarkProps) {
  return (
    <span className={large ? 'wordmark wordmark--large' : 'wordmark'} data-testid="wordmark">
      LorEvolve
    </span>
  )
}
