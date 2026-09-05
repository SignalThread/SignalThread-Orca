'use client'

import { useEffect, useRef, useState } from 'react'

type RecorderState = 'idle' | 'recording' | 'uploading' | 'saved'

async function responseData(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.success) throw new Error(body.error || 'Voice update could not be saved')
  return body.data
}

export function EventActionVoiceUpdateRecorder({
  endpoint,
  disabled,
  onComplete,
}: {
  endpoint: string
  disabled: boolean
  onComplete: () => void | Promise<void>
}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const upload = async (blob: Blob, durationMs: number) => {
    setState('uploading')
    const mimeType = (blob.type || 'audio/webm').split(';')[0]
    const presign = await responseData(await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'PRESIGN', fileName: `action-update-${Date.now()}.webm`, fileSize: blob.size, mimeType,
      }),
    }))
    const uploadResponse = await fetch(presign.url, {
      method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob,
    })
    if (!uploadResponse.ok) throw new Error('Voice update upload failed')
    await responseData(await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'CONFIRM', objectKey: presign.key, mimeType, durationMs, idempotencyKey: crypto.randomUUID(),
      }),
    }))
    setState('saved')
    await onComplete()
  }

  const start = async () => {
    if (state !== 'idle' && state !== 'saved') return
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Voice recording is not supported in this browser')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onerror = () => { setError('Voice recording failed. Please try again.'); setState('idle') }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size === 0) throw new Error('No voice update was recorded')
          await upload(blob, Math.max(1, Date.now() - startedAtRef.current))
        } catch (currentError) {
          setError(currentError instanceof Error ? currentError.message : 'Voice update could not be saved')
          setState('idle')
        }
      }
      startedAtRef.current = Date.now()
      recorder.start(1000)
      setState('recording')
    } catch (currentError) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setError(currentError instanceof Error ? currentError.message : 'Microphone access was not available')
      setState('idle')
    }
  }

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  if (state === 'idle' || state === 'saved') return <button type="button" disabled={disabled} onClick={start} className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">Record a voice update</button>

  return <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black text-violet-900">Voice update</p><p className="mt-0.5 text-[11px] leading-4 text-violet-700">{state === 'recording' ? 'Recording. Tap Stop and save when finished.' : 'Saving voice update…'}</p></div>
      {state === 'recording' ? <button type="button" disabled={disabled} onClick={stop} className="min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Stop and save</button> : null}
    </div>
    {error && <p aria-live="polite" className="mt-2 text-[11px] text-rose-700">{error}</p>}
  </div>
}
