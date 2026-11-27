import { useEffect, useState } from 'react'
import { CaptureBooth } from './components/CaptureBooth'
import { ResultPage } from './components/ResultPage'
import { StartPage } from './components/StartPage'
import { releaseCamera } from './lib/cameraSession'

type Step = 'start' | 'capture' | 'result'

export default function App() {
  const [step, setStep] = useState<Step>('start')
  const [captures, setCaptures] = useState<string[]>([])

  // Keep camera warm across Start ↔ Capture; release on result
  useEffect(() => {
    if (step === 'result') {
      releaseCamera()
    }
  }, [step])

  function handleComplete(frames: string[]) {
    setCaptures(frames)
    setStep('result')
  }

  function restart() {
    setCaptures([])
    setStep('start')
  }

  return (
    <main className="app">
      {step === 'start' && <StartPage onStart={() => setStep('capture')} />}
      {step === 'capture' && (
        <CaptureBooth onComplete={handleComplete} onCancel={() => setStep('start')} />
      )}
      {step === 'result' && <ResultPage captures={captures} onRestart={restart} />}
    </main>
  )
}
