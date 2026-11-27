import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { sendPhotosToStorage } from '../lib/uploadSession'
import './result-page.css'

type ResultPageProps = {
  captures: string[]
  onRestart: () => void
}

type Status = 'sending' | 'sent' | 'error'

export function ResultPage({ captures, onRestart }: ResultPageProps) {
  const [status, setStatus] = useState<Status>('sending')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setStatus('sending')
      setMessage(null)

      if (!isSupabaseConfigured) {
        setStatus('error')
        setMessage('Supabase is not configured. Add keys to `.env` and restart.')
        return
      }

      try {
        const result = await sendPhotosToStorage(captures)
        if (cancelled) return
        setStatus('sent')
        setMessage(
          result.laptopSaved
            ? 'Photos sent to storage and the laptop inbox.'
            : 'Photos sent to Supabase storage.',
        )
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Upload failed')
      }
    }

    const timer = window.setTimeout(() => {
      void run()
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [captures])

  async function retry() {
    setStatus('sending')
    setMessage(null)
    try {
      const result = await sendPhotosToStorage(captures)
      setStatus('sent')
      setMessage(
        result.laptopSaved
          ? 'Photos sent to storage and the laptop inbox.'
          : 'Photos sent to Supabase storage.',
      )
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const title =
    status === 'sent'
      ? 'Photos sent'
      : status === 'error'
        ? 'Couldn’t send photos'
        : 'Sending photos…'

  const detail =
    status === 'sent'
      ? 'Your 5 shots are in cloud storage for Premiere Pro.'
      : status === 'error'
        ? message
        : 'Uploading your 5 shots to storage…'

  const progress = status === 'sending' ? 55 : status === 'error' ? 35 : 100

  return (
    <section className="rp-page" aria-label="Sending photos to storage">
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
            className={`rp-card ${status !== 'sending' ? 'is-landed' : ''} ${
              status === 'error' ? 'is-error' : ''
            }`}
          >
            <header className="rp-copy">
              <p className="rp-kicker">5 shots</p>
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
                      <div className="rp-slides">
                        {captures.slice(0, 5).map((src, i) => (
                          <img key={i} src={src} alt="" style={{ ['--i' as string]: i }} />
                        ))}
                      </div>
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
              <button type="button" className="rp-btn rp-btn-primary" onClick={() => void retry()}>
                Try again
              </button>
            )}
            {status === 'sent' && (
              <button type="button" className="rp-btn rp-btn-primary" onClick={onRestart}>
                New session
              </button>
            )}
          </div>

          {message && status === 'sent' && <p className="rp-toast">{message}</p>}
        </div>
      </div>
    </section>
  )
}
