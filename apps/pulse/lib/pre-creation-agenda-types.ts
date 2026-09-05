export interface PreCreationAgendaSpeaker {
  name: string
  email?: string | null
  organization?: string | null
  title?: string | null
}

export interface PreCreationAgendaNormalizedRow {
  title: string
  startsAt: string | null
  endsAt: string | null
  timezone: string | null
  externalId?: string | null
  description?: string | null
  room?: string | null
  track?: string | null
  format?: string | null
  capacity?: number | null
  tags: string[]
  speakers: PreCreationAgendaSpeaker[]
}

export interface PreCreationAgendaReviewRow {
  id: string
  sourceRowNumber: number
  sourceValues: Record<string, string>
  normalized: PreCreationAgendaNormalizedRow | null
  issues: Array<{ code: string; field?: string | null; message: string; severity: 'ERROR' | 'WARNING' }>
  status: 'READY' | 'NEEDS_REVIEW' | 'INVALID'
}

export interface PreCreationAgendaDraft {
  sourceFileName: string
  inspection: {
    schemaVersion: 1
    fileType: 'CSV' | 'XLSX'
    checksumSha256: string
    worksheets: Array<{ name: string; index: number; columns: string[]; rowCount: number; rows: Array<{ sourceRowNumber: number; values: Record<string, string> }> }>
  }
  worksheetName: string
  mapping: Record<string, string | null | undefined> & { title: string }
  rows: PreCreationAgendaReviewRow[]
}

export interface ReviewedInitialAgenda {
  sourceFileName: string
  rows: Array<{ sourceRowNumber: number; normalized: PreCreationAgendaNormalizedRow }>
}

export function countPreCreationAgendaRows(rows: PreCreationAgendaReviewRow[]) {
  const ready = rows.filter((row) => row.status === 'READY').length
  const needsReview = rows.filter((row) => row.status === 'NEEDS_REVIEW').length
  const invalid = rows.filter((row) => row.status === 'INVALID').length
  const speakerKeys = new Set(rows.flatMap((row) => row.normalized?.speakers.map((speaker) =>
    speaker.email?.toLocaleLowerCase('en-US') || speaker.name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim(),
  ) ?? []))
  return { sessions: rows.length, speakers: speakerKeys.size, ready, needsReview, invalid }
}
