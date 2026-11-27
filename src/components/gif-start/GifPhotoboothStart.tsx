import { useState } from 'react'
import './gif-start.css'

type GifPhotoboothStartProps = {
  onStart: () => void
  onBack?: () => void
}

/**
 * Full start artwork is in the BG image.
 * A transparent hit target is aligned to the painted START GIF button.
 */
export function GifPhotoboothStart({ onStart, onBack }: GifPhotoboothStartProps) {
  const [leaving, setLeaving] = useState(false)

  function handleStart() {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => onStart(), 220)
  }

  return (
    <section
      className={`gs-start ${leaving ? 'gs-leaving' : ''}`}
      aria-label="Field Trip GIF Photobooth"
    >
      <div className="gs-frame">
        <img
          className="gs-page-bg"
          src="/field-trip/start-page-bg.png"
          alt="Field Trip — Ready to create?"
          draggable={false}
        />

        {/* Transparent hit area locked to the orange START GIF in the artwork */}
        <button
          type="button"
          className="gs-hit-start"
          onClick={handleStart}
          disabled={leaving}
          aria-label="Start GIF"
        />
      </div>

      {onBack && (
        <button type="button" className="gs-home" onClick={onBack}>
          Home
        </button>
      )}
    </section>
  )
}
