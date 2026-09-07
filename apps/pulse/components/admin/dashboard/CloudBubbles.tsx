'use client'

import React from 'react'

export interface CloudBubbleItem {
    text: string
    value: number
    sentiment: 'positive' | 'negative' | 'neutral'
}

interface CloudBubblesProps {
    data: CloudBubbleItem[]
}

export function CloudBubbles({ data }: CloudBubblesProps) {
    if (data.length === 0) return null

    // Normalize mapping: count -> size tier
    const minVal = Math.min(...data.map(d => d.value))
    const maxVal = Math.max(...data.map(d => d.value))

    const getTier = (val: number): 'xs' | 'sm' | 'md' | 'lg' | 'xl' => {
        if (maxVal === minVal) return 'md'
        const pct = (val - minVal) / (maxVal - minVal)
        if (pct > 0.9) return 'xl'
        if (pct > 0.7) return 'lg'
        if (pct > 0.4) return 'md'
        if (pct > 0.2) return 'sm'
        return 'xs'
    }

    // Tiers map to Tailwind classes
    const tierClasses = {
        xs: 'p-2.5 text-[10px] font-medium min-w-[70px]',
        sm: 'p-3.5 text-xs font-medium min-w-[95px]',
        md: 'p-4 text-sm font-semibold min-w-[130px]',
        lg: 'p-5 text-base font-bold min-w-[170px] tracking-tight',
        xl: 'p-6 text-lg font-bold min-w-[210px] tracking-tight'
    }

    const getSentimentColor = (sentiment: string) => {
        // Only apply color for STRONG sentiment
        if (sentiment === 'positive') {
            return 'bg-emerald-50/90 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
        }
        if (sentiment === 'negative') {
            return 'bg-rose-50/90 text-rose-700 border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/50'
        }
        // Neutral baseline
        return 'bg-slate-50/80 text-slate-700 border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-200 dark:border-slate-700/50'
    }

    // Helper to title case text
    const toTitleCase = (str: string) => {
        return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }

    return (
        <div className="flex flex-wrap gap-3 md:gap-5 items-start justify-center p-4 md:p-6 max-w-3xl mx-auto">
            {data.map((item, idx) => {
                const tier = getTier(item.value)
                const sizeClass = tierClasses[tier]
                const colorClass = getSentimentColor(item.sentiment)

                return (
                    <div
                        key={idx}
                        className={`
              relative group flex items-center justify-center text-center
              shadow-md border backdrop-blur-sm ring-1 ring-white/20
              transition-all duration-200 ease-out
              hover:shadow-xl hover:scale-[1.03] hover:brightness-105 hover:z-10
              cursor-default select-none
              ${sizeClass} ${colorClass}
            `}
                        style={{
                            borderRadius: '63% 37% 54% 46% / 55% 48% 52% 45%',
                            aspectRatio: '5/3'
                        }}
                        title={`${item.text}: ${item.value} mentions`}
                    >
                        <span className="relative z-10 leading-snug px-1 line-clamp-2">
                            {toTitleCase(item.text)}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
