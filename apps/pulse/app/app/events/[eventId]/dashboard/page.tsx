'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { KPICard } from '@/components/admin/dashboard/KPICard'
import { InsightCard } from '@/components/admin/dashboard/InsightCard'
import { Button } from '@/components/ui/Button'
import { SurveyQrCard } from '@/components/ui/SurveyQrCard'
import { Suspense } from 'react'
import type { AnalyticsSignals, KeyInsightsSignalsPayload } from '@/lib/analytics/signals'
import { CloudBubbles } from '@/components/admin/dashboard/CloudBubbles'
import { Dashboard2, type EventIntelligenceData } from '@/components/admin/Dashboard2'
import { EventSessionsIntelligence } from '@/components/events/EventSessionsIntelligence'
import { EventSpeakersIntelligence } from '@/components/events/EventSpeakersIntelligence'
import { EventActionsWorkspace } from '@/components/events/EventActionsWorkspace'
import { EventPreEventSignals } from '@/components/events/EventPreEventSignals'
import { EventPostEventClosingBrief } from '@/components/events/EventPostEventClosingBrief'
import { EventRawResponsesWorkspace } from '@/components/events/EventRawResponsesWorkspace'
import type { EventClosingBrief } from '@/lib/event-closing-brief'
import { getEventDisplayStatusForPhase, type EventLifecyclePhase } from '@/lib/events-home-groups'
import {
  DEV_LIFECYCLE_QUERY_PARAM,
  getAdvancedDemoLifecycleMode,
  parseAdvancedDemoLifecycleOverride,
  resolveAdvancedDemoLifecycleOverride,
} from '@/lib/advanced-events-demo-lifecycle'
import { dashboardHumanizeAction } from '@/lib/insights/dashboard-humanize'
import { isEventsAccount, isRetailAccount } from '@/lib/account-product-mode'
import { classifyKeyInsights } from '@/lib/insights/themes'
import { InsightDrilldownDrawer } from '@/components/admin/dashboard/InsightDrilldownDrawer'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { EventWorkspaceShell } from '@/components/app/events'
import { loadAccountContext, type AccountContext } from '@/lib/account-context-client'
import { loadDashboardJson } from '@/lib/dashboard-request'
import {
  applyEventDashboardSelectionToUrl,
  eventDashboardSelectionScopeKey,
  eventDashboardSelectionStructureScope,
  eventDashboardSelectionSurveyId,
  hydrateEventDashboardSelection,
  serializeEventDashboardRequest,
  transitionEventDashboardSelection,
  type EventDashboardIntelligenceScope,
  type EventDashboardSelection,
  type EventDashboardStructureKind,
  type EventDashboardStructureScope,
} from '@/lib/event-dashboard-selection'

const USE_DASHBOARD2 = true

// Lightweight EVENTS command-center polling cadence (ms). Conservative so live
// attendee feedback stays current without hammering shared analytics endpoints.
const DASHBOARD_REFRESH_INTERVAL_MS = 90_000

