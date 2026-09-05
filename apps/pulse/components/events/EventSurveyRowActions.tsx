import { Copy, Download, ExternalLink, Palette, Printer, QrCode } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

interface EventSurveyRowActionsProps {
  kioskPath: string
  openQr: () => void
  copyLink: () => Promise<void>
  downloadPng: () => Promise<void>
  copied: boolean
  disabled: boolean
  onDesign: () => void
  onPrint: () => void
}

const iconActionClassName = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/30 dark:hover:text-blue-300'

/** Shared icon-only action cluster for a deployable Survey asset row. */
export function EventSurveyRowActions({
  kioskPath,
  openQr,
  copyLink,
  downloadPng,
  copied,
  disabled,
  onDesign,
  onPrint,
}: EventSurveyRowActionsProps) {
  return (
    <div data-testid="survey-row-actions" className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
      <InfoTooltip content="Open kiosk" ariaLabel="Open kiosk" placement="top" href={kioskPath} external trigger={<ExternalLink className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
      <InfoTooltip content="View QR" ariaLabel="View QR" placement="top" onAction={openQr} disabled={disabled} trigger={<QrCode className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
      <InfoTooltip content="Copy link" ariaLabel="Copy link" placement="top" onAction={() => void copyLink()} disabled={disabled} trigger={copied ? <Copy className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
      <InfoTooltip content="Download PNG" ariaLabel="Download PNG" placement="top" onAction={() => void downloadPng()} disabled={disabled} trigger={<Download className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
      <InfoTooltip content="Design" ariaLabel="Design" placement="top" onAction={onDesign} trigger={<Palette className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
      <InfoTooltip content="Print" ariaLabel="Print" placement="top" onAction={onPrint} trigger={<Printer className="h-4 w-4" aria-hidden />} className={iconActionClassName} />
    </div>
  )
}
