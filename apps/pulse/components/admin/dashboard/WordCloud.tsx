'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import cloud from 'd3-cloud'

export interface WordCloudItem {
    text: string
    value: number
    sentiment: 'positive' | 'negative' | 'neutral'
}

interface WordCloudProps {
    data: WordCloudItem[]
    height?: number
    className?: string
}

export function WordCloud({ data, height = 300, className = '' }: WordCloudProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [svgContent, setSvgContent] = useState<JSX.Element | null>(null)

    // Debounce resize
    const [dimensions, setDimensions] = useState({ width: 0, height: height })

    useEffect(() => {
        if (!containerRef.current) return

        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: height
                })
            }
        }

        // Initial size
        updateDimensions()

        const observer = new ResizeObserver(entries => {
            // Wrap in requestAnimationFrame to avoid "ResizeObserver loop limit exceeded"
            window.requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) return
                updateDimensions()
            })
        })

        observer.observe(containerRef.current)

        return () => observer.disconnect()
    }, [height])

    useEffect(() => {
        if (dimensions.width === 0 || data.length === 0) return

        // Layout configuration
        // Sort to place largest words in center usually, but d3-cloud handles placement
        // Normalize font sizes
        const minVal = Math.min(...data.map(d => d.value))
        const maxVal = Math.max(...data.map(d => d.value))

        // Scale for font size: Log scale often works better for word clouds to dampen outliers
        const fontScale = d3.scaleLog()
            .domain([minVal, maxVal])
            .range([14, 42]) // Min 14px, Max 42px

        const layout = cloud()
            .size([dimensions.width, dimensions.height])
            .words(data.map(d => ({
                text: d.text,
                size: fontScale(d.value), // Initial target size
                original: d // Keep reference to full object
            })) as any[])
            .padding(8) // Space between words
            .rotate(() => 0) // Keep horizontal for better readability
            .font('Inter, sans-serif')
            .fontSize(d => (d as any).size)
            .on('end', (words) => {
                // Render the words once layout is computed
                const content = (
                    <g transform={`translate(${dimensions.width / 2},${dimensions.height / 2})`}>
                        {words.map((w: any, i) => {
                            const item = w.original as WordCloudItem

                            let fill = '#71717a' // zinc-500
                            if (item.sentiment === 'positive') fill = '#10b981' // emerald-500
                            if (item.sentiment === 'negative') fill = '#ef4444' // red-500

                            return (
                                <text
                                    key={i}
                                    style={{
                                        fontFamily: 'Inter, sans-serif',
                                        fill,
                                        cursor: 'default',
                                        transition: 'opacity 0.2s'
                                    }}
                                    textAnchor="middle"
                                    transform={`translate(${w.x},${w.y})rotate(${w.rotate})`}
                                    fontSize={w.size}
                                    className="hover:opacity-80"
                                >
                                    {w.text}
                                    <title>{`${item.text}: ${item.value} mentions`}</title>
                                </text>
                            )
                        })}
                    </g>
                )
                setSvgContent(content)
            })

        layout.start()

    }, [data, dimensions])

    return (
        <div ref={containerRef} className={`w-full overflow-hidden ${className}`} style={{ height }}>
            {dimensions.width > 0 && (
                <svg width={dimensions.width} height={dimensions.height} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
                    {svgContent}
                </svg>
            )}
        </div>
    )
}
