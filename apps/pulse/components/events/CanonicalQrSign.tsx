'use client'

import React from 'react'
import { Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { CanonicalQrSignConfiguration } from '@/lib/event-signage'

export function CanonicalQrSign({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  if (configuration.orientation === 'landscape') {
    if (configuration.templateId === 'clean') return <CleanQrLandscapeComposition configuration={configuration} />
    if (configuration.templateId === 'bold_event') return <BoldEventLandscapeComposition configuration={configuration} />
    return <TabletopLandscapeComposition configuration={configuration} />
  }
  if (configuration.templateId === 'clean') return <CleanQrComposition configuration={configuration} />
  if (configuration.templateId === 'bold_event') return <BoldEventComposition configuration={configuration} />
  return <TabletopComposition configuration={configuration} />
}

function SurveyQr({ qrUrl }: { qrUrl: string }) {
  return <QRCodeSVG
    value={qrUrl}
    size={220}
    level="H"
    marginSize={4}
    bgColor="#FFFFFF"
    fgColor="#08111f"
    className="aspect-square h-auto w-full"
  />
}

function TabletopComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return (
    <article
      data-testid="canonical-qr-sign"
      data-template-id="tabletop"
      data-sign-orientation="portrait"
      data-qr-destination={qrUrl}
      className="relative aspect-[5/7] w-full overflow-hidden rounded-[2.2cqw] border border-slate-200 bg-[#f8fbff] shadow-[0_18px_38px_rgba(15,23,42,.20)]"
      style={{ containerType: 'inline-size' }}
    >
      <section className="relative flex min-h-[64cqw] flex-col items-center px-[9cqw] pb-[17cqw] pt-[5.5cqw] text-center text-white" style={{ backgroundColor: primaryColor }}>
        {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[36cqw] self-start brightness-0 invert" />}
        <h4 className="mt-[5cqw] max-w-[72cqw] text-[8.8cqw] font-bold leading-[1.04] tracking-[-0.035em]">{headline}</h4>
        {supportingText && <p className="mt-[3cqw] max-w-[64cqw] text-[3.45cqw] font-medium leading-[1.28] text-slate-100">{supportingText}</p>}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[-.2cqw] h-[23cqw] w-full" viewBox="0 0 100 28" preserveAspectRatio="none">
          <path d="M0 9C22 28 56 27 100 0V18H0Z" fill="#8ebbf3" />
          <path d="M0 15C29 34 65 26 100 8V28H0Z" fill="#f8fbff" />
        </svg>
      </section>
      <section className="relative z-10 -mt-[10cqw] flex flex-col items-center px-[10cqw] pb-[8cqw]">
        <div className="w-[43cqw] rounded-[3cqw] border border-slate-200 bg-white p-[2.8cqw] shadow-[0_7px_18px_rgba(15,35,68,.18)]"><SurveyQr qrUrl={qrUrl} /></div>
        {buttonLabel && <div className="mt-[4.2cqw] inline-flex min-h-[10cqw] w-[64cqw] max-w-full items-center justify-center gap-[2cqw] rounded-[2.2cqw] border border-blue-300 bg-white px-[4.2cqw] py-[2.2cqw] text-center text-[3.25cqw] font-bold leading-none text-[#102444] shadow-[0_2px_8px_rgba(37,99,235,.10)]"><Smartphone aria-hidden="true" className="h-[4.1cqw] w-[4.1cqw] shrink-0 text-[#2563eb]" /><span>{buttonLabel}</span></div>}
        {footerText && <p className="mt-[2.5cqw] text-[2.5cqw] font-medium text-slate-500">{footerText}</p>}
      </section>
    </article>
  )
}

function TabletopLandscapeComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return <article
    data-testid="canonical-qr-sign"
    data-template-id="tabletop"
    data-sign-orientation="landscape"
    data-qr-destination={qrUrl}
    className="relative aspect-[7/5] w-full overflow-hidden rounded-[1.6cqw] border border-slate-200 bg-[#f8fbff] shadow-[0_18px_38px_rgba(15,23,42,.20)]"
    style={{ containerType: 'inline-size' }}
  >
    <div className="grid h-full grid-cols-[56%_44%]">
      <section className="relative flex min-w-0 flex-col px-[5.5cqw] pb-[5cqw] pt-[4.2cqw] text-white" style={{ backgroundColor: primaryColor }}>
        {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[24cqw] brightness-0 invert" />}
        <div className="my-auto py-[2cqw]">
          <h4 className="max-w-[46cqw] text-[6.4cqw] font-bold leading-[1.02] tracking-[-0.04em]">{headline}</h4>
          {supportingText && <p className="mt-[2.2cqw] max-w-[42cqw] text-[2.45cqw] font-medium leading-[1.3] text-slate-100">{supportingText}</p>}
        </div>
        {footerText && <p className="text-[1.65cqw] font-medium text-white/70">{footerText}</p>}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-[-.2cqw] h-full w-[13cqw]" viewBox="0 0 28 100" preserveAspectRatio="none">
          <path d="M8 0C28 22 27 56 0 100H18V0Z" fill="#8ebbf3" />
          <path d="M15 0C34 29 26 65 8 100H28V0Z" fill="#f8fbff" />
        </svg>
      </section>
      <section className="relative z-10 flex min-w-0 flex-col items-center justify-center px-[5cqw] py-[4cqw] text-center">
        <div className="w-[31cqw] rounded-[2cqw] border border-slate-200 bg-white p-[2cqw] shadow-[0_7px_18px_rgba(15,35,68,.18)]"><SurveyQr qrUrl={qrUrl} /></div>
        {buttonLabel && <div className="mt-[2.7cqw] inline-flex min-h-[6.8cqw] w-[34cqw] max-w-full items-center justify-center gap-[1.3cqw] rounded-[1.5cqw] border border-blue-300 bg-white px-[2.4cqw] py-[1.5cqw] text-[2.05cqw] font-bold leading-none text-[#102444]"><Smartphone aria-hidden="true" className="h-[2.7cqw] w-[2.7cqw] shrink-0 text-[#2563eb]" /><span>{buttonLabel}</span></div>}
      </section>
    </div>
  </article>
}

function CleanQrComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return <article data-testid="canonical-qr-sign" data-template-id="clean" data-sign-orientation="portrait" data-qr-destination={qrUrl} className="relative aspect-[5/7] w-full overflow-hidden rounded-[2.2cqw] border border-slate-200 bg-white shadow-[0_18px_38px_rgba(15,23,42,.16)]" style={{ containerType: 'inline-size' }}>
    <section className="flex h-full flex-col items-center px-[9cqw] pb-[6cqw] pt-[7cqw] text-center">
      {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[30cqw] self-start" />}
      <div className="mt-[5cqw] h-[1.1cqw] w-[12cqw] self-start rounded-full" style={{ backgroundColor: primaryColor }} />
      <h4 className="mt-[5cqw] max-w-[80cqw] text-[9.2cqw] font-bold leading-[1.02] tracking-[-0.04em] text-[#0b172a]">{headline}</h4>
      {supportingText && <p className="mt-[3.2cqw] max-w-[72cqw] text-[3.5cqw] font-medium leading-[1.3] text-slate-600">{supportingText}</p>}
      <div className="mt-[6cqw] w-[54cqw] rounded-[2.5cqw] border border-slate-200 bg-white p-[3.2cqw] shadow-[0_8px_24px_rgba(15,23,42,.10)]"><SurveyQr qrUrl={qrUrl} /></div>
      {buttonLabel && <div className="mt-[4.2cqw] inline-flex min-h-[9.5cqw] w-[66cqw] items-center justify-center gap-[2cqw] rounded-full px-[4cqw] py-[2cqw] text-[3.2cqw] font-bold leading-none text-white" style={{ backgroundColor: primaryColor }}><Smartphone aria-hidden="true" className="h-[4cqw] w-[4cqw] shrink-0" /><span>{buttonLabel}</span></div>}
      {footerText && <p className="mt-[2.5cqw] text-[2.5cqw] font-medium text-slate-500">{footerText}</p>}
    </section>
  </article>
}

function CleanQrLandscapeComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return <article data-testid="canonical-qr-sign" data-template-id="clean" data-sign-orientation="landscape" data-qr-destination={qrUrl} className="relative aspect-[7/5] w-full overflow-hidden rounded-[1.6cqw] border border-slate-200 bg-white shadow-[0_18px_38px_rgba(15,23,42,.16)]" style={{ containerType: 'inline-size' }}>
    <div className="absolute inset-y-0 left-0 w-[1.2cqw]" style={{ backgroundColor: primaryColor }} />
    <section className="grid h-full grid-cols-[48%_52%] px-[5cqw] py-[4.2cqw]">
      <div className="flex min-w-0 flex-col pr-[3.5cqw]">
        {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[21cqw]" />}
        <div className="mt-auto mb-auto">
          <div className="h-[.8cqw] w-[9cqw] rounded-full" style={{ backgroundColor: primaryColor }} />
          <h4 className="mt-[3cqw] max-w-[39cqw] text-[6.5cqw] font-bold leading-[1.02] tracking-[-0.04em] text-[#0b172a]">{headline}</h4>
          {supportingText && <p className="mt-[2.2cqw] max-w-[36cqw] text-[2.35cqw] font-medium leading-[1.32] text-slate-600">{supportingText}</p>}
        </div>
        {footerText && <p className="text-[1.65cqw] font-medium text-slate-500">{footerText}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center rounded-[2cqw] bg-slate-50 px-[4cqw] py-[3cqw] text-center">
        <div className="w-[32cqw] bg-white p-[2cqw] shadow-[0_8px_24px_rgba(15,23,42,.10)]"><SurveyQr qrUrl={qrUrl} /></div>
        {buttonLabel && <div className="mt-[2.5cqw] inline-flex min-h-[6.6cqw] w-[35cqw] items-center justify-center gap-[1.4cqw] rounded-full px-[2.6cqw] py-[1.4cqw] text-[2cqw] font-bold leading-none text-white" style={{ backgroundColor: primaryColor }}><Smartphone aria-hidden="true" className="h-[2.7cqw] w-[2.7cqw] shrink-0" /><span>{buttonLabel}</span></div>}
      </div>
    </section>
  </article>
}

function BoldEventComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return <article data-testid="canonical-qr-sign" data-template-id="bold_event" data-sign-orientation="portrait" data-qr-destination={qrUrl} className="relative aspect-[5/7] w-full overflow-hidden rounded-[2.2cqw] border border-slate-200 text-white shadow-[0_18px_38px_rgba(15,23,42,.22)]" style={{ containerType: 'inline-size', backgroundColor: primaryColor }}>
    <div aria-hidden="true" className="pointer-events-none absolute -right-[18cqw] -top-[13cqw] h-[52cqw] w-[52cqw] rounded-full border-[1.4cqw] border-white/15" />
    <div aria-hidden="true" className="pointer-events-none absolute -left-[22cqw] top-[43cqw] h-[46cqw] w-[46cqw] rounded-full bg-white/10" />
    <section className="relative z-10 flex h-full flex-col px-[7cqw] pb-[7cqw] pt-[6cqw]">
      {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[33cqw] brightness-0 invert" />}
      <p className="mt-[6cqw] text-[2.7cqw] font-bold uppercase tracking-[0.22em] text-white/75">Share your experience</p>
      <h4 className="mt-[2.6cqw] max-w-[84cqw] text-[10.2cqw] font-black leading-[.98] tracking-[-0.045em]">{headline}</h4>
      {supportingText && <p className="mt-[3.3cqw] max-w-[72cqw] text-[3.5cqw] font-medium leading-[1.28] text-white/85">{supportingText}</p>}
      <section className="relative mt-auto flex min-h-[62cqw] items-center gap-[4.5cqw] rounded-[3.2cqw] bg-white p-[5cqw] text-[#0b172a] shadow-[0_12px_30px_rgba(4,12,30,.24)]">
        <div className="w-[47cqw] shrink-0 bg-white"><SurveyQr qrUrl={qrUrl} /></div>
        <div className="min-w-0 flex-1"><div className="h-[1.2cqw] w-[9cqw] rounded-full" style={{ backgroundColor: primaryColor }} /><p className="mt-[3cqw] text-[4.1cqw] font-black leading-[1.04]">Scan the code</p>{buttonLabel && <p className="mt-[2.2cqw] text-[2.8cqw] font-semibold leading-[1.2] text-slate-600">{buttonLabel}</p>}</div>
      </section>
      {footerText && <p className="mt-[2.5cqw] text-center text-[2.5cqw] font-medium text-white/70">{footerText}</p>}
    </section>
  </article>
}

function BoldEventLandscapeComposition({ configuration }: { configuration: CanonicalQrSignConfiguration }) {
  const { qrUrl, headline, supportingText, buttonLabel, primaryColor, showLogo, logoSrc, footerText } = configuration
  return <article data-testid="canonical-qr-sign" data-template-id="bold_event" data-sign-orientation="landscape" data-qr-destination={qrUrl} className="relative aspect-[7/5] w-full overflow-hidden rounded-[1.6cqw] border border-slate-200 text-white shadow-[0_18px_38px_rgba(15,23,42,.22)]" style={{ containerType: 'inline-size', backgroundColor: primaryColor }}>
    <div aria-hidden="true" className="pointer-events-none absolute -left-[12cqw] -top-[18cqw] h-[48cqw] w-[48cqw] rounded-full border-[1.1cqw] border-white/15" />
    <div aria-hidden="true" className="pointer-events-none absolute left-[31cqw] top-[39cqw] h-[30cqw] w-[30cqw] rounded-full bg-white/10" />
    <section className="relative z-10 grid h-full grid-cols-[52%_48%] gap-[4cqw] px-[5cqw] py-[4.2cqw]">
      <div className="flex min-w-0 flex-col">
        {showLogo && <img src={logoSrc} alt="SignalThread" className="h-auto w-[23cqw] brightness-0 invert" />}
        <div className="my-auto">
          <p className="text-[1.8cqw] font-bold uppercase tracking-[0.22em] text-white/75">Share your experience</p>
          <h4 className="mt-[2cqw] max-w-[43cqw] text-[7.2cqw] font-black leading-[.96] tracking-[-0.045em]">{headline}</h4>
          {supportingText && <p className="mt-[2.4cqw] max-w-[40cqw] text-[2.35cqw] font-medium leading-[1.28] text-white/85">{supportingText}</p>}
        </div>
        {footerText && <p className="text-[1.65cqw] font-medium text-white/70">{footerText}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center rounded-[2.4cqw] bg-white p-[3.2cqw] text-center text-[#0b172a] shadow-[0_12px_30px_rgba(4,12,30,.24)]">
        <div className="w-[31cqw] bg-white"><SurveyQr qrUrl={qrUrl} /></div>
        <div className="mt-[2.4cqw] h-[.8cqw] w-[8cqw] rounded-full" style={{ backgroundColor: primaryColor }} />
        <p className="mt-[1.8cqw] text-[2.9cqw] font-black leading-none">Scan the code</p>
        {buttonLabel && <p className="mt-[1.2cqw] text-[1.8cqw] font-semibold leading-[1.2] text-slate-600">{buttonLabel}</p>}
      </div>
    </section>
  </article>
}
