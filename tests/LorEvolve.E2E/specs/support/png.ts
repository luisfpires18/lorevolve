import { deflateSync } from 'node:zlib'

/** Red, green and blue channels, 0-255. */
export type Rgb = [number, number, number]

/**
 * A real PNG, built from bytes, coloured pixel by pixel.
 *
 * Written out rather than checked in: a binary fixture in the repository is one more thing to
 * keep, and this way the test can ask for whatever size, colours and orientation the case needs.
 * `orientation`, when given, is written as an EXIF tag in an `eXIf` chunk - the same tag a phone
 * writes - so the picture is stored one way and displayed another.
 */
export function png(
  width: number,
  height: number,
  colour: (x: number, y: number) => Rgb,
  orientation?: number,
) {
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 3)
    // Filter byte 0: this scanline is stored as it is.
    raw[start] = 0
    for (let x = 0; x < width; x++) {
      const at = start + 1 + x * 3
      const [red, green, blue] = colour(x, y)
      raw[at] = red
      raw[at + 1] = green
      raw[at + 2] = blue
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // Eight bits per channel.
  header[9] = 2 // Truecolour, no alpha.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(orientation ? [chunk('eXIf', exifOrientation(orientation))] : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A big-endian TIFF block holding one IFD entry: Orientation (0x0112), a SHORT, one value. */
function exifOrientation(orientation: number) {
  const tiff = Buffer.alloc(26)
  tiff.write('MM', 0, 'ascii')
  tiff.writeUInt16BE(42, 2)
  tiff.writeUInt32BE(8, 4) // The first IFD follows the header.
  tiff.writeUInt16BE(1, 8) // One entry.
  tiff.writeUInt16BE(0x0112, 10)
  tiff.writeUInt16BE(3, 12)
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt16BE(orientation, 18)
  tiff.writeUInt32BE(0, 22) // No further IFD.
  return tiff
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([length, body, crc])
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
