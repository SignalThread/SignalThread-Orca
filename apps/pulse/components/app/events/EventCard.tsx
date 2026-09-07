import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Event-only surface card. A soft rounded panel matching the product visual
 * language (rounded-xl, light slate border, subtle shadow). Use this for
 * Event page panels instead of the shared retail/SMB `components/ui/Card`,
 * so the Events redesign stays visually isolated.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
interface EventCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const PADDING_CLASSES = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const

export function EventCard({ children, className = '', padding = 'md', ...props }: EventCardProps) {
  return (
    <div
      className={`rounded-[18px] border border-[#e8ebf2] bg-white shadow-[0_1px_2px_rgba(11,22,56,0.04)] ${PADDING_CLASSES[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
