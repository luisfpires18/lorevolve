import {
  BookOpen,
  Feather,
  FileText,
  Hourglass,
  Network,
  Scale,
  Spline,
  type LucideIcon,
} from 'lucide-react'
import { TrashKind, type TrashKindValue } from '../../trash/types'

const KIND_ICONS: Record<TrashKindValue, LucideIcon> = {
  [TrashKind.Entry]: FileText,
  [TrashKind.Story]: Feather,
  [TrashKind.Chapter]: BookOpen,
  [TrashKind.Scene]: FileText,
  [TrashKind.PlotArc]: Spline,
  [TrashKind.WorldRule]: Scale,
  [TrashKind.Relationship]: Network,
  [TrashKind.TimelineEvent]: Hourglass,
}

/** A story part's or a rule's square: its kind's icon on the sunken paper, the shape an entry's tile has. */
export function KindTile({ kind }: { kind: TrashKindValue }) {
  const Icon = KIND_ICONS[kind]
  return (
    <span className="tile tile--blank trash__tile" aria-hidden="true">
      <Icon className="tile__icon" strokeWidth={1.75} />
    </span>
  )
}
