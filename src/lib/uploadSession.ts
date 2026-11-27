import { sendFramesToLaptop } from './boothServer'
import { GIF_BUCKET, isSupabaseConfigured, supabase } from './supabase'

export type SendPhotosResult = {
  sessionId: string
  framePaths: string[]
  laptopSaved: boolean
}

function requireClient() {
  const client = supabase
  if (!isSupabaseConfigured || !client) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env',
    )
  }
  return client
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

function newSessionId() {
  return crypto.randomUUID()
}

/**
 * Upload the 5 photos to Supabase Storage (required).
 * Also tries the laptop Premiere inbox when a relay is reachable.
 */
export async function sendPhotosToStorage(
  frameDataUrls: string[],
): Promise<SendPhotosResult> {
  const client = requireClient()

  let sessionId: string = newSessionId()
  let laptopSaved = false

  try {
    const laptop = await sendFramesToLaptop(frameDataUrls, null)
    sessionId = String(laptop.sessionId)
    laptopSaved = true
  } catch (err) {
    console.warn('Laptop relay skipped:', err)
  }

  const framePaths: string[] = []
  for (let i = 0; i < frameDataUrls.length; i++) {
    const blob = await dataUrlToBlob(frameDataUrls[i])
    const path = `${sessionId}/frame_${String(i + 1).padStart(2, '0')}.jpg`
    const { error } = await client.storage
      .from(GIF_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
    framePaths.push(path)
  }

  const { error: rowError } = await client.from('booth_sessions').upsert({
    id: sessionId,
    frame_count: frameDataUrls.length,
    status: laptopSaved ? 'uploaded' : 'cloud_only',
    gif_path: null,
    gif_url: null,
  })
  if (rowError) throw rowError

  return { sessionId, framePaths, laptopSaved }
}
