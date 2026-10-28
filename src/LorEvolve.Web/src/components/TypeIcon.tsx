import { FALLBACK_TYPE_GLYPH, typeIconOption } from '../lore/typeIcons'

/**
 * An entity type's icon, or the neutral fallback when it has none.
 *
 * Always decorative: it sits beside the type's name, which is what is read out. The fallback is a
 * generic shape rather than a guess - a type called "Kingdom" with no icon chosen gets exactly what
 * a type called "Rumour" gets.
 */
export function TypeIcon({ iconKey, className }: { iconKey: string | null; className?: string }) {
  const option = typeIconOption(iconKey)
  const Glyph = option?.glyph ?? FALLBACK_TYPE_GLYPH

  return (
    <Glyph
      className={className}
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.75}
      data-icon={option?.key ?? 'fallback'}
    />
  )
}
