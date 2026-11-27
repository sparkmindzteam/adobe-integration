import { useEffect } from 'react'
import { warmCamera } from '../lib/cameraSession'
import { GifPhotoboothStart } from './gif-start/GifPhotoboothStart'

type StartPageProps = {
  onStart: () => void
}

export function StartPage({ onStart }: StartPageProps) {
  useEffect(() => {
    void warmCamera()
  }, [])

  return <GifPhotoboothStart onStart={onStart} />
}
