import { useId, type SVGProps } from 'react'

/*
 * Language flags (ADR 0071) as inline SVG: flag emoji do not render on Windows. Decorative only - the language's own
 * name beside each flag is what a reader and a screen reader go by.
 */

/** The United Kingdom's flag, for English. */
export function FlagGB(props: SVGProps<SVGSVGElement>) {
  const clip = useId()
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true" focusable="false" {...props}>
      <clipPath id={clip}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath={`url(#${clip})`}
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

/** Portugal's flag, simplified to what reads at icon size: the green and red fields and the sphere with the shield. */
export function FlagPT(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 60 40" aria-hidden="true" focusable="false" {...props}>
      <rect width="24" height="40" fill="#046A38" />
      <rect x="24" width="36" height="40" fill="#DA291C" />
      <circle cx="24" cy="20" r="9" fill="none" stroke="#FFE900" strokeWidth="2.5" />
      <path d="M19,14 h10 v7 a5,5 0 0 1 -10,0 z" fill="#fff" stroke="#DA291C" strokeWidth="1.5" />
    </svg>
  )
}
