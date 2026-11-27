import { useEffect, useRef, useState } from 'react'
import { attachCamera, ensureCamera, releaseCamera } from '../lib/cameraSession'
import './capture-booth.css'

const TOTAL_SHOTS = 5
const COUNTDOWN_FROM = 3

type CaptureBoothProps = {
  onComplete: (captures: string[]) => void
  onCancel: () => void
}

type Phase = 'live' | 'preview'

/**
 * Branding / décor / “5-SHOT GIF” wording live in capture-bg.png.
 * After the 5 shots, this same page shows a full preview with Retake / Continue.
 */
export function CaptureBooth({ onComplete, onCancel }: CaptureBoothProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('live')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captures, setCaptures] = useState<string[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [running, setRunning] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [camKey, setCamKey] = useState(0)

  useEffect(() => {
    if (phase !== 'live') return

    let cancelled = false

    async function openCamera() {
      setReady(false)
      setError(null)
      try {
        // Prefers the stream already warmed on the Start page
        const stream = videoRef.current
          ? await attachCamera(videoRef.current)
          : await ensureCamera()
        if (cancelled) return
        streamRef.current = stream
        setReady(true)
      } catch {
        setError('Could not access the camera. Check browser permissions and try again.')
      }
    }

    void openCamera()

    return () => {
      cancelled = true
      // Keep the shared booth stream alive for Start ↔ Capture; only detach this video
      if (videoRef.current) videoRef.current.srcObject = null
      streamRef.current = null
    }
  }, [phase, camKey])

  function snapFrame(): string | null {
    const video = videoRef.current
    if (!video) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  async function runSequence() {
    if (!ready || running) return
    setRunning(true)
    const shots: string[] = []

    for (let shot = 0; shot < TOTAL_SHOTS; shot++) {
      setActiveIndex(shot)
      for (let n = COUNTDOWN_FROM; n >= 1; n--) {
        setCountdown(n)
        await wait(1000)
      }
      setCountdown(0)
      setFlash(true)
      const frame = snapFrame()
      await wait(180)
      setFlash(false)
      setCountdown(null)
      if (frame) {
        shots.push(frame)
        setCaptures([...shots])
      }
      if (shot < TOTAL_SHOTS - 1) await wait(450)
    }

    releaseCamera()
    streamRef.current = null
    setRunning(false)
    setCaptures(shots)
    setPhase('preview')
  }

  function handleRetake() {
    setCaptures([])
    setCountdown(null)
    setFlash(false)
    setRunning(false)
    setActiveIndex(0)
    setCamKey((k) => k + 1)
    setPhase('live')
  }

  const currentShot = running
    ? Math.min(captures.length + 1, TOTAL_SHOTS)
    : captures.length
  const progress = captures.length / TOTAL_SHOTS
  const ringStyle = {
    background: `conic-gradient(#ff4f91 ${progress * 360}deg, rgba(255, 255, 255, 0.35) 0deg)`,
  }

  return (
    <section
      className={`cb-page ${phase === 'preview' ? 'cb-previewing' : ''}`}
      aria-label={phase === 'preview' ? 'Review your shots' : '5-Shot GIF capture'}
    >
      <div className="cb-frame">
        <img
          className="cb-page-bg"
          src="/field-trip/capture-bg.png"
          alt=""
          aria-hidden
          draggable={false}
        />

        {phase === 'live' && (
          <button
            type="button"
            className="cb-back"
            onClick={onCancel}
            disabled={running}
          >
            Back
          </button>
        )}

        {phase === 'live' ? (
          <div className="cb-stage">
            <div className="cb-viewfinder">
              {flash && <div className="cb-flash" aria-hidden />}
              <video ref={videoRef} className="cb-video" playsInline muted autoPlay />
              <div className="cb-corners" aria-hidden>
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="cb-live">
                <i />
                LIVE
              </div>
              {countdown !== null && (
                <div className="cb-countdown" key={countdown}>
                  {countdown === 0 ? 'SNAP' : countdown}
                </div>
              )}
              {!ready && !error && <p className="cb-status">Opening camera…</p>}
              {error && <p className="cb-status cb-error">{error}</p>}
            </div>

            <div className="cb-thumbs">
              {Array.from({ length: TOTAL_SHOTS }).map((_, i) => (
                <div
                  key={i}
                  className={`cb-thumb ${captures[i] ? 'filled' : ''} ${
                    activeIndex === i && running ? 'active' : ''
                  } ${captures.length === i + 1 ? 'latest' : ''}`}
                >
                  {captures[i] ? (
                    <img src={captures[i]} alt={`Shot ${i + 1}`} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="cb-controls">
              <button
                type="button"
                className="cb-shutter"
                disabled={!ready || running || Boolean(error)}
                onClick={() => void runSequence()}
                aria-label={running ? 'Capturing' : 'Start capture'}
              >
                <span className="cb-shutter-ring" style={ringStyle} />
                <span className="cb-shutter-core">
                  <CameraIcon />
                </span>
              </button>
              <p className="cb-shot-label">
                Shot {currentShot} of {TOTAL_SHOTS}
              </p>
              {running && <p className="cb-hint">Hold still — 3s countdown each shot</p>}
              {!running && ready && !error && (
                <p className="cb-hint">Tap the camera to begin</p>
              )}
            </div>

            <div className="cb-steps" aria-label="Capture progress">
              {Array.from({ length: TOTAL_SHOTS }).map((_, i) => {
                const done = captures.length > i
                const current = captures.length === i && running
                return (
                  <div key={i} className="cb-step-item">
                    {i > 0 && (
                      <span className={`cb-step-line ${done || current ? 'on' : ''}`} />
                    )}
                    <span
                      className={`cb-step-dot ${done ? 'done' : ''} ${current ? 'current' : ''}`}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="cb-stage cb-stage-preview">
            <div className="cb-preview-grid" aria-label="Captured shots preview">
              {captures.map((src, i) => (
                <figure key={i} className="cb-preview-card">
                  <img src={src} alt={`Shot ${i + 1}`} />
                  <figcaption>{i + 1}</figcaption>
                </figure>
              ))}
            </div>

            <div className="cb-preview-actions">
              <button type="button" className="cb-btn cb-btn-ghost" onClick={handleRetake}>
                Retake
              </button>
              <button
                type="button"
                className="cb-btn cb-btn-primary"
                onClick={() => onComplete(captures)}
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden>
      <path
        fill="#fff"
        d="M9 4.5h6l1.2 1.8H20A1.8 1.8 0 0 1 21.8 8.1v10.1A1.8 1.8 0 0 1 20 20H4a1.8 1.8 0 0 1-1.8-1.8V8.1A1.8 1.8 0 0 1 4 6.3h3.8L9 4.5Zm3 12.2A3.6 3.6 0 1 0 12 9.5a3.6 3.6 0 0 0 0 7.2Z"
      />
    </svg>
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
