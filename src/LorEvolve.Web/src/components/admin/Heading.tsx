import type { ReactNode } from 'react'

export function Heading({ title, lede }: { title: string; lede: ReactNode }) {
  return (
    <div className="home__heading">
      <div>
        <h1 className="home__title">{title}</h1>
        <p className="home__lede">{lede}</p>
      </div>
    </div>
  )
}
