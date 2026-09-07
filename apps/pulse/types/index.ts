import { Answer, AnswerStatus, Transcript, Analysis, ProcessingLog, ProcessingStep } from '@prisma/client'

// Re-export Prisma types
export type {
  Answer,
  AnswerStatus,
  Transcript,
  Analysis,
  ProcessingLog,
  ProcessingStep,
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PresignResponse {
  answerId: string
  uploadUrl: string
  objectKey: string
  expiresIn: number
}

export interface AnalysisInsights {
  summary: string
  sentiment: string | null
  sentimentScore: number | null
  evidenceState?: 'SUBSTANTIVE' | 'INSUFFICIENT_EVIDENCE'
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

export interface ConfirmUploadResponse {
  success: boolean
  answerId: string
  status: AnswerStatus
  message: string
  transcript?: string
  numericValue?: number
  canonicalLabel?: string
  analysis?: AnalysisInsights
}

// Extended answer type with relations
export interface AnswerWithRelations extends Answer {
  transcript?: Transcript | null
  analysis?: Analysis | null
  processingLogs?: ProcessingLog[]
}
