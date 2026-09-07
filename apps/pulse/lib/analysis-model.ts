/** Canonical model resolution for answer analysis and its Events enrichment. */
export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL?.trim() || 'gpt-5.6-sol'
export const REVIEW_SYNOPSIS_MODEL = process.env.REVIEW_SYNOPSIS_MODEL?.trim() || ANALYSIS_MODEL
export const EVENT_INTELLIGENCE_MODEL = process.env.EVENT_INTELLIGENCE_MODEL?.trim() || ANALYSIS_MODEL
