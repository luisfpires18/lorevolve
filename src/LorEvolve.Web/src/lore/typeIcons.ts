import {
  BookOpen,
  CalendarDays,
  Castle,
  Coins,
  Crown,
  Flame,
  FlaskConical,
  Gem,
  Globe,
  House,
  Landmark,
  Languages,
  Leaf,
  Lightbulb,
  MapPin,
  Moon,
  Mountain,
  Package,
  PawPrint,
  ScrollText,
  Shapes,
  Shield,
  Ship,
  Skull,
  Sparkles,
  Star,
  Sword,
  Swords,
  TreePine,
  User,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { t } from '../i18n'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'

export interface TypeIconOption {
  /** What is stored on the type and sent to the API. Never shown. */
  key: string
  glyph: LucideIcon
}

/**
 * The icons an entity type may carry, in the order the picker offers them.
 *
 * Mirrors `EntityTypeIcons.Keys` on the API, which refuses any other key, so the two lists change
 * together and a key is never removed or renamed once shipped - it is stored and exported (ADR 0020).
 * The first seven keys - character, organization, location, event, item, species, concept - are the
 * ones the starter types have always been seeded with; every other key names the picture it shows. Offered in loose
 * groups of related pictures, not in the order they were added.
 *
 * A key is a picture and nothing more. Nothing here, or anywhere, chooses one from a type's name.
 */
export const TYPE_ICONS: readonly TypeIconOption[] = [
  // People and powers
  { key: 'character', glyph: User },
  { key: 'organization', glyph: Users },
  { key: 'crown', glyph: Crown },
  { key: 'landmark', glyph: Landmark },
  { key: 'languages', glyph: Languages },
  // Places
  { key: 'location', glyph: MapPin },
  { key: 'globe', glyph: Globe },
  { key: 'castle', glyph: Castle },
  { key: 'house', glyph: House },
  { key: 'mountain', glyph: Mountain },
  { key: 'tree', glyph: TreePine },
  // Time and conflict
  { key: 'event', glyph: CalendarDays },
  { key: 'sword', glyph: Sword },
  { key: 'swords', glyph: Swords },
  { key: 'shield', glyph: Shield },
  { key: 'skull', glyph: Skull },
  // Things
  { key: 'item', glyph: Package },
  { key: 'gem', glyph: Gem },
  { key: 'coins', glyph: Coins },
  { key: 'ship', glyph: Ship },
  { key: 'book', glyph: BookOpen },
  { key: 'scroll', glyph: ScrollText },
  { key: 'flask', glyph: FlaskConical },
  // Living things and nature
  { key: 'species', glyph: PawPrint },
  { key: 'leaf', glyph: Leaf },
  // Ideas, magic and the sky
  { key: 'concept', glyph: Lightbulb },
  { key: 'sparkles', glyph: Sparkles },
  { key: 'wand', glyph: WandSparkles },
  { key: 'flame', glyph: Flame },
  { key: 'star', glyph: Star },
  { key: 'moon', glyph: Moon },
]

/** Drawn for a type with no icon, and for a key this build does not know. Neutral on purpose. */
export const FALLBACK_TYPE_GLYPH: LucideIcon = Shapes

const BY_KEY = new Map(TYPE_ICONS.map((option) => [option.key, option]))

/** The option for a stored key, or null when there is none or the key is not one this build draws. */
export function typeIconOption(key: string | null): TypeIconOption | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}

/** What the picture shows, written beside it in the picker and read out. Not what the type means. */
export function typeIconLabel(key: string): string {
  return t(`entityTypes.icons.${key}` as TextKey<Dictionary>)
}
