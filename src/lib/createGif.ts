import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export const DEFAULT_FRAME_DELAY_SEC = 0.5
export const MIN_FRAME_DELAY_SEC = 0.1
export const MAX_FRAME_DELAY_SEC = 2

const TARGET_SIZE = 320

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load capture frame'))
    img.src = dataUrl
  })
}

function frameToRgba(img: HTMLImageElement): {
  rgba: Uint8ClampedArray
  width: number
  height: number
} {
  const canvas = document.createElement('canvas')
  const size = Math.min(img.width, img.height, TARGET_SIZE)
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')

  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale
  const h = img.height * scale
  const x = (size - w) / 2
  const y = (size - h) / 2
  ctx.drawImage(img, x, y, w, h)

  const { data } = ctx.getImageData(0, 0, size, size)
  return { rgba: data, width: size, height: size }
}

/** GIF delay unit is centiseconds (1/100s). */
export function secondsToGifDelay(seconds: number): number {
  const clamped = Math.min(
    MAX_FRAME_DELAY_SEC,
    Math.max(MIN_FRAME_DELAY_SEC, seconds),
  )
  return Math.round(clamped * 100)
}

export async function createGifFromCaptures(
  dataUrls: string[],
  frameDelaySec: number = DEFAULT_FRAME_DELAY_SEC,
): Promise<Blob> {
  if (dataUrls.length === 0) throw new Error('No frames to encode')

  const delay = secondsToGifDelay(frameDelaySec)
  const gif = GIFEncoder()
  let width = 0
  let height = 0

  for (let i = 0; i < dataUrls.length; i++) {
    const img = await loadImage(dataUrls[i])
    const frame = frameToRgba(img)
    width = frame.width
    height = frame.height
    // Copy out of ClampedArray — gifenc quantize is happier with a plain buffer
    const rgba = new Uint8Array(frame.rgba.buffer.slice(0))
    const palette = quantize(rgba, 256)
    const index = applyPalette(rgba, palette)
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: i === 0 ? 0 : undefined,
    })
    // Yield so the booth UI can paint between frames
    await new Promise((r) => window.setTimeout(r, 0))
  }

  gif.finish()
  const bytes = gif.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'image/gif' })
}
