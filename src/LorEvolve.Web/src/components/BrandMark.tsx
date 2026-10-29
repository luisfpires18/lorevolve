/**
 * The accessible name of every link LorEvolve's brand is drawn in - the bars' mark and wordmark, the auth plate's, the
 * workspace rail's `L`. The brand always leads to LorEvolve's home, `/`, from everywhere (031; it led to Explore while
 * Explore was the front door), and the name says so, so nobody has to recognise a logo, or hover for a tooltip, to know
 * where it goes. Explore is always a link of its own.
 */
export const BRAND_LINK_LABEL = 'LorEvolve – Home'

/**
 * The LorEvolve symbol: three interlocking rings around a star, the owner's own artwork.
 *
 * Always decorative, and always beside the `Wordmark`, which is what carries the name. A screen
 * reader that announced both would say "LorEvolve LorEvolve" - so this is hidden and the text is the
 * identity. If the mark ever stands alone somewhere, that place gives it its own accessible name
 * rather than this component guessing one.
 *
 * A raster, not an inline SVG: the artwork is a shaded render and tracing it to vectors would be
 * redrawing it. The same master produces every install icon - see `scripts/render-icons.py`.
 *
 * Transparent, so it sits on the graphite plate and on paper without a tile behind it. It is not
 * used in the workspace rail: at the ~24px the rail allows, the dark two-thirds of the artwork
 * disappear into the plate and what is left is not a symbol. The rail keeps its drawn `L`.
 */
export function BrandMark({ className = 'brandmark' }: { className?: string }) {
  return (
    <img
      className={className}
      src="/brand-mark.png"
      alt=""
      width={192}
      height={192}
      decoding="async"
      data-testid="brand-mark"
    />
  )
}
