'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

interface AnalysisInsights {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

interface Question {
  id: string
  text: string
  order: number
  isRequired: boolean
}

interface Branding {
  primaryButtonColor?: string | null
  primaryColor?: string | null
}

interface AudioRecorderProps {
  responseId: string
  currentQuestion: Question
  questionNumber: number
  totalQuestions: number
  isLastQuestion: boolean
  isSpeaking?: boolean
  ttsDone?: boolean
  isMobileDevice?: boolean
  isIOSDevice?: boolean
  branding?: Branding | null
  onSpeakQuestion?: () => Promise<void> | void
  onComplete: (answerId: string, transcript?: string, analysis?: AnalysisInsights) => void | Promise<void>
  onUploadComplete?: (answerId: string, success: boolean) => void
  onSkip?: () => void | Promise<void>
  onCancel: () => void
  /** Voice + text: rendered after question subtitle, before mic / recording UI */
  answerModeChoice?: ReactNode
  /** Structured voice metadata is sent with the same audio upload path. */
  structuredAnswer?: { type: string; speakerId?: string }
  voiceAnswerPrompt?: string
  /** Renders the exact attendee voice card without requesting microphone access. */
  preview?: boolean
}

type RecordingState = 'idle' | 'recording' | 'stopping' | 'processing' | 'uploading'

const MIN_BLOB_SIZE_BYTES = 10240
const CHUNK_FLUSH_DELAY_MS = 200

export function AudioRecorder({
  responseId,
  currentQuestion,
  questionNumber,
  totalQuestions,
  isLastQuestion,
  isSpeaking = false,
  ttsDone = false,
  isMobileDevice = false,
  isIOSDevice = false,
  branding,
  onSpeakQuestion,
  onComplete,
  onUploadComplete,
  onSkip,
  onCancel,
  answerModeChoice,
  structuredAnswer,
  voiceAnswerPrompt,
  preview = false,
}: AudioRecorderProps) {
  const promptLabel = currentQuestion.text
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [canRecord, setCanRecord] = useState(false)
  const [waitingForTTS, setWaitingForTTS] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerIntervalRef = useRef<number | null>(null)
  const stopHandledRef = useRef<boolean>(false)

  useEffect(() => {
    if (!isSpeaking && ttsDone) {
      setCanRecord(true)

      if (waitingForTTS && isMobileDevice) {
        setWaitingForTTS(false)
        proceedWithRecording()
      }
    } else {
      setCanRecord(false)
    }
  }, [isSpeaking, ttsDone, isMobileDevice, waitingForTTS])

  // Reset mobile “play question then record” latch when the question changes.
  // Do not clear canRecord here: on VOICE_AND_TEXT remount (same question id), that would
  // run after the ttsDone effect and undo unlock when the parent sets ttsDone after text→voice.
  useEffect(() => {
    setWaitingForTTS(false)
  }, [currentQuestion.id])

  // Auto-start recording for Q2+ on Android only.
  // iOS uses autoplay (TTS fires via useEffect in page.tsx), so skip here.
  const autoStartTriggeredRef = useRef(false)
  useEffect(() => {
    if (preview) return
    if (isMobileDevice && !isIOSDevice && questionNumber > 1 && recordingState === 'idle' && !autoStartTriggeredRef.current) {
      autoStartTriggeredRef.current = true
      setTimeout(() => startRecording(), 100)
    }
    return () => {
      autoStartTriggeredRef.current = false
    }
  }, [currentQuestion.id, isMobileDevice, isIOSDevice, preview, questionNumber, recordingState])

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    if (preview) return
    if (recordingState !== 'idle' || waitingForTTS) return
    try {
      setError(null)

      // On mobile, trigger TTS before recording — but only if TTS hasn't
      // already played for this question (e.g. via autoplay on iOS/desktop).
      if (isMobileDevice && onSpeakQuestion && !ttsDone) {
        setWaitingForTTS(true)
        await Promise.resolve(onSpeakQuestion())
        return
      }

      if (canRecord) {
        await proceedWithRecording()
      }
    } catch (err) {
      console.error('[AudioRecorder] Failed to start recording:', err)
      setError('Failed to access microphone. Please grant permission.')
      setRecordingState('idle')
      setWaitingForTTS(false)
    }
  }

