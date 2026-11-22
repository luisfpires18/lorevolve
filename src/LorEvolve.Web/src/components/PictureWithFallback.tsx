import { useState, type ComponentProps, type ReactNode } from 'react'

/**
 * A picture that gives way to `fallback` when it fails to load. Every `img` attribute passes through
 * (`alt`, `width`, `height`, `loading`, `fetchPriority`, `decoding`, `style`), so each screen keeps its own
 * wording and loading. The failure is held per `src`: a new picture or crop is tried again.
 */
export function PictureWithFallback({
  src,
  fallback,
  testId,
  ...img
}: ComponentProps<'img'> & { src: string; fallback: ReactNode; testId?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (failedSrc === src) return <>{fallback}</>
  return <img {...img} src={src} onError={() => setFailedSrc(src)} data-testid={testId} />
}
