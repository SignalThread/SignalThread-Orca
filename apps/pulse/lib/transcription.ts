import OpenAI from 'openai'
import { downloadObject } from './s3'

export interface TranscriptionResult {
  text: string
  language?: string
  duration?: number
}

/**
 * Transcribe audio file using OpenAI Whisper
 * Downloads from S3/MinIO and sends to OpenAI
 */
export async function transcribeAudio(objectKey: string, mimeType: string): Promise<TranscriptionResult> {
  try {
    console.log(`[Transcription] Starting transcription for ${objectKey}`)
    
    // Download audio file from S3/MinIO
    console.log(`[Transcription] Downloading from storage...`)
    const audioBuffer = await downloadObject(objectKey)
    console.log(`[Transcription] Downloaded ${audioBuffer.length} bytes`)

    // Real-browser journey tests keep the storage download and persistence
    // boundary intact, but replace the external billable transcription call
    // with a deterministic provider result.
    if (process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1') {
      return {
        text: process.env.EVENTS_TEST_TRANSCRIPT
          || 'The room was comfortable but registration lines were long.',
        language: 'en',
        duration: 2,
      }
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Determine file extension from mime type
    const extension = mimeType.includes('webm') ? 'webm' 
                    : mimeType.includes('mp4') ? 'mp4'
                    : mimeType.includes('mpeg') ? 'mp3'
                    : mimeType.includes('wav') ? 'wav'
                    : mimeType.includes('ogg') ? 'ogg'
                    : 'webm'

    // Create a File object for OpenAI API
    // Convert Buffer to Uint8Array for proper compatibility
    const uint8Array = new Uint8Array(audioBuffer.buffer as ArrayBuffer, audioBuffer.byteOffset, audioBuffer.byteLength)
    const file = new File([uint8Array], `audio.${extension}`, { type: mimeType })

    // Call OpenAI Whisper API
    console.log(`[Transcription] Sending to OpenAI Whisper...`)
    const response = await openai.audio.transcriptions.create({
      file,
      model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
      language: undefined, // Auto-detect
      response_format: 'verbose_json', // Get additional metadata
    })

    console.log(`[Transcription] Success! Transcribed ${response.text.length} characters`)

    return {
      text: response.text,
      language: response.language,
      duration: response.duration,
    }
  } catch (error) {
    console.error('[Transcription] Error:', error)
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