  const proceedWithRecording = async () => {
    try {
      chunksRef.current = []
      stopHandledRef.current = false

      if (!currentQuestion?.id) {
        setError('Question not loaded. Please wait a moment.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      })

      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (stopHandledRef.current) return
        stopHandledRef.current = true

        stream.getTracks().forEach(track => track.stop())
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

        await new Promise(resolve => setTimeout(resolve, CHUNK_FLUSH_DELAY_MS))

        processRecording()
          .then(async (result) => {
            onUploadComplete?.(result.answerId, true)
            await Promise.resolve(onComplete(result.answerId, result.transcript, undefined))
          })
          .catch((err) => {
            console.error('[AudioRecorder] Background upload failed:', err)
            setError(err instanceof Error ? err.message : 'We could not save your recording. Please try again.')
          })
      }

      mediaRecorder.onerror = (event) => {
        console.error('[AudioRecorder] MediaRecorder error:', event)
        setError('Recording error occurred')
        setRecordingState('idle')
      }

      mediaRecorder.start(1000)
      startTimeRef.current = Date.now()
      setRecordingState('recording')

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setRecordingDuration(elapsed)
      }, 1000)
    } catch (err) {
      console.error('[AudioRecorder] Failed to start recording:', err)
      setError('Failed to access microphone. Please grant permission.')
      setRecordingState('idle')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setRecordingState('stopping')
      try {
        mediaRecorderRef.current.requestData()
      } catch { }
      mediaRecorderRef.current.stop()
    }
  }

  const processRecording = async (): Promise<{ answerId: string; transcript?: string }> => {
    try {
      setRecordingState('processing')

      if (chunksRef.current.length === 0) {
        throw new Error('No audio data captured')
      }

      const audioBlob = new Blob(chunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm'
      })

      if (audioBlob.size < MIN_BLOB_SIZE_BYTES) {
        throw new Error(`Recording too short.`)
      }

      const actualDuration = await getAudioDuration(audioBlob)
      if (actualDuration < 1000) {
        throw new Error(`Recording too short.`)
      }

      setRecordingState('uploading')

      const normalizedMimeType = audioBlob.type.split(';')[0].trim()

      if (!currentQuestion?.id) {
        throw new Error('Question not initialized. Please wait and try again.')
      }

      const presignResponse = await fetch('/api/answer/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          questionKey: currentQuestion.id,
          promptLabel,
          fileName: `recording-${Date.now()}.webm`,
          fileSize: audioBlob.size,
          mimeType: normalizedMimeType,
        }),
      })

      if (!presignResponse.ok) {
        const errorData = await presignResponse.json().catch(() => ({}))
        throw new Error(errorData.message || `Presign failed`)
      }

      const presignData = await presignResponse.json()
      if (!presignData.success || !presignData.url) {
        throw new Error(presignData.message || 'Invalid presign response')
      }

      const { url: uploadUrl, key: objectKey } = presignData

      console.log(`[AudioRecorder] ${isLastQuestion ? 'final ' : ''}upload started`, { responseId, objectKey })

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': normalizedMimeType },
        body: audioBlob,
      })

      if (!uploadResponse.ok) {
        console.error(`[AudioRecorder] Upload failure`, { responseId, objectKey, status: uploadResponse.status })
        throw new Error(`Upload failed`)
      }

      console.log(`[AudioRecorder] ${isLastQuestion ? 'final ' : ''}upload succeeded`, { responseId, objectKey })

      const etag = uploadResponse.headers.get('ETag')

      const completeResponse = await fetch('/api/answer/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          responseId,
          questionKey: currentQuestion.id,
          promptLabel,
          fileSize: audioBlob.size,
          mimeType: normalizedMimeType,
          key: objectKey,
          ...(structuredAnswer?.speakerId ? { speakerId: structuredAnswer.speakerId } : {}),
        }),
      })

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'Upload verification failed')
      }

      const completeData = await completeResponse.json()
      if (!completeData.success || !completeData.exists) {
        throw new Error('Upload verification failed')
      }

      const answerId = completeData.answerId

      console.log(`[AudioRecorder] Answer row persisted`, { answerId })

      const confirmResponse = await fetch('/api/answer/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answerId,
          objectEtag: etag || 'none',
          durationMs: actualDuration,
          language: 'en',
        }),
      })

      const confirmData = await confirmResponse.json().catch(() => null)
      if (!confirmResponse.ok || !confirmData?.success) {
        throw new Error(confirmData?.message || 'We could not confirm your recording. Please try again.')
      }

      setRecordingState('idle')
      setRecordingDuration(0)
      return { answerId, transcript: confirmData.data?.transcript }
    } catch (err) {
      console.error('[AudioRecorder] Processing error:', err)
      setRecordingState('idle')
      setRecordingDuration(0)
      throw err
    }
  }

  const getAudioDuration = async (blob: Blob): Promise<number> => {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      await audioContext.close()
      return Math.round(audioBuffer.duration * 1000)
    } catch (err) {
      console.error('[AudioRecorder] Failed to decode audio:', err)
      return recordingDuration * 1000
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isIdle = recordingState === 'idle'
  const isBusy = recordingState === 'stopping' || recordingState === 'processing' || recordingState === 'uploading'
  // TTS autoplay is active on desktop and iOS (not Android).
  // When autoplay is active, gate the mic on canRecord (TTS must finish first).
  const ttsAutoplayEnabled = !isMobileDevice || isIOSDevice
  const micDisabled = !preview && (isSpeaking || waitingForTTS || isBusy || (ttsAutoplayEnabled && !canRecord))

  const handleHearQuestion = async () => {
    if (!onSpeakQuestion) return
    try {
      setError(null)
      await Promise.resolve(onSpeakQuestion())
    } catch (e) {
      console.error('[AudioRecorder] Hear question failed:', e)
    }
  }

  return (
    <div className="min-h-[100svh] bg-white">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-3xl flex-col px-6 pb-10 pt-7 sm:px-10 sm:pt-9">
        {/* Question header — prompt only (pill removed) */}
        <div className="text-center mb-3 sm:mb-4">
          <h2 className="mx-auto max-w-[26ch] text-2xl sm:text-[2.15rem] md:text-[2.35rem] font-bold text-gray-900 leading-[1.15] px-1">
            {promptLabel}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-500">
            {voiceAnswerPrompt ?? 'Share your answer in one or two sentences.'}
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800 sm:text-base">{error}</p>
          </div>
        )}

        {answerModeChoice && isIdle ? <div className="mt-4 w-full sm:mt-5">{answerModeChoice}</div> : null}

        {/* Center stage — boxed CTA area (5dd1c31 + idle helper) */}
        <div className="mb-8 sm:mb-10 flex flex-1 flex-col items-center justify-center">
          {isIdle && (
            <div className="w-full max-w-[420px] mx-auto">
              {/* Hear Question — above box */}
              {onSpeakQuestion && (
                <div className="flex justify-center mb-2.5">
                  <button
                    type="button"
                    onClick={handleHearQuestion}
                    disabled={isSpeaking || !onSpeakQuestion}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    {isSpeaking ? 'Playing\u2026' : 'Hear Question'}
                  </button>
                </div>
              )}

              {/* Boxed CTA container — mic + idle helper + Cancel */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-6 sm:py-8 text-center">
                {/* Idle helper: "Tap to start recording" + arrow, or "Starting…" */}
                <div className="relative min-h-[52px] w-full flex items-center justify-center mb-2">
                  <div
                    data-testid="idle-helper"
                    className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-150 pointer-events-none ${preview || canRecord ? 'opacity-100' : 'opacity-0 invisible'}`}
                  >
                    <p className="mb-1 text-lg font-semibold text-gray-900 sm:text-xl">
                      Tap to start recording
                    </p>
                    <div className="flex justify-center">
                      <svg className="h-6 w-6 sm:h-7 sm:w-7 text-gray-900 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <polyline points="19 12 12 19 5 12" />
                      </svg>
                    </div>
                  </div>
                  <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-150 pointer-events-none ${(isSpeaking || waitingForTTS) ? 'opacity-100' : 'opacity-0 invisible'}`}>
                    <p className="text-lg font-semibold text-gray-900 sm:text-xl">
                      Starting…
                    </p>
                  </div>
                </div>

                {/* Mic button */}
                <div className="relative mx-auto mb-3 h-44 w-44 sm:h-52 sm:w-52">
                  <button
                    onClick={startRecording}
                    disabled={micDisabled}
                    aria-label="Tap microphone to start recording"
                    className={`relative z-10 flex h-full w-full items-center justify-center rounded-full border transition active:scale-[0.98] ${micDisabled
                        ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                        : 'border-gray-200 bg-gray-50 text-gray-900 shadow-xl hover:bg-gray-100'
                      }`}
                  >
                    {waitingForTTS ? (
                      <svg className="h-14 w-14 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-[4.35rem] w-[4.35rem] sm:h-[5.1rem] sm:w-[5.1rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>
                </div>

                <p className="text-sm text-gray-500 sm:text-base">
                  Tap and speak your answer. Minimum 1 second.
                </p>

                <button
                  type="button"
                  onClick={onCancel}
                  className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                {!currentQuestion.isRequired && onSkip && (
                  <button
                    type="button"
                    onClick={() => void onSkip()}
                    className="mt-3 block w-full text-sm font-semibold text-gray-600 underline-offset-4 transition hover:text-gray-900 hover:underline"
                  >
                    Skip this question
                  </button>
                )}
              </div>
            </div>
          )}

          {recordingState === 'recording' && (
            <div className="text-center">
              <div className="relative mx-auto mb-6 h-40 w-40 sm:h-48 sm:w-48">
                <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />

                <button
                  type="button"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  className="relative flex h-full w-full items-center justify-center rounded-full bg-red-600 shadow-xl transition active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-full bg-white" />
                </button>
              </div>

              <div className="font-mono text-5xl font-bold text-gray-900 sm:text-6xl">
                {formatTime(recordingDuration)}
              </div>
              <p className="mt-2 text-sm font-medium text-gray-500 sm:text-base">Recording…</p>

              <button
                onClick={stopRecording}
                className={`mt-8 w-full max-w-md rounded-2xl px-8 py-5 text-base font-semibold text-white shadow-lg transition hover:opacity-95 sm:text-lg ${!branding?.primaryButtonColor ? 'bg-neutral-950 hover:bg-neutral-900' : ''}`}
                style={branding?.primaryButtonColor ? { backgroundColor: branding.primaryButtonColor } : undefined}
              >
                Stop Recording
              </button>
            </div>
          )}

          {isBusy && (
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-gray-900 border-t-transparent" />
              <p className="text-sm font-medium text-gray-700 sm:text-base">
                {recordingState === 'stopping' && 'Finishing up…'}
                {recordingState === 'processing' && 'Processing…'}
                {recordingState === 'uploading' && 'Saving…'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
