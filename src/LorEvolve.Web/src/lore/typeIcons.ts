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

export interface TypeIconOption {
  /** What is stored on the type and sent to the API. Never shown. */
  key: string
  /** What the picture shows, written beside it in the picker and read out. Not what the type means. */
  label: string
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
  { key: 'character', label: 'Person', glyph: User },
  { key: 'organization', label: 'Group', glyph: Users },
  { key: 'crown', label: 'Crown', glyph: Crown },
  { key: 'landmark', label: 'Pillared hall', glyph: Landmark },
  { key: 'languages', label: 'Languages', glyph: Languages },
  // Places
  { key: 'location', label: 'Map pin', glyph: MapPin },
  { key: 'globe', label: 'Globe', glyph: Globe },
  { key: 'castle', label: 'Castle', glyph: Castle },
  { key: 'house', label: 'House', glyph: House },
  { key: 'mountain', label: 'Mountain', glyph: Mountain },
  { key: 'tree', label: 'Tree', glyph: TreePine },
  // Time and conflict
  { key: 'event', label: 'Calendar', glyph: CalendarDays },
  { key: 'sword', label: 'Sword', glyph: Sword },
  { key: 'swords', label: 'Crossed swords', glyph: Swords },
  { key: 'shield', label: 'Shield', glyph: Shield },
  { key: 'skull', label: 'Skull', glyph: Skull },
  // Things
  { key: 'item', label: 'Package', glyph: Package },
  { key: 'gem', label: 'Gem', glyph: Gem },
  { key: 'coins', label: 'Coins', glyph: Coins },
  { key: 'ship', label: 'Ship', glyph: Ship },
  { key: 'book', label: 'Book', glyph: BookOpen },
  { key: 'scroll', label: 'Scroll', glyph: ScrollText },
  { key: 'flask', label: 'Flask', glyph: FlaskConical },
  // Living things and nature
  { key: 'species', label: 'Paw print', glyph: PawPrint },
  { key: 'leaf', label: 'Leaf', glyph: Leaf },
  // Ideas, magic and the sky
  { key: 'concept', label: 'Lightbulb', glyph: Lightbulb },
  { key: 'sparkles', label: 'Sparkles', glyph: Sparkles },
  { key: 'wand', label: 'Wand', glyph: WandSparkles },
  { key: 'flame', label: 'Flame', glyph: Flame },
  { key: 'star', label: 'Star', glyph: Star },
  { key: 'moon', label: 'Moon', glyph: Moon },
]

/** Drawn for a type with no icon, and for a key this build does not know. Neutral on purpose. */
export const FALLBACK_TYPE_GLYPH: LucideIcon = Shapes

const BY_KEY = new Map(TYPE_ICONS.map((option) => [option.key, option]))

/** The option for a stored key, or null when there is none or the key is not one this build draws. */
export function typeIconOption(key: string | null): TypeIconOption | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}
