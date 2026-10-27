/** The text box properties that decide where a character lands, copied onto the measuring copy. */
const COPIED = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'tabSize',
  'wordSpacing',
  'direction',
] as const

/**
 * Where character `index` of a `<textarea>` is drawn, in pixels from the box's top-left corner, its scroll included, and
 * how tall a line is. A textarea cannot say where its caret is, so an off-screen copy with the same box and font lays the
 * text out up to that character and the position of a marker after it is read back. Used to open the mention suggestions
 * at the caret; nothing about the text box itself changes.
 */
export function caretPoint(box: HTMLTextAreaElement, index: number) {
  const style = window.getComputedStyle(box)
  const copy = document.createElement('div')
  for (const property of COPIED) copy.style[property] = style[property]
  copy.style.position = 'absolute'
  copy.style.visibility = 'hidden'
  copy.style.top = '0'
  copy.style.left = '-9999px'
  copy.style.whiteSpace = 'pre-wrap'
  copy.style.overflowWrap = 'break-word'
  copy.style.overflow = 'hidden'
  copy.textContent = box.value.slice(0, index)
  const marker = document.createElement('span')
  marker.textContent = box.value.slice(index, index + 1) || '.'
  copy.appendChild(marker)
  document.body.appendChild(copy)
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4
  const point = {
    top: marker.offsetTop - box.scrollTop,
    left: marker.offsetLeft - box.scrollLeft,
    lineHeight,
  }
  copy.remove()
  return point
}
