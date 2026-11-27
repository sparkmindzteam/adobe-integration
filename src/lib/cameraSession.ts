const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

let stream: MediaStream | null = null
let pending: Promise<MediaStream> | null = null
let warmVideo: HTMLVideoElement | null = null

function isLive(s: MediaStream | null): s is MediaStream {
  return Boolean(s && s.getTracks().some((t) => t.readyState === 'live'))
}

/** Open (or reuse) the booth camera. Safe to call from Start + Capture. */
export async function ensureCamera(): Promise<MediaStream> {
  if (isLive(stream)) return stream
  if (pending) return pending

  pending = navigator.mediaDevices
    .getUserMedia(CONSTRAINTS)
    .then((next) => {
      stream = next
      pending = null
      return next
    })
    .catch((err) => {
      pending = null
      throw err
    })

  return pending
}

export function getCameraStream(): MediaStream | null {
  return isLive(stream) ? stream : null
}

/** Keep the pipeline warm with an offscreen video (helps AF / exposure). */
export async function warmCamera(): Promise<void> {
  const s = await ensureCamera()
  if (!warmVideo) {
    warmVideo = document.createElement('video')
    warmVideo.muted = true
    warmVideo.playsInline = true
    warmVideo.setAttribute('playsinline', '')
    warmVideo.setAttribute('aria-hidden', 'true')
    warmVideo.style.cssText =
      'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px'
    document.body.appendChild(warmVideo)
  }
  if (warmVideo.srcObject !== s) {
    warmVideo.srcObject = s
  }
  try {
    await warmVideo.play()
  } catch {
    /* autoplay can fail until a gesture; stream is still open */
  }
}

export async function attachCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const s = await ensureCamera()
  if (video.srcObject !== s) {
    video.srcObject = s
  }
  await video.play()
  return s
}

/** Stop tracks — call when leaving the booth flow (home / result). */
export function releaseCamera(): void {
  pending = null
  if (warmVideo) {
    warmVideo.srcObject = null
    warmVideo.remove()
    warmVideo = null
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
}
