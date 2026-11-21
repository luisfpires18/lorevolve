import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

/** The owner's quiet way from a public reading page into the workspace; nothing for anybody else (`to` null). */
export function PublicEditLink({ to, label }: { to: string | null; label: string }) {
  if (!to) return null
  return (
    <Link className="pread__edit" to={to} data-testid="edit-in-workspace">
      {label}
      <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} />
    </Link>
  )
}
