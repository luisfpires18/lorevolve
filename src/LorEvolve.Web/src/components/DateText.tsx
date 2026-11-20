import { formatDate, formatDateTime } from '../lib/dates'

export interface DateTextProps {
  /** The API value: an ISO date or timestamp. It is also the machine-readable `dateTime`. */
  value: string
  /** Show the time of day as well as the day. */
  withTime?: boolean
  className?: string
}

/** A date or a timestamp as the reader's language writes it, in a `<time>` carrying the API value. */
export function DateText({ value, withTime, className }: DateTextProps) {
  return (
    <time dateTime={value} className={className}>
      {withTime ? formatDateTime(value) : formatDate(value)}
    </time>
  )
}