// Clean vertical bar chart for daily response counts
function ResponseLineChart({ data, days }: { data: ResponseTimeline[]; days: number }) {
  if (data.length === 0) return null

  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 shadow-md dark:shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide mb-4 flex-shrink-0">Response Trend</h3>

      {/* Chart fills available space */}
      <div className="relative flex-1 w-full min-h-[160px] mb-3">
        <div className="h-full w-full flex items-end justify-between gap-1">
          {data.map((point, idx) => {
            const heightPercent = (point.count / maxCount) * 100
            const date = new Date(point.date)
            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div
                key={idx}
                className="flex-1 group relative flex items-end justify-center"
                style={{ height: '100%' }}
              >
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] px-3 py-1.5 rounded-md shadow-xl whitespace-nowrap z-20 pointer-events-none font-medium">
                  {label}: {point.count}
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 transition-all duration-200 cursor-pointer"
                  style={{
                    height: `${Math.max(heightPercent, 2)}%`,
                    minHeight: '4px'
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-500 flex-shrink-0 font-medium">
        <span>{new Date(data[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(data[data.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  )
}





// ============================================================
// SIGNALS GRID - Clean rebuild with single-purpose boxes
// ============================================================



// Alert Triangle Icon
const AlertTriangle = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

// Severity Indicator (1-3 dots)
const SeverityDots = ({ level, variant = 'friction' }: { level: 0 | 1 | 2 | 3; variant?: 'friction' | 'watch' }) => (
  <div className="flex gap-1">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className={`w-2 h-2 rounded-full ${i <= level
          ? variant === 'watch' ? 'bg-amber-500' : 'bg-red-500'
          : variant === 'watch' ? 'bg-amber-200 dark:bg-amber-800' : 'bg-red-200 dark:bg-red-800'
          }`}
      />
    ))}
  </div>
)

// Impact Indicator (●●● dots)
const ImpactDots = ({ level }: { level: 1 | 2 | 3 }) => (
  <div className="flex gap-0.5" title={`Impact: ${level === 3 ? 'High' : level === 2 ? 'Medium' : 'Low'}`}>
    {[1, 2, 3].map((i) => (
      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= level ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
    ))}
  </div>
)

interface SignalsGridProps {
  signals: AnalyticsSignals | null
  loading: boolean
  error: string | null
  topThemes?: { theme: string; count: number }[] | null
  timePeriod: number
  humanizeAction: (text: string) => string
  onViewMoreRecommendations?: () => void
}

function SignalsGrid({
  signals,
  loading,
  error,
  timePeriod,
  humanizeAction,
  onViewMoreRecommendations
}: SignalsGridProps) {
  // Loading state
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 animate-pulse h-32" />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-3">
        <p className="text-sm text-red-700 dark:text-red-400">Failed to load: {error}</p>
      </div>
    )
  }

  if (!signals) return null

  const { pulse, momentum, topFriction } = signals

  // ─────────────────────────────────────────────────────────────────
  // PULSE CONFIG: "How are we doing overall?"
  // ─────────────────────────────────────────────────────────────────
  const pulseLabels: Record<string, string> = {
    GREAT: 'Great',
    GOOD: 'OK',
    MIXED: 'Mixed',
    NEEDS_ATTENTION: 'Needs Attention'
  }

  const pulseColors: Record<string, { ring: string, text: string, bg: string, border: string }> = {
    GREAT: { ring: '#059669', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
    GOOD: { ring: '#16a34a', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800' },
    MIXED: { ring: '#d97706', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
    NEEDS_ATTENTION: { ring: '#dc2626', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
  }

  const pStyle = pulse.label ? pulseColors[pulse.label] : pulseColors.MIXED
  const pLabel = pulse.label ? pulseLabels[pulse.label] : 'Unknown'

  // Ring dimensions
  const ringSize = 72
  const strokeWidth = 8
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = pulse.score !== null ? (pulse.score / 100) * circumference : 0

  // ─────────────────────────────────────────────────────────────────
  // MOMENTUM CONFIG: "Which direction are we moving?"
  // ─────────────────────────────────────────────────────────────────
  const momentumColors: Record<string, { text: string, bg: string, border: string, spark: string }> = {
    IMPROVING: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', spark: '#10b981' },
    FLAT: { text: 'text-zinc-600 dark:text-zinc-300', bg: 'bg-zinc-50 dark:bg-zinc-900/50', border: 'border-zinc-200 dark:border-zinc-700', spark: '#71717a' },
    DECLINING: { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', spark: '#ef4444' },
  }

  const mStyle = momentum.label ? momentumColors[momentum.label] : momentumColors.FLAT
  const mLabel = momentum.label === 'FLAT' ? 'Stable' : momentum.label === 'IMPROVING' ? 'Upward Trend' : momentum.label === 'DECLINING' ? 'Downward Trend' : 'Unknown'

  // ─────────────────────────────────────────────────────────────────
  // FRICTION: "What is the biggest problem right now?"
  // Use backend-computed status and severity
  // status: 'none' | 'watch' | 'friction'
  // severity: 0 | 1 | 2 | 3
  // ─────────────────────────────────────────────────────────────────
  const hasRealFriction = topFriction.status === 'friction'
  const hasWatchItem = topFriction.status === 'watch'
  const severityLevel: 0 | 1 | 2 | 3 = topFriction.severity ?? 0

  // ─────────────────────────────────────────────────────────────────
  // OPPORTUNITIES: "What should I do next?"
  // Use backend-computed opportunities directly (no fallback)
  // ─────────────────────────────────────────────────────────────────
  const { biggestOpportunity } = signals

  // Synthesize Unified Opportunities
  const displayOpportunities: { type: 'Reinforce' | 'Monitor' | 'Improve'; title: string; explanation: string; priority: number }[] = []

  // 1. REINFORCE
  if (pulse.label === 'GREAT' || pulse.label === 'GOOD') {
    displayOpportunities.push({
      type: 'Reinforce',
      title: 'Reinforce Service Standards',
      explanation: 'Sentiment is consistently positive. Maintain current operations.',
      priority: 1
    })
  }

  // 2. MONITOR
  if (topFriction.status === 'watch' && topFriction.theme) {
    displayOpportunities.push({
      type: 'Monitor',
      title: `Monitor ${topFriction.theme}`,
      explanation: 'Topic is trending with high visibility.',
      priority: 2
    })
  }

  // 3. IMPROVE (Friction)
  if (topFriction.status === 'friction' && topFriction.theme) {
    displayOpportunities.push({
      type: 'Improve',
      title: `Improve ${topFriction.theme}`,
      explanation: `Recurring negative feedback regarding ${topFriction.theme.toLowerCase()}.`,
      priority: 0
    })
  }

  // 4. IMPROVE (Actions)
  const backendActions = biggestOpportunity.opportunities?.slice(0, 3) || []
  backendActions.forEach(action => {
    displayOpportunities.push({
      type: 'Improve',
      title: humanizeAction(action.text),
      explanation: 'Recommended action to boost sentiment.',
      priority: 3
    })
  })

  // Sort & Slice (Improve/Reinforce first)
  const finalOpportunities = displayOpportunities
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)

  if (finalOpportunities.length === 0) {
    finalOpportunities.push({ type: 'Monitor', title: 'Monitor Operations', explanation: 'No immediate actions required.', priority: 5 })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">

      {/* ═══════════════════════════════════════════════════════════════
          BOX 1: PULSE
          Question: "How are we doing overall?"
          Primary: Ring + Score | Secondary: Status label
          ═══════════════════════════════════════════════════════════════ */}
      <div className={`${pStyle.bg} ${pStyle.border} border rounded-lg p-5`}>
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pulse</div>

        {pulse.score !== null ? (
          <div>
            <div className="flex items-center gap-4 mb-4">
              {/* Ring */}
              <div className="relative flex-shrink-0" style={{ width: ringSize, height: ringSize }}>
                <svg className="transform -rotate-90" width={ringSize} height={ringSize}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-zinc-200 dark:stroke-zinc-700" />
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={pStyle.ring} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${pStyle.text}`}>{pulse.score}</span>
                </div>
              </div>

              {/* Status */}
              <div className="min-w-0">
                <div className={`text-lg font-bold ${pStyle.text}`}>{pLabel}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {pulse.delta !== null
                    ? <span className={pulse.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {pulse.delta >= 0 ? 'Above prior period' : 'Below prior period'}
                      </span>
                    : <span className="text-zinc-400">Establishing baseline</span>
                  }
                </div>
              </div>
            </div>

            {/* Components Breakdown with Qualitative Labels */}
            <div className="space-y-3 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
              {/* Sentiment Strength */}
              <div className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <div className="text-[10px] font-medium text-zinc-500">Sentiment</div>
                </div>
                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pulse.components.sentiment >= 40 ? 'bg-emerald-500' :
                      pulse.components.sentiment >= 25 ? 'bg-blue-500' : 'bg-amber-500'
                      }`}
                    style={{ width: `${(pulse.components.sentiment / 50) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right">
                  <span className={`text-[10px] font-medium ${pulse.components.sentiment >= 40 ? 'text-emerald-600 dark:text-emerald-400' :
                    pulse.components.sentiment >= 25 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                    {pulse.components.sentiment >= 40 ? 'Strong' :
                      pulse.components.sentiment >= 25 ? 'Healthy' : 'Needs Attn'}
                  </span>
                </div>
              </div>

              {/* Participation (Volume) */}
              <div className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <div className="text-[10px] font-medium text-zinc-500">Participation</div>
                </div>
                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pulse.components.volume >= 20 ? 'bg-emerald-500' :
                      pulse.components.volume >= 10 ? 'bg-blue-500' : 'bg-zinc-400'
                      }`}
                    style={{ width: `${(pulse.components.volume / 30) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right">
                  <span className={`text-[10px] font-medium ${pulse.components.volume >= 20 ? 'text-emerald-600 dark:text-emerald-400' :
                    pulse.components.volume >= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500'
                    }`}>
                    {pulse.components.volume >= 20 ? 'Strong' :
                      pulse.components.volume >= 10 ? 'Healthy' : 'Low'}
                  </span>
                </div>
              </div>

              {/* Topic Reach (Diversity) */}
              <div className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <div className="text-[10px] font-medium text-zinc-500">Topic Reach</div>
                </div>
                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pulse.components.diversity >= 12 ? 'bg-purple-500' :
                      pulse.components.diversity >= 5 ? 'bg-blue-500' : 'bg-zinc-400'
                      }`}
                    style={{ width: `${(pulse.components.diversity / 20) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right">
                  <span className={`text-[10px] font-medium ${pulse.components.diversity >= 12 ? 'text-purple-600 dark:text-purple-400' :
                    pulse.components.diversity >= 5 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500'
                    }`}>
                    {pulse.components.diversity >= 12 ? 'Broad' :
                      pulse.components.diversity >= 5 ? 'Healthy' : 'Limited'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Not enough data</div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BOX 2: MOMENTUM  
          Question: "Which direction are we moving?"
          Primary: Sparkline | Secondary: Direction label + Confidence
          ═══════════════════════════════════════════════════════════════ */}
      <div className={`${mStyle.bg} ${mStyle.border} border rounded-lg p-5`}>
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Momentum</div>

        {momentum.label !== null ? (
          <>
            {/* Primary: Velocity Metrics */}
            <div className="grid grid-cols-2 gap-3 mb-4" title="Momentum compares average sentiment in recent responses to an earlier window. Confidence reflects sample size in both periods.">
              <div className="bg-white/60 dark:bg-zinc-900/40 rounded p-2.5 border border-zinc-100 dark:border-zinc-800">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wide mb-0.5">Recent change</div>
                <div className={`text-sm font-semibold leading-snug ${(momentum.sentimentDeltaPoints ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {momentum.label === 'IMPROVING'
                    ? 'Sentiment trending up'
                    : momentum.label === 'DECLINING'
                      ? 'Sentiment trending down'
                      : 'Sentiment stable'}
                </div>
              </div>
              <div className="bg-white/60 dark:bg-zinc-900/40 rounded p-2.5 border border-zinc-100 dark:border-zinc-800">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wide mb-0.5">Trend</div>
                <div className={`text-lg font-bold ${mStyle.text}`}>
                  {mLabel}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex justify-between items-end">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {momentum.metadata.daysWithData}d history
              </div>

              {/* Confidence badge */}
              <div className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] text-zinc-500 font-medium">
                {momentum.confidenceLabel} Conf.
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Not enough data for reliable trend</div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BOX 3: FRICTION / WATCH
          Question: "What is the biggest problem right now?"
          status: 'friction' (red) | 'watch' (amber) | 'none' (gray)
          ═══════════════════════════════════════════════════════════════ */}
      <div className={`${hasRealFriction
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        : hasWatchItem
          ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
          : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-700'
        } border rounded-lg p-5`}>
        <div className="flex items-center gap-2 mb-3">
          {hasRealFriction ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : hasWatchItem ? (
            <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <div className="w-4 h-4" />
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${hasRealFriction ? 'text-red-500' : hasWatchItem ? 'text-slate-500' : 'text-zinc-400'
            }`}>{hasRealFriction ? 'Top Friction' : hasWatchItem ? 'Key Driver' : 'Top Friction'}</span>
        </div>

        {hasRealFriction ? (
          <>
            {/* Severity */}
            <div className="mb-2">
              <SeverityDots level={severityLevel as 1 | 2 | 3} variant="friction" />
            </div>

            {/* Theme name */}
            <div className="text-base font-bold text-red-700 dark:text-red-300 mb-1">
              {topFriction.theme}
            </div>

            {/* Mentions count */}
            <div className="text-xs text-red-600 dark:text-red-400">
              {topFriction.mentionCount} mentions · Priority Fix
            </div>
          </>
        ) : hasWatchItem ? (
          <>
            {/* Severity using blue/slate dots for watch items */}
            <div className="flex gap-1 mb-2">
              <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
              <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
              <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>

            {/* Theme name */}
            <div className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">
              {topFriction.theme}
            </div>

            {/* Reframe Subtext */}
            <div className="text-xs text-slate-600 dark:text-slate-400">
              High influence. Monitor for changes.
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            No friction detected.
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BOX 4: OPPORTUNITIES
          Question: "What should I do next?"
          Primary: Ranked list of top 3 actions
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Opportunities</div>
        </div>

        <div className="space-y-4">
          {finalOpportunities.map((op, idx) => {
            const badgeStyles = {
              Reinforce: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
              Monitor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              Improve: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            }

            return (
              <div key={idx} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeStyles[op.type]}`}>
                    {op.type}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {op.title}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                  {op.explanation}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* View more */}
    </div>
  )
}


interface EventAnalysis {
  eventId: string
  eventName: string
  eventStatus: string
  eventType: string
  accountType: string
  lifecyclePhase?: EventLifecyclePhase
  defaultLifecyclePhase?: EventLifecyclePhase
  postEventClosingBrief?: EventClosingBrief
  totalResponses: number
  completedResponses: number
  totalAnswers: number
  answersCaptured?: number
  answersAnalyzed?: number
  completedAnswers: number
  avgCompletedResponsesPerMonth?: number
  overallSummary: string | null
  overallSentiment: string | null
  avgSentimentScore: number | null
  topThemes: { theme: string; count: number }[] | null
  topActionItems: Array<{ text: string; priority: 'High' | 'Medium' | 'Low' }> | null
  lastComputedAt: string
}

interface EventVoiceSurveyOption {
  id: string
  name: string
  status: string
  collectionPhase: 'PRE' | 'DURING' | 'POST' | null
  responseCount: number
  target: {
    id: string
    name: string
    category: string
  }
  dashboardScope: {
    eventStructureItemIds: string[]
  }
}

type ApiSurveyTarget = {
  id?: unknown
  name?: unknown
  category?: unknown
} | null | undefined

type ApiEventVoiceSurveyOption = {
  id?: unknown
  name?: unknown
  status?: unknown
  collectionPhase?: unknown
  responseCount?: unknown
  target?: ApiSurveyTarget
  dashboardScope?: {
    eventStructureItemIds?: unknown
  } | null
} | null | undefined

const UNASSIGNED_SURVEY_TARGET = {
  id: 'unassigned',
  name: 'No target assigned',
  category: 'Unassigned',
} as const

function toEventVoiceSurveyOption(survey: ApiEventVoiceSurveyOption): EventVoiceSurveyOption | null {
  if (!survey) return null
  const id = typeof survey?.id === 'string' ? survey.id.trim() : ''
  if (!id) return null

  const target = survey.target
  const targetCategory = typeof target?.category === 'string' ? target.category.trim() : ''
  const targetName = typeof target?.name === 'string' ? target.name.trim() : ''
  const targetId = typeof target?.id === 'string' ? target.id.trim() : ''
  const eventStructureItemIds = Array.isArray(survey.dashboardScope?.eventStructureItemIds)
    ? survey.dashboardScope.eventStructureItemIds.filter((itemId): itemId is string => typeof itemId === 'string' && Boolean(itemId.trim()))
    : []

  return {
    id,
    name: typeof survey.name === 'string' && survey.name.trim() ? survey.name.trim() : 'Untitled survey',
    status: typeof survey.status === 'string' ? survey.status : 'DRAFT',
    collectionPhase: survey.collectionPhase === 'PRE' || survey.collectionPhase === 'DURING' || survey.collectionPhase === 'POST'
      ? survey.collectionPhase
      : null,
    responseCount: typeof survey.responseCount === 'number' && Number.isFinite(survey.responseCount) ? survey.responseCount : 0,
    // Advanced-event survey definitions are valid before they are assigned to a
    // collection target. Give those definitions a deliberate display target so
    // the Signals picker never receives the raw nullable API relation.
    target: targetCategory && targetName
      ? { id: targetId || 'assigned', name: targetName, category: targetCategory }
      : { ...UNASSIGNED_SURVEY_TARGET },
    dashboardScope: { eventStructureItemIds },
  }
}

function surveyOptionDetail(survey: EventVoiceSurveyOption | null | undefined) {
  const category = typeof survey?.target?.category === 'string' && survey.target.category.trim()
    ? survey.target.category.trim().toLowerCase()
    : UNASSIGNED_SURVEY_TARGET.category.toLowerCase()
  const name = typeof survey?.target?.name === 'string' && survey.target.name.trim()
    ? survey.target.name.trim()
    : UNASSIGNED_SURVEY_TARGET.name
  const responseCount = typeof survey?.responseCount === 'number' && Number.isFinite(survey.responseCount)
    ? survey.responseCount
    : 0
  return `${category} / ${name} / ${responseCount} responses`
}

function surveyOptionSearchText(survey: EventVoiceSurveyOption) {
  return [
    survey.name,
    survey.target?.category,
    survey.target?.name,
    surveyOptionDetail(survey),
  ].filter(Boolean).join(' ').toLocaleLowerCase()
}

const FILTER_DROPDOWN_MENU_CLASS = 'absolute left-0 top-full z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900'
const FILTER_DROPDOWN_OPTION_CLASS = 'flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-800/80'
const FILTER_DROPDOWN_SEARCH_CLASS = 'h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-[12px] text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'
const FILTER_DROPDOWN_TRIGGER_CLASS = 'flex h-10 w-full items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-white px-3 text-left text-[12px] font-semibold text-slate-700 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/20'

function FilterDropdownTrigger({
  id,
  label,
  value,
  expanded,
  onClick,
}: {
  id: string
  label: string
  value: string
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button type="button" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={id} onClick={onClick} className={FILTER_DROPDOWN_TRIGGER_CLASS}>
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <svg className="size-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
    </button>
  )
}

function FilterDropdownOptionContent({
  title,
  detail,
  selected,
  onSelect,
  disabled = false,
  role,
}: {
  title: string
  detail?: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  role?: 'option'
}) {
  return (
    <button
      role={role}
      aria-selected={role ? selected : undefined}
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`${FILTER_DROPDOWN_OPTION_CLASS} ${selected ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
    >
      <span className="truncate text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100">{title}</span>
      {detail && <span className="mt-0.5 truncate text-[11px] font-normal leading-4 text-zinc-500 dark:text-zinc-400">{detail}</span>}
    </button>
  )
}

function SurveyDropdownOption({
  survey,
  selectedSurveyId,
  onSelect,
  role,
}: {
  survey: EventVoiceSurveyOption | null | undefined
  selectedSurveyId: string | null
  onSelect: (surveyId: string) => void
  role?: 'option'
}) {
  if (!survey?.id) return null

  return <FilterDropdownOptionContent
    title={survey.name || 'Untitled survey'}
    detail={surveyOptionDetail(survey)}
    selected={survey.id === selectedSurveyId}
    onSelect={() => onSelect(survey.id)}
    role={role}
  />
}

function SurveyDropdownMenu({
  id,
  searchId,
  surveys,
  selectedSurveyId,
  searchQuery,
  onSearchQueryChange,
  onSelect,
  allSurveysDetail,
  role,
}: {
  id?: string
  searchId: string
  surveys: EventVoiceSurveyOption[]
  selectedSurveyId: string | null
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSelect: (surveyId: string | null) => void
  allSurveysDetail?: string
  role?: 'listbox'
}) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSurveys = normalizedQuery
    ? surveys.filter((survey) => surveyOptionSearchText(survey).includes(normalizedQuery))
    : surveys

  return (
    <div id={id} role={role} className={FILTER_DROPDOWN_MENU_CLASS}>
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="sr-only" htmlFor={searchId}>Search surveys</label>
        <input
          id={searchId}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search surveys"
          className={FILTER_DROPDOWN_SEARCH_CLASS}
        />
      </div>
      <FilterDropdownOptionContent
        title="All Surveys"
        detail={allSurveysDetail ?? 'Roll up every survey in this Event'}
        selected={!selectedSurveyId}
        onSelect={() => onSelect(null)}
        role={role ? 'option' : undefined}
      />
      {filteredSurveys.map((survey, index) => (
        <SurveyDropdownOption
          key={survey?.id ?? `invalid-${index}`}
          survey={survey}
          selectedSurveyId={selectedSurveyId}
          onSelect={onSelect}
          role={role ? 'option' : undefined}
        />
      ))}
      {surveys.length === 0 ? (
        <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">No surveys have been created for this Event yet.</div>
      ) : filteredSurveys.length === 0 ? (
        <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">No surveys match your search.</div>
      ) : null}
    </div>
  )
}

type StructureDropdownOption = {
  value: string
  title: string
  detail?: string
  section?: string
  disabled?: boolean
}

function StructureDropdownMenu({
  id,
  searchId,
  options,
  selectedValue,
  searchQuery,
  onSearchQueryChange,
  onSelect,
}: {
  id: string
  searchId: string
  options: StructureDropdownOption[]
  selectedValue: string
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSelect: (value: string) => void
}) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((option) => [option.title, option.detail, option.section].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery))
    : options
  let previousSection: string | undefined

  return (
    <div id={id} role="listbox" className={FILTER_DROPDOWN_MENU_CLASS}>
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="sr-only" htmlFor={searchId}>Search event areas and listening points</label>
        <input
          id={searchId}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search areas and targets"
          className={FILTER_DROPDOWN_SEARCH_CLASS}
        />
      </div>
      {filteredOptions.map((option) => {
        const section = option.section
        const renderSection = section && section !== previousSection
        previousSection = section
        return (
          <div key={option.value}>
            {renderSection && <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{section}</div>}
            <FilterDropdownOptionContent
              title={option.title}
              detail={option.detail}
              selected={option.value === selectedValue}
              onSelect={() => onSelect(option.value)}
              disabled={option.disabled}
              role="option"
            />
          </div>
        )
      })}
      {filteredOptions.length === 0 && <div className="px-3 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">No areas or targets match your search.</div>}
    </div>
  )
}

interface ResponseTimeline {
  date: string
  count: number
}

type TimePeriod = 30 | 60 | 90
type EventStructureItemKind = EventDashboardStructureKind

interface EventStructureItemOption {
  id: string
  kind: EventStructureItemKind
  name: string
  description: string | null
}

const STRUCTURE_KIND_OPTIONS: Array<{ value: EventStructureItemKind; label: string; groupLabel: string }> = [
  { value: 'EVENT', label: 'Event-wide', groupLabel: 'Event-wide' },
  { value: 'SESSION', label: 'Sessions', groupLabel: 'Sessions' },
  { value: 'AREA', label: 'Location', groupLabel: 'Locations' },
  { value: 'SPONSOR_ACTIVATION', label: 'Sponsor Activations', groupLabel: 'Sponsor Activations' },
  { value: 'CUSTOM_TOUCHPOINT', label: 'Custom Touchpoints', groupLabel: 'Custom Touchpoints' },
]

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const ChatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const TrendingDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
)

const MinusIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const BarChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
)

const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 14l2 2 4-4" />
  </svg>
)

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const TargetIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

interface PulseStyle {
  ring: string
  text: string
  accent: string
  accentDark: string
  iconBg: string
  iconBgDark: string
  iconText: string
}

function getPulseStyle(label: string | null): PulseStyle {
  const styles: Record<string, PulseStyle> = {
    GREAT: { ring: '#16a34a', text: 'text-green-700 dark:text-green-400', accent: 'border-l-emerald-500', accentDark: 'dark:border-l-emerald-600', iconBg: 'bg-emerald-50', iconBgDark: 'dark:bg-emerald-900/30', iconText: 'text-emerald-600 dark:text-emerald-400' },
    GOOD: { ring: '#22c55e', text: 'text-green-600 dark:text-green-400', accent: 'border-l-green-400', accentDark: 'dark:border-l-green-600', iconBg: 'bg-green-50', iconBgDark: 'dark:bg-green-900/30', iconText: 'text-green-600 dark:text-green-400' },
    MIXED: { ring: '#eab308', text: 'text-amber-700 dark:text-amber-400', accent: 'border-l-amber-400', accentDark: 'dark:border-l-amber-500', iconBg: 'bg-amber-50', iconBgDark: 'dark:bg-amber-900/30', iconText: 'text-amber-600 dark:text-amber-400' },
    NEEDS_ATTENTION: { ring: '#ef4444', text: 'text-red-700 dark:text-red-400', accent: 'border-l-red-400', accentDark: 'dark:border-l-red-500', iconBg: 'bg-red-50', iconBgDark: 'dark:bg-red-900/30', iconText: 'text-red-600 dark:text-red-400' },
  }
  return styles[label ?? ''] ?? styles.MIXED
}

function getPulseLabel(label: string | null): string {
  const map: Record<string, string> = { GREAT: 'Great', GOOD: 'Good', MIXED: 'Mixed', NEEDS_ATTENTION: 'Needs Attention' }
  return map[label ?? ''] ?? 'Unknown'
}

function getComponentQuality(value: number, max: number): { label: string; color: string } {
  const pct = value / max
  if (pct >= 0.8) return { label: 'Strong', color: 'text-green-600 dark:text-green-400' }
  if (pct >= 0.5) return { label: 'Healthy', color: 'text-blue-600 dark:text-blue-400' }
  if (pct >= 0.25) return { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Low', color: 'text-zinc-500' }
}

function getImpactStyles(impactScore: number) {
  const styles: Record<number, { label: string; barActive: string; barFaded: string; labelColor: string; cardBg: string; cardBorder: string }> = {
    3: { label: 'High Impact', barActive: 'bg-red-500 dark:bg-red-400', barFaded: 'bg-red-200 dark:bg-red-800', labelColor: 'text-red-600 dark:text-red-400', cardBg: 'bg-red-50/60 dark:bg-red-950/20', cardBorder: 'border-red-200 dark:border-red-800/50' },
    2: { label: 'Medium Impact', barActive: 'bg-amber-500 dark:bg-amber-400', barFaded: 'bg-amber-200 dark:bg-amber-800', labelColor: 'text-amber-600 dark:text-amber-400', cardBg: 'bg-amber-50/60 dark:bg-amber-950/20', cardBorder: 'border-amber-200 dark:border-amber-800/50' },
    1: { label: 'Low Impact', barActive: 'bg-zinc-400 dark:bg-zinc-500', barFaded: 'bg-zinc-200 dark:bg-zinc-700', labelColor: 'text-zinc-500 dark:text-zinc-400', cardBg: 'bg-zinc-50/60 dark:bg-zinc-900/20', cardBorder: 'border-zinc-200 dark:border-zinc-700' },
  }
  return styles[impactScore] ?? styles[2]
}

function ImpactBars({ score }: { score: number }) {
  const s = getImpactStyles(score)
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-[3px]">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`w-[3.5px] h-[14px] rounded-sm ${i <= score ? s.barActive : s.barFaded}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${s.labelColor}`}>{s.label}</span>
    </div>
  )
}

function getComponentBarColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.8) return 'bg-green-500'
  if (pct >= 0.5) return 'bg-blue-500'
  if (pct >= 0.25) return 'bg-amber-500'
  return 'bg-zinc-400'
}

interface IntelligenceFilterState {
  type: 'target' | 'question'
  surveyTargetId?: string
  questionId?: string
  label: string
}

type SignalsWorkspaceTab = 'intelligence' | 'raw-responses' | 'actions'
type IntelligenceScope = EventDashboardIntelligenceScope
type IntelligenceStrengthFilter = 'strong' | 'directional' | 'weak'

interface RetailSurveyDashboardProps {
  analysisData: EventAnalysis
  signalsData: AnalyticsSignals | null
  keyInsightsData: KeyInsightsSignalsPayload | null
  signalsLoading: boolean
  eventId: string
  humanizeAction: (text: string) => string
  insightKeyByThemeKey?: Record<string, string>
  accountSlug?: string | null
}

function RetailSurveyDashboard({
  analysisData,
  signalsData,
  keyInsightsData,
  signalsLoading,
  eventId,
  humanizeAction,
  insightKeyByThemeKey = {},
  accountSlug = null,
}: RetailSurveyDashboardProps) {
  const [drillInsightId, setDrillInsightId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openDrill = (themeKey: string) => {
    const id = insightKeyByThemeKey[themeKey]
    if (!id || !accountSlug) return
    setDrillInsightId(id)
    setDrawerOpen(true)
  }

  const closeDrill = () => {
    setDrawerOpen(false)
    setDrillInsightId(null)
  }

  const pulse = signalsData?.pulse
  const momentum = signalsData?.momentum
  const metadata = signalsData?.metadata
  const hasResponses = analysisData.completedResponses > 0 || analysisData.totalResponses > 0
  const noResponses = !hasResponses
  const insightsProcessing = hasResponses && !signalsLoading && !signalsData
  const pStyle = getPulseStyle(pulse?.label ?? null)
  const pLabel = getPulseLabel(pulse?.label ?? null)

  const ringSize = 128
  const strokeWidth = 10
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = pulse?.score != null ? (pulse.score / 100) * circumference : 0
  const trendDirection: 'up' | 'down' | 'neutral' =
    pulse?.label === 'GREAT' || pulse?.label === 'GOOD'
      ? 'up'
      : pulse?.label === 'NEEDS_ATTENTION'
        ? 'down'
        : 'neutral'

  const completionRate = analysisData.totalResponses > 0
    ? Math.round((analysisData.completedResponses / analysisData.totalResponses) * 100)
    : 0
  const analyzedCount = metadata?.answersAnalyzed ?? analysisData.answersAnalyzed ?? analysisData.completedAnswers
  const capturedCount = metadata?.answersCaptured ?? analysisData.answersCaptured ?? analysisData.totalAnswers
  const responsesPerMonth = analysisData.avgCompletedResponsesPerMonth ?? 0
  const themeBreakdown = keyInsightsData?.themeSentimentBreakdown ?? []
  const rawOpportunities = keyInsightsData?.biggestOpportunity?.opportunities ?? []
  const insights = classifyKeyInsights(themeBreakdown, rawOpportunities, humanizeAction)
  const workingThemes = insights.working
  const opportunityItems = insights.opportunities
  const sortedOpportunities = [...opportunityItems].sort((a, b) => {
    const rank: Record<string, number> = { High: 3, Medium: 2, Low: 1 }
    return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0)
  })
  const sentimentQ = pulse ? getComponentQuality(pulse.components.sentiment, 50) : null
  const volumeQ = pulse ? getComponentQuality(pulse.components.volume, 30) : null
  const diversityQ = pulse
    ? {
        label: pulse.components.diversity >= 12 ? 'Broad' : pulse.components.diversity >= 5 ? 'Healthy' : 'Limited',
        color: pulse.components.diversity >= 12 ? 'text-green-600 dark:text-green-400' : pulse.components.diversity >= 5 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500',
      }
    : null

  if (noResponses) {
    return (
      <div className="space-y-6">
        <div className="text-center py-10 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <BarChartIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No Data Yet</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Start collecting responses to see customer feedback insights.
          </p>
          <button
            onClick={() => window.open(`/kiosk?eventId=${eventId}`, '_blank', 'noopener,noreferrer')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Launch Kiosk
          </button>
        </div>
        <RetailSurveyShareCard eventId={eventId} surveyName={analysisData.eventName || 'Survey Kiosk'} />
      </div>
    )
  }

  if (signalsLoading && !signalsData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse h-40" />
        ))}
        <RetailSurveyShareCard eventId={eventId} surveyName={analysisData.eventName || 'Survey Kiosk'} />
      </div>
    )
  }

  if (insightsProcessing) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30">
              <ActivityIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Responses received — insights are processing</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {analysisData.completedResponses} completed response{analysisData.completedResponses === 1 ? '' : 's'} received. Analysis will appear here as soon as processing finishes.
              </p>
            </div>
          </div>
        </div>
        <RetailSurveyMetricsRow analysisData={analysisData} completionRate={completionRate} responsesPerMonth={responsesPerMonth} completedResponses={metadata?.completedResponses ?? analysisData.completedResponses} />
        <RetailSurveyShareCard eventId={eventId} surveyName={analysisData.eventName || 'Survey Kiosk'} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className={`border-l-[5px] ${pStyle.accent} ${pStyle.accentDark} p-6 sm:p-8`}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className={`w-7 h-7 rounded-lg ${pStyle.iconBg} ${pStyle.iconBgDark} flex items-center justify-center`}>
              <ActivityIcon className={`w-4 h-4 ${pStyle.iconText}`} />
            </div>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Overall Pulse</span>
          </div>

          {pulse?.score != null ? (
            <>
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className={`text-6xl font-extrabold tracking-tight ${pStyle.text}`}>{pulse.score}</span>
                    <span className={`text-2xl font-bold ${pStyle.text}`}>{pLabel}</span>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {pulse.delta != null ? (
                      <span className={pulse.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                        {pulse.delta >= 0 ? 'Above category average' : 'Below category average'}
                      </span>
                    ) : (
                      'Establishing baseline'
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon className="w-3.5 h-3.5" />
                      {metadata?.completedResponses ?? analysisData.completedResponses} completed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ChatIcon className="w-3.5 h-3.5" />
                      {analyzedCount} answers analyzed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ChatIcon className="w-3.5 h-3.5 opacity-70" />
                      {capturedCount} answers captured
                    </span>
                  </div>
                </div>

                <div className="relative flex-shrink-0 hidden sm:block" style={{ width: ringSize, height: ringSize }}>
                  <svg className="transform -rotate-90" width={ringSize} height={ringSize}>
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-zinc-100 dark:stroke-zinc-800" />
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={pStyle.ring} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {trendDirection === 'up' ? (
                      <TrendingUpIcon className={`w-10 h-10 ${pStyle.iconText}`} />
                    ) : trendDirection === 'down' ? (
                      <TrendingDownIcon className={`w-10 h-10 ${pStyle.iconText}`} />
                    ) : (
                      <MinusIcon className={`w-10 h-10 ${pStyle.iconText}`} />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <RetailComponentBar icon={<ChatIcon className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />} label="Sentiment" quality={sentimentQ} value={pulse.components.sentiment} max={50} />
                  <RetailComponentBar icon={<UsersIcon className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />} label="Participation" quality={volumeQ} value={pulse.components.volume} max={30} />
                  <RetailComponentBar icon={<StarIcon className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />} label="Topic Reach" quality={diversityQ} value={pulse.components.diversity} max={20} />
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">Not enough data to compute pulse score</div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-6">Key Insights</h2>

        {workingThemes.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">What&apos;s Working</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {workingThemes.slice(0, 6).map((theme) => {
                const clickable = Boolean(insightKeyByThemeKey[theme.key] && accountSlug)
                return (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => clickable && openDrill(theme.key)}
                    disabled={!clickable}
                    className={`text-left border border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-950/20 rounded-lg p-4 ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-green-400/40 dark:hover:ring-green-600/30 transition-shadow' : 'cursor-default'}`}
                  >
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{theme.displayName}</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {theme.positiveMentions} mention{theme.positiveMentions !== 1 ? 's' : ''} with positive sentiment
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {opportunityItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <TargetIcon className="w-5 h-5 text-orange-500" />
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Opportunities to Improve</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedOpportunities.slice(0, 6).map((opp) => {
                const impact = getImpactStyles(opp.impactScore)
                const urgencyBadge = opp.priority === 'High'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : opp.priority === 'Low'
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                const clickable = Boolean(insightKeyByThemeKey[opp.key] && accountSlug)
                return (
                  <button
                    key={opp.key}
                    type="button"
                    onClick={() => clickable && openDrill(opp.key)}
                    disabled={!clickable}
                    className={`text-left border rounded-lg p-4 ${impact.cardBg} ${impact.cardBorder} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-amber-400/40 dark:hover:ring-amber-600/30 transition-shadow' : 'cursor-default'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${urgencyBadge}`}>
                        {opp.priority === 'High' ? 'Urgent' : opp.priority}
                      </span>
                      <ImpactBars score={opp.impactScore} />
                    </div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{opp.text}</h4>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {workingThemes.length === 0 && opportunityItems.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4 text-center">
            Responses received — insights are processing.
          </p>
        )}
      </div>

      <RetailSurveyMetricsRow analysisData={analysisData} completionRate={completionRate} responsesPerMonth={responsesPerMonth} completedResponses={metadata?.completedResponses ?? analysisData.completedResponses} momentum={momentum} />
      <RetailSurveyShareCard eventId={eventId} surveyName={analysisData.eventName || 'Survey Kiosk'} />

      <InsightDrilldownDrawer open={drawerOpen} insightId={drillInsightId} accountSlug={accountSlug} onClose={closeDrill} />
    </div>
  )
}

function RetailComponentBar({
  icon,
  label,
  quality,
  value,
  max,
}: {
  icon: ReactNode
  label: string
  quality: { label: string; color: string } | null
  value: number
  max: number
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
          <span className={`text-sm font-bold ${quality?.color ?? 'text-zinc-500'}`}>{quality?.label ?? 'Unknown'}</span>
        </div>
        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${getComponentBarColor(value, max)}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

function RetailSurveyMetricsRow({
  analysisData,
  completionRate,
  responsesPerMonth,
  completedResponses,
  momentum,
}: {
  analysisData: EventAnalysis
  completionRate: number
  responsesPerMonth: number
  completedResponses: number
  momentum?: AnalyticsSignals['momentum']
}) {
  const pointDelta = momentum?.sentimentDeltaPoints ?? 0
  const hasEnoughData = momentum?.label != null
  const ArrowIcon = momentum?.label === 'IMPROVING' ? TrendingUpIcon : momentum?.label === 'DECLINING' ? TrendingDownIcon : MinusIcon
  const arrowBg = momentum?.label === 'IMPROVING' ? 'bg-green-50 dark:bg-green-900/30' : momentum?.label === 'DECLINING' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-zinc-100 dark:bg-zinc-800'
  const arrowColor = momentum?.label === 'IMPROVING' ? 'text-green-600 dark:text-green-400' : momentum?.label === 'DECLINING' ? 'text-red-500 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'
  const trendPhrase = momentum?.label === 'IMPROVING'
    ? 'Sentiment trending up'
    : momentum?.label === 'DECLINING'
      ? 'Sentiment trending down'
      : 'Sentiment stable vs prior period'
  const valueColor = pointDelta > 0 ? 'text-green-600 dark:text-green-400' : pointDelta < 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Momentum</span>
          <InfoTooltip placement="top" content="Momentum reflects how customer sentiment is trending over time by comparing recent survey periods against previous ones." />
        </div>
        {hasEnoughData ? (
          <>
            <div className="flex items-center gap-3 mt-3">
              <div className={`w-10 h-10 rounded-xl ${arrowBg} flex items-center justify-center flex-shrink-0`}>
                <ArrowIcon className={`w-5 h-5 ${arrowColor}`} />
              </div>
              <span className={`text-lg font-semibold ${valueColor}`}>{trendPhrase}</span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{momentum?.metadata.daysWithData ?? 0}d trend data</p>
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Trend</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {momentum?.label === 'FLAT' ? 'Stable' : momentum?.label === 'IMPROVING' ? 'Improving' : 'Declining'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Confidence</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{momentum?.confidenceLabel}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-3">Not enough data for reliable trend</p>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Monthly Average</span>
          <InfoTooltip placement="top" content="Monthly Average is the average number of completed survey responses received per month across the lifetime of this survey." />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <BarChartIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{responsesPerMonth}</span>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">completed responses per month</p>
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">This Period</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{completedResponses} completed</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Engagement</span>
          <InfoTooltip placement="top" content="Engagement is the percentage of started survey sessions that were completed." />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <ClipboardIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{completionRate}%</span>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">completion rate</p>
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Completed</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{analysisData.completedResponses} of {analysisData.totalResponses}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RetailSurveyShareCard({ eventId, surveyName }: { eventId: string; surveyName: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">Share This Survey</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Launch the survey kiosk in fullscreen mode or download a QR code for physical placement
          </p>
          <div className="mt-4">
            <button
              onClick={() => window.open(`/kiosk?eventId=${eventId}`, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Launch Kiosk
            </button>
          </div>
        </div>
        <div className="w-full max-w-sm">
          <SurveyQrCard surveyName={surveyName} path={`/kiosk?eventId=${eventId}`} fileName={`kiosk-qr-${eventId}.png`} />
        </div>
      </div>
    </div>
  )
}

function EventDashboardContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = params.eventId as string
  const accountSlug = searchParams.get('account')
  const rawSelectedSurveyId = searchParams.get('surveyId')?.trim() || null
  const rawSelectedEventStructureItemId = searchParams.get('eventStructureItemId')?.trim() || null
  const rawSelectedStructureKind = searchParams.get('structureKind')?.trim() || null
  const requestedSignalsTab = searchParams.get('tab')
  // Legacy session/speaker URLs remain valid, but now resolve inside Intelligence.
  const legacyIntelligenceScope: IntelligenceScope | null = requestedSignalsTab === 'sessions' ? 'sessions' : requestedSignalsTab === 'speakers' ? 'speakers' : null
  const signalsTab: SignalsWorkspaceTab = legacyIntelligenceScope
    ? 'intelligence'
    : requestedSignalsTab === 'raw-responses' || requestedSignalsTab === 'actions'
      ? requestedSignalsTab
      : 'intelligence'
  const requestedIntelligenceScope = searchParams.get('intelligenceScope')
  const intelligenceScope: IntelligenceScope = requestedIntelligenceScope === 'sessions' || requestedIntelligenceScope === 'speakers'
    ? requestedIntelligenceScope
    : legacyIntelligenceScope ?? 'event-areas'
  const intelligenceStrengthFilterRaw = searchParams.get('evidenceStrength')
  const intelligenceStrengthFilter: IntelligenceStrengthFilter | null = ['strong', 'directional', 'weak'].includes(intelligenceStrengthFilterRaw ?? '')
    ? intelligenceStrengthFilterRaw as IntelligenceStrengthFilter
    : null
  const rawSelectedCoverageTargetId = searchParams.get('surveyTargetId')?.trim() || null
  const rawSelectedCoverageQuestionId = rawSelectedCoverageTargetId ? null : searchParams.get('questionId')?.trim() || null
  const accountPath = accountSlug ? `/app?account=${accountSlug}` : '/app'
  const eventDetailPath = accountSlug ? `/app/events/${eventId}?account=${accountSlug}` : `/app/events/${eventId}`
  const [analysisData, setAnalysisData] = useState<EventAnalysis | null>(null)
  const [analysisScope, setAnalysisScope] = useState<'bootstrap' | 'full' | null>(null)
  const [analysisSelectionKey, setAnalysisSelectionKey] = useState<string | null>(null)
  const [accountContext, setAccountContext] = useState<AccountContext | null>(null)
  const [timelineData, setTimelineData] = useState<ResponseTimeline[]>([])
  const [signalsData, setSignalsData] = useState<AnalyticsSignals | null>(null)
  const [keyInsightsData, setKeyInsightsData] = useState<KeyInsightsSignalsPayload | null>(null)
  const [signalsLoading, setSignalsLoading] = useState(false)
  const [signalsError, setSignalsError] = useState<string | null>(null)
  const [intelligenceData, setIntelligenceData] = useState<EventIntelligenceData | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)
  const [insightKeyByThemeKey, setInsightKeyByThemeKey] = useState<Record<string, string>>({})
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllRecommendations, setShowAllRecommendations] = useState(false)
  const [surveys, setSurveys] = useState<EventVoiceSurveyOption[]>([])
  const [surveyOptionsLoaded, setSurveyOptionsLoaded] = useState(false)
  const [structureItems, setStructureItems] = useState<EventStructureItemOption[]>([])
  const [structureOptionsLoaded, setStructureOptionsLoaded] = useState(false)
  const [surveyDropdownOpen, setSurveyDropdownOpen] = useState(false)
  const [surveySearchQuery, setSurveySearchQuery] = useState('')
  const [structureDropdownOpen, setStructureDropdownOpen] = useState(false)
  const [structureSearchQuery, setStructureSearchQuery] = useState('')
  const surveyDropdownRef = useRef<HTMLDivElement>(null)
  const structureDropdownRef = useRef<HTMLDivElement>(null)
  const fetchDataRequestIdRef = useRef(0)
  const intelligenceRequestIdRef = useRef(0)
  const signalsRequestIdRef = useRef(0)
  const fetchDataAbortRef = useRef<AbortController | null>(null)
  const intelligenceAbortRef = useRef<AbortController | null>(null)
  const signalsAbortRef = useRef<AbortController | null>(null)
  const refreshInFlightRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const refreshDashboardRef = useRef<() => void>(() => {})
  const activeSignalsTabRef = useRef<HTMLAnchorElement>(null)
  const localDevHostname = mounted ? window.location.hostname : null
  const advancedDemoLifecycleMode = getAdvancedDemoLifecycleMode({
    eventId,
    accountSlug,
    hostname: localDevHostname,
  })
  const isAdvancedDemoLifecycleQa = advancedDemoLifecycleMode !== null
  const devLifecycleOverride = isAdvancedDemoLifecycleQa
    ? parseAdvancedDemoLifecycleOverride(searchParams.get(DEV_LIFECYCLE_QUERY_PARAM))
    : null
  const devLifecyclePhase = resolveAdvancedDemoLifecycleOverride({
    eventId,
    accountSlug,
    hostname: localDevHostname,
    value: searchParams.get(DEV_LIFECYCLE_QUERY_PARAM),
  })
  // Normal events always receive the canonical date-derived phase. Only the
  // explicitly allowlisted local and production demo events may override it.
  const effectiveLifecyclePhase = devLifecyclePhase ?? analysisData?.lifecyclePhase
  const effectiveDemoLifecycleValue = effectiveLifecyclePhase === 'PRE_EVENT'
    ? 'pre'
    : effectiveLifecyclePhase === 'POST_EVENT'
      ? 'post'
      : effectiveLifecyclePhase === 'IN_EVENT'
        ? 'during'
        : null
  const isPreEventLifecycleForSelection = effectiveLifecyclePhase === 'PRE_EVENT'
  const selectionMetadata = useMemo(() => ({
    surveys: surveys
      .filter((survey) => !isPreEventLifecycleForSelection || survey.collectionPhase === 'PRE')
      .map((survey) => ({
        id: survey.id,
        eventStructureItemIds: survey.dashboardScope.eventStructureItemIds,
      })),
    structureItems: structureItems.map((item) => ({ id: item.id, kind: item.kind })),
  }), [isPreEventLifecycleForSelection, structureItems, surveys])
  const lifecycleForSelection = effectiveLifecyclePhase === 'PRE_EVENT'
    ? 'pre-event'
    : effectiveLifecyclePhase === 'POST_EVENT'
      ? 'post-event'
      : 'in-event'
  const dashboardSelection = useMemo<EventDashboardSelection | null>(() => {
    if (!analysisData || !isEventsAccount(analysisData.accountType)) return null
    if (signalsTab === 'intelligence' && (!surveyOptionsLoaded || !structureOptionsLoaded)) {
      return null
    }
    return hydrateEventDashboardSelection({
      lifecycle: lifecycleForSelection,
      intelligenceScope,
      raw: {
        surveyId: rawSelectedSurveyId,
        eventStructureItemId: rawSelectedEventStructureItemId,
        structureKind: rawSelectedStructureKind,
        surveyTargetId: rawSelectedCoverageTargetId,
        questionId: rawSelectedCoverageQuestionId,
      },
      metadata: selectionMetadata,
    })
  }, [
    analysisData,
    lifecycleForSelection,
    intelligenceScope,
    rawSelectedCoverageQuestionId,
    rawSelectedCoverageTargetId,
    rawSelectedEventStructureItemId,
    rawSelectedStructureKind,
    rawSelectedSurveyId,
    selectionMetadata,
    signalsTab,
    structureOptionsLoaded,
    surveyOptionsLoaded,
  ])
  const selectedSurveyId = dashboardSelection
    ? eventDashboardSelectionSurveyId(dashboardSelection.dataScope)
    : rawSelectedSurveyId
  const selectedStructureScope = dashboardSelection
    ? eventDashboardSelectionStructureScope(dashboardSelection.dataScope)
    : null
  const selectedEventStructureItemId = selectedStructureScope?.type === 'structure-item'
    ? selectedStructureScope.eventStructureItemId
    : null
  const selectedStructureKind = selectedStructureScope?.type === 'structure-kind'
    ? selectedStructureScope.structureKind
    : null
  const selectedCoverageTargetId = dashboardSelection?.evidenceScope?.type === 'target'
    ? dashboardSelection.evidenceScope.surveyTargetId
    : null
  const selectedCoverageQuestionId = dashboardSelection?.evidenceScope?.type === 'question'
    ? dashboardSelection.evidenceScope.questionId
    : null
  const intelligenceFilter: IntelligenceFilterState | null = selectedCoverageTargetId
    ? {
        type: 'target',
        surveyTargetId: selectedCoverageTargetId,
        label: intelligenceData?.targetBreakdown.find((target) => target.surveyTargetId === selectedCoverageTargetId)?.name ?? 'Selected source',
      }
    : selectedCoverageQuestionId
      ? {
          type: 'question',
          questionId: selectedCoverageQuestionId,
          label: intelligenceData?.questionBreakdown.find((question) => question.questionId === selectedCoverageQuestionId)?.label ?? 'Selected question',
        }
      : null

  const selectedSurvey = selectedSurveyId
    ? surveys.find((survey) => survey.id === selectedSurveyId) ?? null
    : null
  const surveyScopeLabel = selectedSurvey ? selectedSurvey.name : 'All Surveys'
  const selectedStructureItem = selectedEventStructureItemId
    ? structureItems.find((item) => item.id === selectedEventStructureItemId) ?? null
    : null
  const selectedStructureKindOption = selectedStructureKind
    ? STRUCTURE_KIND_OPTIONS.find((option) => option.value === selectedStructureKind) ?? null
    : null
  const structureScopeValue = selectedStructureItem
    ? `item:${selectedStructureItem.id}`
    : selectedStructureKind
      ? `kind:${selectedStructureKind}`
      : 'all'
  const rawStructureScopeValue = rawSelectedEventStructureItemId
    ? `item:${rawSelectedEventStructureItemId}`
    : rawSelectedStructureKind
      ? `kind:${rawSelectedStructureKind}`
      : 'all'
  const structureScopeLabel = selectedStructureItem
    ? selectedStructureItem.name
    : selectedStructureKindOption
      ? `All ${selectedStructureKindOption.label}`
      : 'All Survey Focus'
  const dashboardScopeLabel = [
    surveyScopeLabel,
    structureScopeLabel === 'All Survey Focus' ? null : structureScopeLabel,
  ].filter(Boolean).join(' / ')
  const requestKeyForSelection = (selection: EventDashboardSelection) => (
    `${eventDashboardSelectionScopeKey(selection)}|days:${timePeriod}|tab:${signalsTab}`
  )
  const dashboardIntelligenceRequestKey = dashboardSelection
    ? `${requestKeyForSelection(dashboardSelection)}|evidence:${dashboardSelection.evidenceScope?.type === 'target'
        ? `target:${dashboardSelection.evidenceScope.surveyTargetId}`
        : dashboardSelection.evidenceScope?.type === 'question'
          ? `question:${dashboardSelection.evidenceScope.questionId}`
          : 'all'}`
    : null
  const buildDashboardPath = (selection: EventDashboardSelection) => {
    const query = applyEventDashboardSelectionToUrl(
      new URLSearchParams(searchParams.toString()),
      selection,
      {},
    )
    query.set('tab', signalsTab)
    if (selection.intelligenceScope !== 'sessions') query.delete('sessionId')
    if (selection.intelligenceScope !== 'speakers') query.delete('speakerId')
    const suffix = query.toString()
    return `/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : ''}`
  }

  const buildDashboardQueryPath = (updates: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString())
    // Old lifecycle deep links continue to render, but normal navigation
    // drops the obsolete override because dates are authoritative.
    query.delete('lifecycle')
    for (const [key, value] of Object.entries(updates)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    const suffix = query.toString()
    return `/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : ''}`
  }

  const signalsTabHref = (tab: SignalsWorkspaceTab) => {
    const query = new URLSearchParams(searchParams.toString())
    query.delete('lifecycle')
    query.set('tab', tab)
    if (tab !== 'intelligence') {
      query.delete('evidenceStrength')
      query.delete('surveyTargetId')
      query.delete('questionId')
      query.delete('intelligenceScope')
    }
    if (tab !== 'actions') {
      query.delete('actionView')
      query.delete('actionId')
    }
    const suffix = query.toString()
    return `/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : ''}`
  }

  const intelligenceHref = (scope: IntelligenceScope) => {
    if (!dashboardSelection) return buildDashboardQueryPath({ intelligenceScope: scope === 'event-areas' ? null : scope })
    return buildDashboardPath(transitionEventDashboardSelection(
      dashboardSelection,
      { type: 'set-intelligence-scope', intelligenceScope: scope },
      selectionMetadata,
    ))
  }

  useEffect(() => {
    if (requestedSignalsTab === 'intelligence' || requestedSignalsTab === 'raw-responses' || requestedSignalsTab === 'actions') return
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'intelligence')
    if (requestedSignalsTab === 'sessions') query.set('intelligenceScope', 'sessions')
    if (requestedSignalsTab === 'speakers') query.set('intelligenceScope', 'speakers')
    const suffix = query.toString()
    router.replace(`/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : ''}`)
  }, [eventId, requestedSignalsTab, router, searchParams])

  const updateCoverageFilter = (filter: IntelligenceFilterState | null) => {
    if (!dashboardSelection) return
    router.replace(buildDashboardPath(transitionEventDashboardSelection(
      dashboardSelection,
      {
        type: 'set-evidence-scope',
        evidenceScope: filter?.surveyTargetId
          ? { type: 'target', surveyTargetId: filter.surveyTargetId }
          : filter?.questionId
            ? { type: 'question', questionId: filter.questionId }
            : null,
      },
      selectionMetadata,
    )))
  }

  const handleSurveyScopeChange = (nextSurveyId: string | null) => {
    setSurveyDropdownOpen(false)
    setSurveySearchQuery('')
    if (!dashboardSelection) return
    router.replace(buildDashboardPath(transitionEventDashboardSelection(
      dashboardSelection,
      { type: 'select-survey', surveyId: nextSurveyId },
      selectionMetadata,
    )))
  }

  const toggleSurveyDropdown = () => {
    if (surveyDropdownOpen) setSurveySearchQuery('')
    setStructureDropdownOpen(false)
    setStructureSearchQuery('')
    setSurveyDropdownOpen(!surveyDropdownOpen)
  }

  const handleStructureScopeChange = (nextValue: string) => {
    setStructureDropdownOpen(false)
    setStructureSearchQuery('')
    if (!dashboardSelection) return
    let structure: EventDashboardStructureScope | null = null
    if (nextValue.startsWith('item:')) structure = { type: 'structure-item', eventStructureItemId: nextValue.slice(5) }
    if (nextValue.startsWith('kind:')) structure = { type: 'structure-kind', structureKind: nextValue.slice(5) as EventStructureItemKind }
    router.replace(buildDashboardPath(transitionEventDashboardSelection(
      dashboardSelection,
      { type: 'select-structure', structure },
      selectionMetadata,
    )))
  }

  const toggleStructureDropdown = () => {
    if (structureDropdownOpen) setStructureSearchQuery('')
    setSurveyDropdownOpen(false)
    setSurveySearchQuery('')
    setStructureDropdownOpen(!structureDropdownOpen)
  }

  const handleRawSurveyScopeChange = (nextSurveyId: string | null) => {
    router.replace(buildDashboardQueryPath({ surveyId: nextSurveyId, eventStructureItemId: null, structureKind: null }))
  }

  const handleRawStructureScopeChange = (nextValue: string) => {
    router.replace(buildDashboardQueryPath({
      eventStructureItemId: nextValue.startsWith('item:') ? nextValue.slice(5) : null,
      structureKind: nextValue.startsWith('kind:') ? nextValue.slice(5) : null,
    }))
  }

  const handleRawEvidenceScopeChange = (nextScope: IntelligenceScope) => {
    router.replace(buildDashboardQueryPath({
      intelligenceScope: nextScope === 'event-areas' ? null : nextScope,
      eventStructureItemId: null,
      structureKind: null,
    }))
  }

  const fetchData = async (options: {
    cacheBust?: number
    selection?: EventDashboardSelection | null
    preserveContent?: boolean
    bootstrap?: boolean
  } = {}) => {
    const { cacheBust, selection = null, preserveContent = false, bootstrap = false } = options
    const requestId = ++fetchDataRequestIdRef.current
    let requestFailed = false
    fetchDataAbortRef.current?.abort()
    const controller = new AbortController()
    fetchDataAbortRef.current = controller

    if (!accountSlug) {
      setError('No account specified')
      setLoading(false)
      return
    }

    if (!cacheBust && !preserveContent) setLoading(true)
    if (!preserveContent) setError(null)

    try {
      const bootstrapSelection: EventDashboardSelection = {
        lifecycle: 'in-event',
        intelligenceScope,
        dataScope: { type: 'all' },
        evidenceScope: null,
      }
      const requestSelection = selection ?? bootstrapSelection
      const isEventRequest = Boolean(selection) || bootstrap
      const needsFullDashboardMetrics = !bootstrap && signalsTab === 'intelligence'
      const analysisParams = isEventRequest
        ? serializeEventDashboardRequest({
            kind: 'analysis',
            accountSlug,
            selection: requestSelection,
            days: timePeriod,
            cacheBust,
            bootstrap,
          })
        : new URLSearchParams({ account: accountSlug, days: String(timePeriod) })
      const timelineParams = isEventRequest
        ? serializeEventDashboardRequest({
            kind: 'timeline',
            accountSlug,
            selection: requestSelection,
            days: timePeriod,
            cacheBust,
          })
        : new URLSearchParams(analysisParams)
      if (!isEventRequest && rawSelectedSurveyId) {
        analysisParams.set('surveyId', rawSelectedSurveyId)
        timelineParams.set('surveyId', rawSelectedSurveyId)
      }
      if (!isEventRequest && cacheBust) {
        analysisParams.set('cacheBust', String(cacheBust))
        timelineParams.set('cacheBust', String(cacheBust))
      }
      if (devLifecycleOverride) analysisParams.set(DEV_LIFECYCLE_QUERY_PARAM, devLifecycleOverride)
      const [analysisJson, timelineJson] = await Promise.all([
        loadDashboardJson<{ success: boolean; data: EventAnalysis; message?: string }>(
          `/api/app/events/${eventId}/analysis?${analysisParams.toString()}`,
          { signal: controller.signal },
        ),
        needsFullDashboardMetrics
          ? loadDashboardJson<{ success: boolean; data?: ResponseTimeline[] }>(
            `/api/app/events/${eventId}/timeline?${timelineParams.toString()}`,
            { signal: controller.signal },
          ).catch(() => null)
          : Promise.resolve(null),
      ])

      if (!analysisJson.success) {
        throw new Error(analysisJson.message || 'Failed to load event data')
      }

      const d = analysisJson.data as EventAnalysis
      if (requestId === fetchDataRequestIdRef.current) {
        setAnalysisData({
          ...d,
          answersCaptured: d.answersCaptured ?? d.totalAnswers,
          answersAnalyzed: d.answersAnalyzed ?? d.completedAnswers,
          avgCompletedResponsesPerMonth: d.avgCompletedResponsesPerMonth ?? 0,
        })
        setAnalysisScope(bootstrap ? 'bootstrap' : 'full')
        setAnalysisSelectionKey(bootstrap
          ? 'bootstrap'
          : selection
            ? requestKeyForSelection(selection)
            : `retail:${rawSelectedSurveyId ?? 'all'}|days:${timePeriod}|tab:${signalsTab}`)
      }

      // Timeline is optional - don't fail if it errors
      if (requestId === fetchDataRequestIdRef.current && timelineJson?.success && timelineJson.data) {
        setTimelineData(timelineJson.data)
      }
    } catch (err) {
      requestFailed = true
      if (requestId === fetchDataRequestIdRef.current && !cacheBust) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      if (fetchDataAbortRef.current === controller) fetchDataAbortRef.current = null
      if (requestId === fetchDataRequestIdRef.current && !bootstrap && !cacheBust && !preserveContent) setLoading(false)
      if (requestId === fetchDataRequestIdRef.current && bootstrap && requestFailed) setLoading(false)
    }
  }

  // Fetch normalized event intelligence separately so it does not block the base dashboard.
  const fetchIntelligence = async (selection: EventDashboardSelection, cacheBust?: number) => {
    if (!accountSlug) return
    const requestId = ++intelligenceRequestIdRef.current
    intelligenceAbortRef.current?.abort()
    const controller = new AbortController()
    intelligenceAbortRef.current = controller

    setIntelligenceLoading(true)
    setIntelligenceError(null)

    try {
      const params = serializeEventDashboardRequest({
        kind: 'intelligence',
        accountSlug,
        selection,
        days: timePeriod,
        cacheBust,
        intelligenceView: signalsTab === 'intelligence',
      })
      if (devLifecycleOverride) params.set(DEV_LIFECYCLE_QUERY_PARAM, devLifecycleOverride)

      const json = await loadDashboardJson<{ success: boolean; data?: EventIntelligenceData; error?: string; message?: string }>(
        `/api/app/events/${eventId}/intelligence?${params.toString()}`,
        { signal: controller.signal },
      )

      if (!json.success) {
        throw new Error(json.error || json.message || 'Failed to load event intelligence')
      }

      if (requestId === intelligenceRequestIdRef.current) setIntelligenceData(json.data ?? null)
    } catch (err) {
      if (requestId === intelligenceRequestIdRef.current) {
        setIntelligenceError(err instanceof Error ? err.message : 'Unknown error')
        // Background refresh failures never destroy the last usable read model.
        if (!cacheBust) setIntelligenceData(null)
      }
    } finally {
      if (intelligenceAbortRef.current === controller) intelligenceAbortRef.current = null
      if (requestId === intelligenceRequestIdRef.current) setIntelligenceLoading(false)
    }
  }

  // Fetch signals separately (doesn't block main data)
  const fetchSignals = async (selection: EventDashboardSelection | null, cacheBust?: number) => {
    if (!accountSlug) return
    const requestId = ++signalsRequestIdRef.current
    signalsAbortRef.current?.abort()
    const controller = new AbortController()
    signalsAbortRef.current = controller

    setSignalsLoading(true)
    setSignalsError(null)
    // Preserve current insights during a silent refresh (cacheBust) to avoid flicker.
    if (!cacheBust) setKeyInsightsData(null)

    try {
      const params = selection
        ? serializeEventDashboardRequest({
            kind: 'signals',
            accountSlug,
            selection,
            days: timePeriod,
            cacheBust,
          })
        : new URLSearchParams({ account: accountSlug, windowDays: String(timePeriod) })
      if (!selection && rawSelectedSurveyId) params.set('surveyId', rawSelectedSurveyId)
      if (!selection && cacheBust) params.set('cacheBust', String(cacheBust))
      const json = await loadDashboardJson<{
        success: boolean
        data: { signals: AnalyticsSignals; keyInsights?: KeyInsightsSignalsPayload; insightKeyByThemeKey?: Record<string, string> }
        message?: string
      }>(`/api/app/events/${eventId}/signals?${params.toString()}`, { signal: controller.signal })

      if (!json.success) {
        throw new Error(json.message || 'Failed to load signals')
      }

      if (requestId === signalsRequestIdRef.current) {
        setSignalsData(json.data.signals)
        setKeyInsightsData(json.data.keyInsights ?? null)
        setInsightKeyByThemeKey(json.data.insightKeyByThemeKey ?? {})
      }
    } catch (err) {
      if (requestId === signalsRequestIdRef.current) {
        setSignalsError(err instanceof Error ? err.message : 'Unknown error')
        if (!cacheBust) {
          setSignalsData(null)
          setKeyInsightsData(null)
        }
      }
    } finally {
      if (signalsAbortRef.current === controller) signalsAbortRef.current = null
      if (requestId === signalsRequestIdRef.current) setSignalsLoading(false)
    }
  }

  // Manual / polled refresh for the EVENTS command center only. Re-runs the
  // existing cacheBust-aware fetches with the current scope/filters so live
  // attendee feedback updates without a full page reload. Never runs for
  // retail accounts.
  const refreshDashboard = async () => {
    if (!accountSlug) return
    if (!analysisData || !isEventsAccount(analysisData.accountType)) return
    if (effectiveLifecyclePhase !== 'IN_EVENT') return
    if (!dashboardSelection) return
    if (!surveyOptionsLoaded || !structureOptionsLoaded) return
    if (refreshInFlightRef.current) return

    const cacheBust = Date.now()
    refreshInFlightRef.current = true
    setIsRefreshing(true)
    try {
      if (signalsTab === 'intelligence') {
        await Promise.all([
          fetchData({ cacheBust, selection: dashboardSelection, preserveContent: true }),
          fetchSignals(dashboardSelection, cacheBust),
          fetchIntelligence(dashboardSelection, cacheBust),
        ])
      } else {
        await fetchData({ cacheBust, selection: dashboardSelection, preserveContent: true })
      }
      setLastRefreshedAt(Date.now())
    } finally {
      refreshInFlightRef.current = false
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    refreshDashboardRef.current = refreshDashboard
  })

  // EVENTS-only lightweight polling. Guarded so it never starts for retail or
  // before scope options are loaded, and cleared on unmount / scope change.
  useEffect(() => {
    if (!analysisData || !isEventsAccount(analysisData.accountType)) return
    if (effectiveLifecyclePhase !== 'IN_EVENT') return
    if (!autoRefresh) return
    if (!surveyOptionsLoaded || !structureOptionsLoaded) return

    const intervalId = setInterval(() => {
      refreshDashboardRef.current()
    }, DASHBOARD_REFRESH_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [analysisData?.accountType, effectiveLifecyclePhase, autoRefresh, surveyOptionsLoaded, structureOptionsLoaded, eventId, accountSlug])

  useEffect(() => {
    fetchDataAbortRef.current?.abort()
    intelligenceAbortRef.current?.abort()
    signalsAbortRef.current?.abort()
    fetchDataRequestIdRef.current += 1
    intelligenceRequestIdRef.current += 1
    signalsRequestIdRef.current += 1
    setAnalysisData(null)
    setAnalysisScope(null)
    setAnalysisSelectionKey(null)
    setTimelineData([])
    setSurveys([])
    setSurveyOptionsLoaded(false)
    setStructureItems([])
    setStructureOptionsLoaded(false)
    setSignalsData(null)
    setKeyInsightsData(null)
    setSignalsLoading(false)
    setSignalsError(null)
    setIntelligenceData(null)
    setIntelligenceLoading(false)
    setIntelligenceError(null)
    setInsightKeyByThemeKey({})
    setLoading(true)
  }, [eventId, accountSlug])

  useEffect(() => {
    // Stop work owned by the previous tab before the new tab's effects start.
    intelligenceAbortRef.current?.abort()
    signalsAbortRef.current?.abort()
    intelligenceRequestIdRef.current += 1
    signalsRequestIdRef.current += 1
  }, [signalsTab])

  useEffect(() => {
    let cancelled = false
    setAccountContext(null)
    if (!accountSlug) return

    loadAccountContext(accountSlug)
      .then((account) => {
        if (!cancelled) setAccountContext(account)
      })
      .catch(() => {
        // The analysis request remains authoritative for dashboard errors.
        // Account context only selects the correct product loading shell.
      })

    return () => {
      cancelled = true
    }
  }, [accountSlug])

  useEffect(() => {
    if (analysisData || analysisScope !== null) return
    void fetchData({ bootstrap: true })
  }, [eventId, accountSlug, analysisData, analysisScope])

  useEffect(() => {
    if (!analysisData || isEventsAccount(analysisData.accountType)) return
    const retailSelectionKey = `retail:${rawSelectedSurveyId ?? 'all'}|days:${timePeriod}|tab:${signalsTab}`
    if (analysisScope === 'full' && analysisSelectionKey === retailSelectionKey) return
    void fetchData({ preserveContent: analysisScope === 'full' })
  }, [analysisData?.accountType, analysisScope, analysisSelectionKey, eventId, accountSlug, rawSelectedSurveyId, timePeriod, signalsTab])

  // Canonical selection is the only URL state emitted after metadata hydration.
  useEffect(() => {
    if (!dashboardSelection) return
    const normalized = applyEventDashboardSelectionToUrl(
      new URLSearchParams(searchParams.toString()),
      dashboardSelection,
      {},
    )
    if (dashboardSelection.intelligenceScope !== 'sessions') normalized.delete('sessionId')
    if (dashboardSelection.intelligenceScope !== 'speakers') normalized.delete('speakerId')
    if (normalized.toString() === searchParams.toString()) return
    router.replace(`/app/events/${eventId}/dashboard?${normalized.toString()}`)
  }, [dashboardSelection, eventId, router, searchParams])

  useEffect(() => {
    if (!dashboardSelection || !analysisData || !isEventsAccount(analysisData.accountType)) return
    const selectionKey = requestKeyForSelection(dashboardSelection)
    if (analysisScope === 'full' && analysisSelectionKey === selectionKey) return
    void fetchData({
      selection: dashboardSelection,
      preserveContent: analysisScope === 'full',
    })
  }, [dashboardSelection, analysisData?.accountType, analysisScope, analysisSelectionKey, eventId, accountSlug, timePeriod, signalsTab])

  useEffect(() => {
    if (!analysisData) return
    if (!isEventsAccount(analysisData.accountType)) {
      setIntelligenceData(null)
      setIntelligenceLoading(false)
      setIntelligenceError(null)
      setInsightKeyByThemeKey({})
      fetchSignals(null)
      return
    }
    if (signalsTab !== 'intelligence') {
      setSignalsData(null)
      setKeyInsightsData(null)
      setSignalsLoading(false)
      setSignalsError(null)
      return
    }
    if (!dashboardSelection) return
    if (analysisSelectionKey !== requestKeyForSelection(dashboardSelection)) return
    fetchIntelligence(dashboardSelection)
    if (dashboardSelection.lifecycle !== 'in-event') {
      setSignalsData(null)
      setKeyInsightsData(null)
      setSignalsLoading(false)
      setSignalsError(null)
      return
    }
    fetchSignals(dashboardSelection)
  }, [eventId, accountSlug, dashboardIntelligenceRequestKey, analysisSelectionKey, analysisData?.accountType, devLifecycleOverride])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (loading) return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    activeSignalsTabRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
  }, [loading, signalsTab])

  // Close compact filter dropdowns on click outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (surveyDropdownRef.current && !surveyDropdownRef.current.contains(target)) {
        setSurveyDropdownOpen(false)
      }
      if (structureDropdownRef.current && !structureDropdownRef.current.contains(target)) setStructureDropdownOpen(false)
    }
    if (surveyDropdownOpen || structureDropdownOpen) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [surveyDropdownOpen, structureDropdownOpen])

  // Fetch survey list for the Event scope selector.
  useEffect(() => {
    if (!analysisData) {
      setSurveyOptionsLoaded(false)
      return
    }

    if (signalsTab !== 'intelligence') {
      setSurveys([])
      setSurveyOptionsLoaded(true)
      return
    }

    if (!isEventsAccount(analysisData.accountType)) {
      setSurveys([])
      setSurveyOptionsLoaded(true)
      return
    }

    if (!accountSlug) {
      setSurveyOptionsLoaded(true)
      return
    }

    let cancelled = false
    setSurveyOptionsLoaded(false)

    fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const rawSurveys: ApiEventVoiceSurveyOption[] = json.success && Array.isArray(json.data?.surveys)
          ? json.data.surveys
          : []
        const nextSurveys = rawSurveys
          .map((survey) => toEventVoiceSurveyOption(survey))
          .filter((survey): survey is EventVoiceSurveyOption => survey !== null)
        setSurveys(nextSurveys)
        setSurveyOptionsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setSurveys([])
          setSurveyOptionsLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [accountSlug, eventId, analysisData?.accountType, signalsTab])

  // Fetch Survey Focus items for the dashboard selector.
  useEffect(() => {
    if (!analysisData) {
      setStructureOptionsLoaded(false)
      return
    }

    if (signalsTab !== 'intelligence') {
      setStructureItems([])
      setStructureOptionsLoaded(true)
      return
    }

    if (!isEventsAccount(analysisData.accountType)) {
      setStructureItems([])
      setStructureOptionsLoaded(true)
      return
    }

    if (!accountSlug) {
      setStructureOptionsLoaded(true)
      return
    }

    let cancelled = false
    setStructureOptionsLoaded(false)

    fetch(`/api/app/events/${eventId}/structure?account=${accountSlug}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const nextItems = json.success && Array.isArray(json.data?.items)
          ? json.data.items.map((item: EventStructureItemOption) => ({
              id: item.id,
              kind: item.kind,
              name: item.name,
              description: item.description,
            }))
          : []
        setStructureItems(nextItems)
        setStructureOptionsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setStructureItems([])
          setStructureOptionsLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [accountSlug, eventId, analysisData?.accountType, signalsTab])

  if (loading) {
    if (signalsTab !== 'intelligence' || (accountContext && isEventsAccount(accountContext.accountType))) {
      return (
        <EventWorkspaceShell
          accountSlug={accountSlug ?? ''}
          eventId={eventId}
          activeSection="signals"
          loading
        >
          {null}
        </EventWorkspaceShell>
      )
    }

    return (
      <AdminLayout homePath={accountPath}>
        <div className="mb-3">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Loading…</p>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-zinc-400">Loading dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !analysisData) {
    if (accountContext && isEventsAccount(accountContext.accountType)) {
      return (
        <EventWorkspaceShell
          accountSlug={accountSlug ?? ''}
          eventId={eventId}
          activeSection="signals"
          error={error || 'Unable to load event data'}
          onRetry={() => fetchData(dashboardSelection ? { selection: dashboardSelection } : { bootstrap: true })}
        >
          {null}
        </EventWorkspaceShell>
      )
    }

    return (
      <AdminLayout homePath={accountPath}>
        <div className="mb-3">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Error</p>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="max-w-md">
            <div className="text-center">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">Error Loading Dashboard</h2>
              <p className="text-zinc-400 mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => fetchData(dashboardSelection ? { selection: dashboardSelection } : { bootstrap: true })}>Retry</Button>
                <Button variant="secondary" onClick={() => router.push('/app')}>
                  Back to Home
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const completionRate =
    analysisData.totalResponses > 0
      ? ((analysisData.completedResponses / analysisData.totalResponses) * 100).toFixed(0)
      : '0'

  // Detect retail account for conditional rendering
  // Build account-scoped URLs
  // accountPath is already defined at the top of the component

  const humanizeAction = dashboardHumanizeAction
  const isEventsDashboard = isEventsAccount(analysisData.accountType)
  const isPreEventLifecycle = isEventsDashboard && effectiveLifecyclePhase === 'PRE_EVENT'
  const isPreEventIntelligence = isPreEventLifecycle && signalsTab === 'intelligence'
  const isPostEventLifecycle = isEventsDashboard && effectiveLifecyclePhase === 'POST_EVENT'
  const surveysForCurrentLifecycle = isPreEventLifecycle
    ? surveys.filter((survey) => survey.collectionPhase === 'PRE')
    : surveys
  const structureTriggerLabel = structureScopeValue === 'all'
    ? 'All Event Areas and listening points'
    : structureScopeLabel
  const structureDropdownOptions: StructureDropdownOption[] = [
    {
      value: 'all',
      title: 'All Event Areas and listening points',
      detail: 'Roll up every event area and listening point',
    },
    ...STRUCTURE_KIND_OPTIONS.map((option): StructureDropdownOption => ({
      value: `kind:${option.value}`,
      title: `All ${option.label}`,
      detail: `Every ${option.label.toLocaleLowerCase()} target`,
      section: 'Area types',
    })),
    ...STRUCTURE_KIND_OPTIONS.flatMap((group): StructureDropdownOption[] => {
      const items = structureItems.filter((item) => item.kind === group.value)
      return items.length > 0
        ? items.map((item): StructureDropdownOption => ({
            value: `item:${item.id}`,
            title: item.name,
            detail: item.description ?? group.groupLabel,
            section: group.groupLabel,
          }))
        : [{
            value: `empty:${group.value}`,
            title: `No ${group.groupLabel.toLocaleLowerCase()} yet`,
            detail: 'No targets available',
            section: group.groupLabel,
            disabled: true,
          }]
    }),
  ]
  const intelligencePending = intelligenceLoading
    || (signalsTab === 'intelligence' && !intelligenceData && !intelligenceError)
  const isRetailDashboard = isRetailAccount(analysisData.accountType)
  const backPath = isEventsDashboard ? eventDetailPath : accountPath

  const surveyFilterControl = (
    <div className="relative min-w-0" ref={surveyDropdownRef}>
      <FilterDropdownTrigger id="event-intelligence-survey-options" label="Survey" value={surveyScopeLabel} expanded={surveyDropdownOpen} onClick={toggleSurveyDropdown} />
      {surveyDropdownOpen && <SurveyDropdownMenu id="event-intelligence-survey-options" searchId="event-intelligence-survey-search" role="listbox" surveys={surveysForCurrentLifecycle} selectedSurveyId={selectedSurveyId} searchQuery={surveySearchQuery} onSearchQueryChange={setSurveySearchQuery} onSelect={handleSurveyScopeChange} allSurveysDetail={isPreEventLifecycle ? 'Roll up every PRE survey in this Event' : undefined} />}
    </div>
  )

  const structureFilterControl = (
    <div className="relative min-w-0" ref={structureDropdownRef}>
      <FilterDropdownTrigger id="event-intelligence-structure-options" label="Area" value={structureTriggerLabel} expanded={structureDropdownOpen} onClick={toggleStructureDropdown} />
      {structureDropdownOpen && <StructureDropdownMenu id="event-intelligence-structure-options" searchId="event-intelligence-structure-search" options={structureDropdownOptions} selectedValue={structureScopeValue} searchQuery={structureSearchQuery} onSearchQueryChange={setStructureSearchQuery} onSelect={handleStructureScopeChange} />}
    </div>
  )

  const intelligenceScopeControls = (
    <div data-testid="intelligence-scope-controls" className="event-intelligence-scope-controls min-w-0 overflow-visible rounded-[16px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="event-intelligence-scope-controls-grid">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="text-[12px] font-bold text-slate-600">Scope</span>
          <nav aria-label="Intelligence scope" className="grid w-full min-w-0 grid-cols-3 overflow-hidden rounded-[10px] border border-slate-200 bg-slate-50 sm:w-auto">
            {([['event-areas', 'Event Areas'], ['sessions', 'Sessions'], ['speakers', 'Speakers']] as const).map(([scope, label]) => <Link prefetch={false} key={scope} href={intelligenceHref(scope)} aria-current={intelligenceScope === scope ? 'page' : undefined} className={`min-w-0 truncate px-2.5 py-2.5 text-center text-[12px] font-bold transition-colors sm:px-4 ${intelligenceScope === scope ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{label}</Link>)}
          </nav>
        </div>
        <>
          {surveyFilterControl}
          {structureFilterControl}
        </>
      </div>
    </div>
  )

  const dashboardBody = (
    <>
      {isEventsDashboard ? (
        <div className="mb-5 space-y-5">
          <div data-testid={isPreEventIntelligence ? 'pre-event-intelligence-toolbar' : undefined} className={isPreEventIntelligence ? 'flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-[#e8ebf2]' : undefined}>
            <nav aria-label="Signals views" className={`flex gap-[26px] overflow-x-auto ${isPreEventIntelligence ? 'min-w-0 flex-1' : 'border-b border-[#e8ebf2]'}`}>
              {([
                ['intelligence', 'Intelligence'],
                ['raw-responses', 'Raw Responses'],
                ['actions', 'Actions'],
              ] as const).map(([tab, label]) => (
                <Link
                  key={tab}
                  ref={signalsTab === tab ? activeSignalsTabRef : undefined}
                  href={signalsTabHref(tab)}
                  prefetch={false}
                  aria-current={signalsTab === tab ? 'page' : undefined}
                  className={`shrink-0 border-b-2 px-0.5 pb-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${isPreEventIntelligence ? '-mb-px' : ''} ${
                    signalsTab === tab
                      ? 'border-[#0B1220] text-[#0B1220]'
                      : 'border-transparent text-slate-400 hover:text-[#0B1220]'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {isPreEventIntelligence && <div data-testid="pre-event-intelligence-survey-control" className="ml-auto w-full max-w-[20rem] sm:w-[20rem]">{surveyFilterControl}</div>}
          </div>
          {!isPreEventIntelligence && <div className={`flex flex-col gap-4 lg:flex-row lg:items-end ${signalsTab === 'intelligence' ? 'lg:justify-end' : 'lg:justify-between'}`}>
            {signalsTab !== 'intelligence' && <div className="min-w-0">
              <p className="max-w-2xl text-sm text-slate-500">
                {signalsTab === 'raw-responses'
                    ? 'Search and inspect the exact attendee evidence behind this event.'
                    : 'Assign, track, and resolve evidence-backed work from one canonical action record.'}
              </p>
            </div>}

            {!isPreEventIntelligence && signalsTab !== 'actions' && signalsTab !== 'raw-responses' && intelligenceScope !== 'sessions' && intelligenceScope !== 'event-areas' && intelligenceScope !== 'speakers' && <div data-testid="signals-overview-filter-bar" className="grid w-full min-w-0 max-w-[42rem] grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3 lg:ml-auto">
              <div className="relative min-w-0" ref={surveyDropdownRef}>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Survey</p>
                <button
                  type="button"
                  onClick={toggleSurveyDropdown}
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-950 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                >
                  <span className="min-w-0 truncate">
                    {surveyScopeLabel}
                  </span>
                  <svg className="h-5 w-5 shrink-0 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {surveyDropdownOpen && <SurveyDropdownMenu searchId="signals-overview-survey-search" surveys={surveys} selectedSurveyId={selectedSurveyId} searchQuery={surveySearchQuery} onSearchQueryChange={setSurveySearchQuery} onSelect={handleSurveyScopeChange} />}
              </div>

              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Event Area / listening point
                </label>
                {structureFilterControl}
              </div>
            </div>}
          </div>}
        </div>
      ) : (
        <div className="mb-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push(backPath)}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Back
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {mounted
                ? lastRefreshedAt
                  ? `Updated ${new Date(lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : `Updated ${new Date(analysisData.lastComputedAt).toLocaleDateString()} at ${new Date(analysisData.lastComputedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Updated ...'}
            </p>
            {isRetailDashboard && (
              <div className="flex gap-0.5 rounded border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                {([30, 60, 90] as TimePeriod[]).map((days) => (
                  <button
                    key={days}
                    onClick={() => setTimePeriod(days)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${timePeriod === days
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {USE_DASHBOARD2 && isEventsDashboard ? (
        signalsTab === 'intelligence' ? (
          <section className="mx-auto w-full max-w-[1176px] space-y-5">
                {!isPreEventIntelligence && intelligenceScopeControls}
                {isAdvancedDemoLifecycleQa && <div data-testid="advanced-demo-lifecycle-switcher" className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="mr-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-black tracking-[0.12em] text-amber-700">{advancedDemoLifecycleMode === 'production-demo' ? 'DEMO' : 'DEV'}</span>
                  {(advancedDemoLifecycleMode === 'production-demo'
                    ? ([['pre', 'Pre'], ['during', 'During'], ['post', 'Post']] as const)
                    : ([['pre', 'Pre'], ['during', 'During'], ['post', 'Post'], [null, 'Auto']] as const)
                  ).map(([value, label]) => {
                    const selected = value === null
                      ? !devLifecycleOverride
                      : devLifecycleOverride === value
                        || (advancedDemoLifecycleMode === 'production-demo' && !devLifecycleOverride && effectiveDemoLifecycleValue === value)
                    return <button key={label} type="button" aria-pressed={selected} onClick={() => router.replace(buildDashboardQueryPath({ [DEV_LIFECYCLE_QUERY_PARAM]: value }))} className={`rounded-md border px-2 py-1 transition-colors ${selected ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'}`}>{label}</button>
                  })}
                </div>}
                {isPreEventIntelligence ? <EventPreEventSignals surveyCount={surveysForCurrentLifecycle.filter((survey) => survey.responseCount > 0).length} analysis={analysisData} intelligence={intelligenceData} intelligenceLoading={intelligenceLoading} intelligenceError={intelligenceError} eventId={eventId} accountSlug={accountSlug ?? ''} /> : intelligenceScope === 'sessions' ? <EventSessionsIntelligence eventId={eventId} accountSlug={accountSlug ?? ''} /> : intelligenceScope === 'speakers' ? <EventSpeakersIntelligence eventId={eventId} accountSlug={accountSlug ?? ''} /> : isPostEventLifecycle && analysisData.postEventClosingBrief ? <EventPostEventClosingBrief brief={analysisData.postEventClosingBrief} /> : <Dashboard2
              analysisData={analysisData}
              signalsData={signalsData}
              keyInsightsData={keyInsightsData}
              signalsLoading={signalsLoading}
              intelligenceData={intelligenceData}
              intelligenceLoading={intelligencePending}
              intelligenceError={intelligenceError}
              eventId={eventId}
              dashboardSelection={dashboardSelection!}
              surveyScopeLabel={dashboardScopeLabel}
              surveyScopeMode={selectedSurveyId ? 'survey' : 'all'}
              timePeriod={timePeriod}
              humanizeAction={humanizeAction}
              insightKeyByThemeKey={insightKeyByThemeKey}
              accountSlug={accountSlug}
              view="overview"
              intelligenceStrengthFilter={intelligenceStrengthFilter}
              onIntelligenceStrengthFilterChange={(strength) => router.replace(buildDashboardQueryPath({ evidenceStrength: strength }))}
              activeIntelligenceFilter={intelligenceFilter}
              onFilterByTarget={(target) => updateCoverageFilter({ type: 'target', surveyTargetId: target.surveyTargetId, label: target.label })}
              onFilterByQuestion={(question) => updateCoverageFilter({ type: 'question', questionId: question.questionId, label: question.label })}
              onClearIntelligenceFilter={() => updateCoverageFilter(null)}
                />}
              </section>
        ) : signalsTab === 'raw-responses' ? (
          <EventRawResponsesWorkspace eventId={eventId} accountSlug={accountSlug ?? ''} surveyId={rawSelectedSurveyId} surveyOptions={surveys.map((survey) => ({ id: survey.id, name: survey.name }))} onSurveyChange={handleRawSurveyScopeChange} scope={intelligenceScope} onScopeChange={handleRawEvidenceScopeChange} eventStructureItemId={rawSelectedEventStructureItemId} structureKind={rawSelectedStructureKind} structureScopeValue={rawStructureScopeValue} onStructureScopeChange={handleRawStructureScopeChange} structureOptions={structureItems.map((item) => ({ id: item.id, kind: item.kind, name: item.name }))} />
        ) : signalsTab === 'actions' ? (
          <EventActionsWorkspace eventId={eventId} accountSlug={accountSlug ?? ''} isPostEvent={isPostEventLifecycle} />
        ) : null
      ) : (
        <RetailSurveyDashboard
          analysisData={analysisData}
          signalsData={signalsData}
          keyInsightsData={keyInsightsData}
          signalsLoading={signalsLoading}
          eventId={eventId}
          humanizeAction={humanizeAction}
          insightKeyByThemeKey={insightKeyByThemeKey}
          accountSlug={accountSlug}
        />
      )}
    </>
  )

  if (isEventsDashboard) {
    return (
      <EventWorkspaceShell
        accountSlug={accountSlug ?? ''}
        eventId={eventId}
        activeSection="signals"
        eventName={analysisData.eventName}
        eventStatus={getEventDisplayStatusForPhase(analysisData.defaultLifecyclePhase ?? 'PRE_EVENT')}
        headerActions={(
           isPreEventLifecycle || isPostEventLifecycle ? null : <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {mounted
                ? isRefreshing
                  ? 'Refreshing...'
                  : lastRefreshedAt
                    ? `Updated ${new Date(lastRefreshedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${new Date(lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : `Updated ${new Date(analysisData.lastComputedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${new Date(analysisData.lastComputedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Updated ...'}
            </span>
            <button
              type="button"
              onClick={() => { void refreshDashboard() }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                autoRefresh
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
              aria-pressed={autoRefresh}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
              {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
            </button>
          </>
        )}
      >
        {dashboardBody}
      </EventWorkspaceShell>
    )
  }

  return <AdminLayout homePath={accountPath}>{dashboardBody}</AdminLayout>
}

export default function EventDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500" aria-live="polite">
        Loading event workspace…
      </div>
    }>
      <EventDashboardContent />
    </Suspense>
  )
}
