import { clearLaptopBooth, sendFramesToLaptop } from './boothServer'
import { GIF_BUCKET, isSupabaseConfigured, supabase } from './supabase'

export type PremiereHandoffResult = {
  sessionId: string
}

export type ExportResult = {
  sessionId: string
  gifPath: string
  publicUrl: string
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

/**
 * iPad → laptop relay for Premiere, and create/update the Supabase session row.
 */
export async function sendFramesToPremiere(
  frameDataUrls: string[],
  gifBlob?: Blob | null,
): Promise<PremiereHandoffResult> {
  const result = await sendFramesToLaptop(frameDataUrls, gifBlob)

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('booth_sessions').upsert({
      id: result.sessionId,
      frame_count: frameDataUrls.length,
      status: 'premiere_pending',
      gif_path: null,
      gif_url: null,
    })
    if (error) {
      console.warn('Supabase session upsert failed:', error.message)
    }

    // Upload the 5 frames for cloud backup (best-effort)
    try {
      await Promise.all(
        frameDataUrls.map(async (dataUrl, i) => {
          const blob = await dataUrlToBlob(dataUrl)
          const path = `${result.sessionId}/frame_${String(i + 1).padStart(2, '0')}.jpg`
          const { error: upErr } = await supabase!.storage
            .from(GIF_BUCKET)
            .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (upErr) console.warn('Frame upload failed:', path, upErr.message)
        }),
      )
    } catch (err) {
      console.warn('Frame backup skipped:', err)
    }
  }

  return result
}

/**
 * Upload GIF to Supabase Storage + booth_sessions, then clear laptop inbox.
 */
export async function exportGifToSupabase(
  sessionId: string,
  gifBlob: Blob,
): Promise<ExportResult> {
  const client = requireClient()
  const gifPath = `${sessionId}/booth.gif`

  const { error: gifError } = await client.storage
    .from(GIF_BUCKET)
    .upload(gifPath, gifBlob, {
      contentType: 'image/gif',
      upsert: true,
    })

  if (gifError) throw gifError

  const {
    data: { publicUrl },
  } = client.storage.from(GIF_BUCKET).getPublicUrl(gifPath)

  const { error: rowError } = await client.from('booth_sessions').upsert({
    id: sessionId,
    gif_path: gifPath,
    gif_url: publicUrl,
    frame_count: 5,
    status: 'exported',
  })

  if (rowError) throw rowError

  try {
    await clearLaptopBooth()
  } catch (err) {
    console.warn('Laptop inbox clear failed after Supabase export:', err)
  }

  return { sessionId, gifPath, publicUrl }
}
