import { expect, type Locator } from '@playwright/test'
import type { Rgb } from './png'

/**
 * Colours read back out of a displayed picture, at fractions of the way across and down, as red,
 * green, blue and alpha.
 */
export async function colours(image: Locator, points: Array<[number, number]>) {
  await image.scrollIntoViewIfNeeded()
  await expect(image).toBeVisible()

  return image.evaluate(async (element, at) => {
    const picture = element as HTMLImageElement
    await picture.decode()

    const canvas = document.createElement('canvas')
    canvas.width = picture.naturalWidth
    canvas.height = picture.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(picture, 0, 0)

    return at.map(([across, down]) =>
      Array.from(
        context
          .getImageData(
            Math.floor(across * (picture.naturalWidth - 1)),
            Math.floor(down * (picture.naturalHeight - 1)),
            1,
            1,
          )
          .data.slice(0, 4),
      ),
    )
  }, points)
}

/**
 * The crop square sits wholly on the picture: every edge of the square is on or inside the drawn
 * image, so nothing but picture can ever be inside it.
 */
export async function expectSquareCovered(dialog: Locator) {
  const square = (await dialog.locator('.reactEasyCrop_CropArea').boundingBox())!
  const picture = (await dialog.locator('.reactEasyCrop_Image').boundingBox())!

  expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(1)
  expect(square.x).toBeGreaterThanOrEqual(picture.x - 1)
  expect(square.y).toBeGreaterThanOrEqual(picture.y - 1)
  expect(square.x + square.width).toBeLessThanOrEqual(picture.x + picture.width + 1)
  expect(square.y + square.height).toBeLessThanOrEqual(picture.y + picture.height + 1)
}

/** Every sampled pixel is recognisably `expected` - loose, because a thumbnail is lossy WebP. */
export async function expectShows(image: Locator, expected: Rgb) {
  const sampled = await colours(image, [
    [0.15, 0.15],
    [0.5, 0.5],
    [0.85, 0.85],
    [0.15, 0.85],
    [0.85, 0.15],
  ])

  for (const pixel of sampled) {
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(pixel[channel] - expected[channel])).toBeLessThan(50)
    }
  }
}
