import { Fragment } from 'react'

/**
 * Names an author wrote, listed inside a sentence of LorEvolve's own: "also known as …".
 *
 * Each name is isolated in a `<bdi>`, so it is laid out in its own direction and cannot reach its neighbours.
 * Without that, two names written right to left run together into one right-to-left stretch and the list reads
 * backwards, and a name that mixes scripts is split across the comma. The text is exactly the names and the
 * commas, as it was.
 */
export function NameList({ names }: { names: string[] }) {
  return names.map((name, index) => (
    <Fragment key={index}>
      {index > 0 ? ', ' : null}
      <bdi>{name}</bdi>
    </Fragment>
  ))
}

/** “…”: one name an author wrote, quoted inside a sentence of LorEvolve's own and isolated the same way. */
export function Quoted({ text }: { text: string }) {
  return (
    <>
      “<bdi>{text}</bdi>”
    </>
  )
}
