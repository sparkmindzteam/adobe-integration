const SERVER_KEY = 'frameflash-booth-server'
const DIR_KEY = 'frameflash-photo-dir'

export const DEFAULT_PHOTO_DIR = 'E:\\Adobe integration\\test photos'

const configured = import.meta.env.VITE_BOOTH_SERVER_URL?.replace(/\/$/, '') || ''

/**
 * Dev: same-origin `/api` via Vite proxy.
 * Prod (Vercel): use VITE_BOOTH_SERVER_URL if set (public laptop relay).
 * Empty string means “no laptop relay”.
 */
export function getBoothServerUrl() {
  if (configured) return configured

  if (typeof window !== 'undefined') {
    const fromStorage = localStorage.getItem(SERVER_KEY)?.replace(/\/$/, '') || ''
    if (fromStorage) return fromStorage

    // Local Vite dev only — proxy /api → laptop relay
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return ''
    }
  }

  return ''
}

export function setBoothServerUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, '')
  localStorage.setItem(
    SERVER_KEY,
    normalized.startsWith('http') ? normalized : `https://${normalized}`,
  )
}

export function getPhotoDirectory() {
  return localStorage.getItem(DIR_KEY) || DEFAULT_PHOTO_DIR
}

export function setPhotoDirectory(dir: string) {
  localStorage.setItem(DIR_KEY, dir.trim() || DEFAULT_PHOTO_DIR)
}

export function isBoothServerConfigured() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
  }
  return Boolean(getBoothServerUrl())
}

export type BoothMeta = {
  sessionId: string
  createdAt: string
  status: 'premiere_pending' | 'in_premiere' | string
  frameCount: number
  hasGif?: boolean
  outputDir?: string
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

export async function saveLaptopConfig(opts: {
  relayUrl: string
  outputDir: string
}): Promise<void> {
  setBoothServerUrl(opts.relayUrl)
  setPhotoDirectory(opts.outputDir)
  const base = getBoothServerUrl()
  if (!base && typeof window !== 'undefined') {
    // same-origin proxy in local dev
  }
  const res = await fetch(`${getBoothServerUrl()}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputDir: opts.outputDir }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Config save failed (${res.status})`)
  }
}

/** iPad → laptop: replace current folder with these 5 photos (+ optional GIF). */
export async function sendFramesToLaptop(
  frameDataUrls: string[],
  gifBlob?: Blob | null,
): Promise<{ sessionId: string; outputDir?: string }> {
  const body: { frames: string[]; gifBase64?: string } = {
    frames: frameDataUrls,
  }
  if (gifBlob) {
    body.gifBase64 = await blobToDataUrl(gifBlob)
  }

  const url = `${getBoothServerUrl()}/api/booth`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(
      `Could not reach laptop relay at ${url || '/api/booth'}. Is \`npm run server\` running? (${
        err instanceof Error ? err.message : 'network error'
      })`,
    )
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Laptop relay error (${res.status})`)
  }
  return { sessionId: data.sessionId as string, outputDir: data.outputDir as string | undefined }
}

export async function clearLaptopBooth(): Promise<void> {
  const res = await fetch(`${getBoothServerUrl()}/api/booth`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Failed to clear laptop booth (${res.status})`)
  }
}

export async function fetchLaptopBooth(): Promise<BoothMeta | null> {
  const res = await fetch(`${getBoothServerUrl()}/api/booth`)
  if (!res.ok) throw new Error(`Failed to fetch booth (${res.status})`)
  const data = await res.json()
  return data.booth ?? null
}

export async function pingBoothServer(url?: string): Promise<boolean> {
  const base = (url ?? getBoothServerUrl()).replace(/\/$/, '')
  const res = await fetch(`${base}/api/health`)
  return res.ok
}
