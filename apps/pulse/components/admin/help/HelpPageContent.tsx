'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardPen,
  Compass,
  FileEdit,
  LifeBuoy,
  Mic,
  MonitorPlay,
  Play,
  QrCode,
  Settings,
  Tablet,
  Volume2,
} from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Section } from '@/components/ui/Section'

const DEMO_VIDEO_SRC = '/videos/demo-walkthrough.mp4'

const ONBOARDING_LINKS = [
  {
    title: 'Getting Started',
    description: 'Understand the workspace and the fastest path to launch.',
    href: '/help/getting-started',
    icon: Compass,
  },
  {
    title: 'Create Your First Survey',
    description: 'Add questions, choose a voice, and save your survey.',
    href: '/help/surveys/creating-a-survey',
    icon: ClipboardPen,
  },
  {
    title: 'Launch a Kiosk',
    description: 'Open the live survey experience on a tablet or display.',
    href: '/help/surveys/running-a-kiosk',
    icon: Tablet,
  },
  {
    title: 'Review Responses',
    description: 'Read transcripts, themes, sentiment, and useful next steps.',
    href: '/help/surveys/reviewing-responses-and-insights',
    icon: BarChart3,
  },
]

const DOC_GROUPS = [
  {
    title: 'Surveys',
    description: 'Build, launch, share, and improve voice surveys.',
    icon: Mic,
    links: [
      { title: 'Creating a Survey', href: '/help/surveys/creating-a-survey', icon: ClipboardPen },
      { title: 'Editing a Survey', href: '/help/surveys/editing-a-survey', icon: FileEdit },
      { title: 'Choosing Question Voice', href: '/help/surveys/question-voice', icon: Volume2 },
      { title: 'QR Codes', href: '/help/surveys/qr-codes', icon: QrCode },
      { title: 'Running a Kiosk', href: '/help/surveys/running-a-kiosk', icon: MonitorPlay },
      { title: 'Reviewing Responses and Insights', href: '/help/surveys/reviewing-responses-and-insights', icon: BarChart3 },
    ],
  },
  {
    title: 'Workspace',
    description: 'Set up the places, teams, and account details behind your surveys.',
    icon: Building2,
    links: [
      { title: 'Locations & Teams', href: '/help/workspace/locations-and-teams', icon: Building2 },
      { title: 'Account & Settings', href: '/help/workspace/account-and-settings', icon: Settings },
    ],
  },
  {
    title: 'Support',
    description: 'Resolve common setup, audio, QR, kiosk, and access issues.',
    icon: LifeBuoy,
    links: [
      { title: 'Troubleshooting', href: '/help/support/troubleshooting', icon: LifeBuoy },
    ],
  },
]

export function HelpPageContent() {
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')
  const accountParam = accountSlug ? `?account=${accountSlug}` : ''
  const [isPlayingDemo, setIsPlayingDemo] = useState(false)

  return (
    <AdminLayout homePath={accountSlug ? `/app?account=${accountSlug}` : '/app'}>
      <PageHeader
        title="Help"
        subtitle="Start here, then dive into focused guides when you need them."
      />

      <Section
        title="Start Here"
        description="A short walkthrough and the most useful next steps for launching your first feedback flow."
      >
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
          <Card className="overflow-hidden" padding="none">
            <div className="p-3 sm:p-4">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                {!isPlayingDemo ? (
                  <button
                    type="button"
                    onClick={() => setIsPlayingDemo(true)}
                    className="group flex aspect-video w-full items-center justify-center p-6 transition-colors hover:bg-zinc-200/70 dark:hover:bg-zinc-700"
                    aria-label="Play walkthrough demo video"
                  >
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-zinc-300 bg-white/90 shadow-sm transition-transform group-hover:scale-105 dark:border-zinc-600 dark:bg-zinc-900/80">
                        <Play className="ml-0.5 h-6 w-6 fill-current text-zinc-700 dark:text-zinc-200" strokeWidth={1.8} />
                      </div>
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Watch the product walkthrough</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">5 minute onboarding video</p>
                    </div>
                  </button>
                ) : (
                  <video
                    className="aspect-video w-full bg-black"
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                  >
                    <source src={DEMO_VIDEO_SRC} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <Link
                  href={`/app/settings/profile${accountParam}`}
                  className="inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                >
                  Account Setup
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
                <Link
                  href={`/app/surveys/create${accountParam}`}
                  className="inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                >
                  Create Survey
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
                <a
                  href="/kiosk?eventId=retail-demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                >
                  Demo Kiosk
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
                </a>
              </div>
            </div>
          </Card>

          <Card
            padding="sm"
            className="self-start border-zinc-200 bg-white text-zinc-950 shadow-md shadow-zinc-950/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:shadow-zinc-950/10 dark:ring-zinc-700/70"
          >
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Onboarding path</p>
              <h3 className="mt-1.5 text-base font-semibold text-zinc-950 dark:text-white">Launch with confidence</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                Follow these guides in order if you are setting up SignalThread for the first time.
              </p>
            </div>
            <div className="space-y-1.5">
              {ONBOARDING_LINKS.map((item, index) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-start gap-2.5 rounded-lg border border-zinc-200/90 bg-zinc-50/60 p-2.5 transition-colors duration-200 hover:border-zinc-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-white/15 dark:hover:bg-white/[0.055]"
                  >
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-blue-50/80 text-blue-600 transition-colors duration-200 group-hover:bg-blue-100 group-hover:text-blue-700 dark:border-white/10 dark:bg-blue-950/30 dark:text-blue-400 dark:group-hover:bg-blue-900/40 dark:group-hover:text-blue-300">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">Step {index + 1}</span>
                      <span className="mt-0.5 block text-sm font-semibold text-zinc-950 dark:text-white">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-500">{item.description}</span>
                    </span>
                    <span className="mt-0.5 text-zinc-400 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-zinc-600 dark:group-hover:text-blue-300">
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </span>
                  </Link>
                )
              })}
            </div>
          </Card>
        </div>
      </Section>

      <Section
        title="Documentation"
        description="Focused guides organized by the work you are trying to complete."
        className="mt-12"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {DOC_GROUPS.map((group) => {
            const GroupIcon = group.icon
            return (
              <div
                key={group.title}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-colors duration-200 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-700/80" />
                <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-blue-50/80 text-blue-600 transition-colors duration-200 dark:border-zinc-800 dark:bg-blue-950/30 dark:text-blue-400">
                      <GroupIcon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{group.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{group.description}</p>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {group.links.map((doc) => {
                    const DocIcon = doc.icon
                    return (
                      <Link
                        key={doc.href}
                        href={doc.href}
                        className="group flex items-center justify-between gap-4 px-5 py-3.5 text-sm font-medium text-zinc-800 transition-colors duration-200 hover:bg-zinc-50/90 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/70 dark:hover:text-white"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-blue-50/70 text-blue-600 transition-colors duration-200 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-blue-950/25 dark:text-blue-400 dark:group-hover:bg-blue-900/35 dark:group-hover:text-blue-300">
                            <DocIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </span>
                          <span>{doc.title}</span>
                        </span>
                        <span className="text-zinc-400 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-300">
                          <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </AdminLayout>
  )
}
export function HelpPageFallback() {
  return (
    <AdminLayout homePath="/app">
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    </AdminLayout>
  )
}
