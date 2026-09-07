import React, { type CSSProperties } from 'react'
import { CanonicalQrSign } from '@/components/events/CanonicalQrSign'
import {
  paginateEventSignageItems,
  resolveEventSignagePageLayout,
  type CanonicalQrSignConfiguration,
  type EventSignageConfiguration,
} from '@/lib/event-signage'

export interface EventSignageSheetSign {
  id: string
  configuration: CanonicalQrSignConfiguration
}

export function EventSignageSheets({
  signs,
  configuration,
  mode,
}: {
  signs: readonly EventSignageSheetSign[]
  configuration: Pick<EventSignageConfiguration, 'orientation' | 'cardsPerPage'>
  mode: 'preview' | 'print'
}) {
  const layout = resolveEventSignagePageLayout(configuration)
  if (!layout.isScannerSafe) {
    return <p role="alert">This print layout would render the QR code below the scanner-safe minimum.</p>
  }

  const pages = paginateEventSignageItems(signs, layout.cardsPerPage)
  const signWidth = `${(layout.signWidthIn / layout.cellWidthIn) * 100}%`

  return <div
    data-testid="event-signage-sheets"
    data-render-mode={mode}
    style={{ display: 'grid', gap: mode === 'preview' ? '1rem' : 0, justifyItems: 'center', width: '100%' }}
  >
    {pages.map((pageSigns, pageIndex) => {
      const pageStyle: CSSProperties = {
        position: 'relative',
        boxSizing: 'border-box',
        width: mode === 'print' ? `${layout.pageWidthIn}in` : '100%',
        height: mode === 'print' ? `${layout.pageHeightIn}in` : undefined,
        aspectRatio: `${layout.pageWidthIn} / ${layout.pageHeightIn}`,
        maxWidth: '100%',
        flexShrink: 0,
        overflow: 'hidden',
        backgroundColor: '#fff',
        breakAfter: pageIndex === pages.length - 1 ? 'auto' : 'page',
        pageBreakAfter: pageIndex === pages.length - 1 ? 'auto' : 'always',
      }
      const sheetStyle: CSSProperties = {
        position: 'absolute',
        inset: 0,
      }

      return <section
        key={pageIndex}
        aria-label={`Signage sheet ${pageIndex + 1}`}
        data-testid="event-signage-page"
        data-page-index={pageIndex}
        data-sign-count={pageSigns.length}
        data-orientation={layout.orientation}
        data-paper-orientation={layout.paperOrientation}
        data-sign-aspect-ratio={layout.signAspectRatio.toFixed(6)}
        data-cards-per-page={layout.cardsPerPage}
        data-page-size={layout.pageSize}
        data-sign-width-in={layout.signWidthIn.toFixed(3)}
        data-sign-height-in={layout.signHeightIn.toFixed(3)}
        data-cell-width-in={layout.cellWidthIn.toFixed(3)}
        data-cell-height-in={layout.cellHeightIn.toFixed(3)}
        data-qr-size-in={layout.qrSizeIn.toFixed(3)}
        style={pageStyle}
        className={mode === 'preview' ? 'border border-[#d9dee8] shadow-sm' : undefined}
      >
        <div data-testid="event-signage-page-grid" style={sheetStyle}>
          {pageSigns.map((sign, signIndex) => {
            const column = signIndex % layout.columns
            const row = Math.floor(signIndex / layout.columns)
            const leftIn = layout.marginIn + (column * (layout.cellWidthIn + layout.gutterIn))
            const topIn = layout.marginIn + (row * (layout.cellHeightIn + layout.gutterIn))
            return <div
              key={sign.id}
              data-testid="event-signage-cell"
              data-row={row}
              data-column={column}
              style={{
                position: 'absolute',
                left: `${(leftIn / layout.pageWidthIn) * 100}%`,
                top: `${(topIn / layout.pageHeightIn) * 100}%`,
                width: `${(layout.cellWidthIn / layout.pageWidthIn) * 100}%`,
                height: `${(layout.cellHeightIn / layout.pageHeightIn) * 100}%`,
                display: 'grid',
                minWidth: 0,
                minHeight: 0,
                placeItems: 'center',
              }}
            >
            <div
              data-testid="event-signage-complete-sign"
              data-sign-orientation={layout.orientation}
              style={{ width: signWidth, aspectRatio: String(layout.signAspectRatio) }}
            >
              <CanonicalQrSign configuration={{ ...sign.configuration, orientation: layout.orientation }} />
            </div>
          </div>
          })}
        </div>
      </section>
    })}
  </div>
}
