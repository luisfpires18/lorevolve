import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { BrandMark } from './BrandMark'
import { Wordmark } from './Wordmark'

/**
 * LorEvolve's brand, leading to its home from everywhere (031) and named so. The symbol and the wordmark by default;
 * `large` is the auth plate's size; `glyph` replaces both where they do not fit (the workspace rail's drawn L).
 */
export function BrandLink({
  className,
  testId,
  large = false,
  glyph,
}: {
  className: string
  testId?: string
  large?: boolean
  glyph?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Link className={className} to="/" aria-label={t('shell.brand.homeLabel')} data-testid={testId}>
      {glyph ?? (
        <>
          <BrandMark className={large ? 'brandmark brandmark--plate' : undefined} />
          <Wordmark large={large} />
        </>
      )}
    </Link>
  )
}
