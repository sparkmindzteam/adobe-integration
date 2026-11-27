import { useEffect, useRef, useState } from 'react'
import { getBoothServerUrl } from '../lib/boothServer'
import {
  createGifFromCaptures,
  DEFAULT_FRAME_DELAY_SEC,
} from '../lib/createGif'
import { isSupabaseConfigured } from '../lib/supabase'
import { exportGifToSupabase, sendFramesToPremiere } from '../lib/uploadSession'
import './result-page.css'

const SPEED_KEY = 'frameflash-gif-speed'

type ResultPageProps = {
  captures: string[]
  onRestart: () => void
}

type Status =
  | 'encoding'
  | 'sending_premiere'
  | 'in_premiere'
  | 'exporting'
  | 'exported'
  | 'error'

function loadSavedSpeed() {
  const raw = localStorage.getItem(SPEED_KEY)
  const n = raw ? Number(raw) : DEFAULT_FRAME_DELAY_SEC
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FRAME_DELAY_SEC
}

export function ResultPage({ captures, onRestart }: ResultPageProps) {
  const [status, setStatus] = useState<Status>('encoding')
  const [gifUrl, setGifUrl] = useState<string | null>(null)
  const [gifBlob, setGifBlob] = useState<Blob | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const frameDelaySec = loadSavedSpeed()
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function runPipeline() {
      setMessage(null)
      let activeSessionId: string | null = null
      let blob: Blob | null = null

      // 1) Save JPGs to laptop + create Supabase session / frame backup
      try {
        setStatus('sending_premiere')
        const result = await sendFramesToPremiere(captures, null)
        if (cancelled) return
        activeSessionId = result.sessionId
        setSessionId(result.sessionId)
        setMessage(
          `Saved 5 photos to laptop (${getBoothServerUrl() || window.location.origin}/api)`,
        )
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setMessage(
          err instanceof Error
            ? err.message
            : `Could not reach the laptop relay. Keep \`npm run dev:all\` running.`,
        )
        return
      }

      await new Promise((r) => window.setTimeout(r, 50))
      if (cancelled) return

      // 2) Encode GIF for preview / download
      try {
        setStatus('encoding')
        blob = await createGifFromCaptures(captures, frameDelaySec)
        if (cancelled) return
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setGifBlob(blob)
        setGifUrl(url)
      } catch (err) {
        if (cancelled) return
        setStatus('in_premiere')
        setMessage(
          err instanceof Error
            ? `Photos saved. GIF preview failed: ${err.message}`
            : 'Photos saved. GIF preview failed.',
        )
        return
      }

      // 3) Auto-publish GIF to Supabase
      if (!isSupabaseConfigured || !blob || !activeSessionId) {
        setStatus('in_premiere')
        setMessage(
          isSupabaseConfigured
            ? 'Photos on laptop. GIF ready to save.'
            : 'Photos on laptop. Add Supabase keys in `.env` to publish the GIF.',
        )
        return
      }

      try {
        setStatus('exporting')
        const exported = await exportGifToSupabase(activeSessionId, blob)
        if (cancelled) return
        setPublicUrl(exported.publicUrl)
        setStatus('exported')
        setMessage('GIF published to Supabase. Laptop inbox cleared for the next guest.')
      } catch (err) {
        if (cancelled) return
        setStatus('in_premiere')
        setMessage(
          err instanceof Error
            ? `Photos saved. Supabase upload failed: ${err.message}`
            : 'Photos saved. Supabase upload failed.',
        )
      }
    }

    const timer = window.setTimeout(() => {
      void runPipeline()
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [captures, frameDelaySec])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function downloadGif() {
    if (!gifUrl) return
    const a = document.createElement('a')
    a.href = gifUrl
    a.download = `fieldtrip-gif-${Date.now()}.gif`
    a.click()
  }

  async function retrySend() {
    setStatus('sending_premiere')
    setMessage(null)
    try {
      const result = await sendFramesToPremiere(captures, gifBlob)
      setSessionId(result.sessionId)
      if (gifBlob && isSupabaseConfigured) {
        setStatus('exporting')
        const exported = await exportGifToSupabase(result.sessionId, gifBlob)
        setPublicUrl(exported.publicUrl)
        setStatus('exported')
        setMessage('GIF published to Supabase.')
      } else {
        setStatus('in_premiere')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Send failed')
    }
  }

  async function exportUpload() {
    if (!gifBlob || !sessionId) return
    setStatus('exporting')
    setMessage(null)
    try {
      const result = await exportGifToSupabase(sessionId, gifBlob)
      setPublicUrl(result.publicUrl)
      setStatus('exported')
      setMessage('GIF published to Supabase. Laptop inbox cleared for the next guest.')
    } catch (err) {
      setStatus('in_premiere')
      setMessage(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const landed =
    status === 'in_premiere' || status === 'exported' || status === 'exporting' || status === 'encoding'
  const showGif = Boolean(gifUrl) && (status === 'in_premiere' || status === 'exported' || status === 'exporting')

  const title =
    status === 'exported'
      ? 'Your GIF is ready'
      : status === 'error'
        ? 'Couldn’t finish this session'
        : status === 'sending_premiere'
          ? 'Saving photos…'
          : status === 'encoding'
            ? 'Building your GIF…'
            : status === 'exporting'
              ? 'Publishing to Supabase…'
              : 'Sent to Premiere Pro'

  const detail =
    status === 'exported'
      ? 'Photos went to the laptop for Premiere, and the GIF is live on Supabase.'
      : status === 'error'
        ? message
        : status === 'sending_premiere'
          ? 'Uploading your 5 shots to the laptop inbox and cloud backup.'
          : status === 'encoding'
            ? 'Photos are saved. Encoding the GIF next…'
            : status === 'exporting'
              ? 'Uploading your GIF to Supabase Storage…'
              : 'Your photos are on the laptop. Premiere Pro can turn them into a GIF.'

  const progress =
    status === 'sending_premiere'
      ? 30
      : status === 'encoding'
        ? 55
        : status === 'exporting'
          ? 85
          : status === 'error'
            ? 30
            : 100

  return (
    <section className="rp-page" aria-label="Photos sent to Premiere Pro">
      <div className="rp-frame">
        <img
          className="rp-bg"
          src="/field-trip/capture-bg.png"
          alt=""
          aria-hidden
          draggable={false}
        />

        <div className="rp-stage">
          <article
            className={`rp-card ${landed ? 'is-landed' : ''} ${status === 'error' ? 'is-error' : ''}`}
          >
            <header className="rp-copy">
              <p className="rp-kicker">5 shots → GIF</p>
              <h1>{title}</h1>
              <p className="rp-detail">{detail}</p>
            </header>

            <div className="rp-scene" aria-hidden>
              <div className="rp-stack">
                {captures.slice(0, 5).map((src, i) => (
                  <figure key={i} className="rp-shot" style={{ ['--i' as string]: i }}>
                    <img src={src} alt="" />
                  </figure>
                ))}
              </div>

              <div className="rp-lane">
                <span />
                <span />
                <span />
              </div>

              <div className="rp-laptop">
                <div className="rp-sparks" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="rp-lid">
                  <div className="rp-screen">
                    <span className="rp-pr">Pr</span>
                    <div className="rp-monitor">
                      {showGif && gifUrl ? (
                        <img className="rp-gif" src={gifUrl} alt="" />
                      ) : (
                        <div className="rp-slides">
                          {captures.slice(0, 5).map((src, i) => (
                            <img key={i} src={src} alt="" style={{ ['--i' as string]: i }} />
                          ))}
                        </div>
                      )}
                      <span className="rp-gif-badge">GIF</span>
                    </div>
                  </div>
                </div>
                <div className="rp-base" />
              </div>
            </div>

            <div className="rp-meter" aria-hidden>
              <div className="rp-meter-fill" style={{ width: `${progress}%` }} />
            </div>
          </article>

          <div className="rp-actions">
            {status === 'error' && (
              <button type="button" className="rp-btn rp-btn-primary" onClick={() => void retrySend()}>
                Try again
              </button>
            )}
            {status === 'in_premiere' && isSupabaseConfigured && (
              <button
                type="button"
                className="rp-btn rp-btn-primary"
                disabled={!sessionId || !gifBlob}
                onClick={() => void exportUpload()}
              >
                Publish GIF
              </button>
            )}
            {showGif && (
              <button type="button" className="rp-btn rp-btn-ghost" onClick={downloadGif}>
                Download
              </button>
            )}
            <button type="button" className="rp-btn rp-btn-ghost" onClick={onRestart}>
              New session
            </button>
          </div>

          {publicUrl && (
            <a className="rp-link" href={publicUrl} target="_blank" rel="noreferrer">
              Open the public GIF
            </a>
          )}

          {message && status !== 'error' && <p className="rp-toast">{message}</p>}
        </div>
      </div>
    </section>
  )
}
