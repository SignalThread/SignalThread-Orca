'use client'

import { useEffect, useState, useRef, useCallback, Suspense, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTourContext } from '@/components/onboarding/TourContext'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { AccountUsersPanel } from '@/components/app/AccountUsersPanel'
import { EventSettingsPanel } from '@/components/events/EventSettingsPanel'
import { isEventsAccount } from '@/lib/account-product-mode'
import { CONSENT_BULLET_STYLES, CONSENT_BULLET_STYLE_LABELS, getConsentBulletGlyph, normalizeConsentBulletStyle } from '@/lib/consent-bullet-style'

interface Location {
    id: string
    name: string
    slug: string
    address: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    googleReviewUrl: string | null
    isActive: boolean
    _count: {
        events: number
    }
}

// Blue location marker (classic map pin)
const LOCATION_MARKER_SVG = (
    <svg className="w-5 h-5 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" clipRule="evenodd"/>
    </svg>
)

const LOCATION_TEAM_TOOLTIP =
    'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

type LocationTeamType = '' | 'location' | 'team'
type ProfileSettingsTab = 'locations' | 'consent' | 'branding' | 'billing' | 'users' | 'event-settings'

// Accordion: How to Find Your Google Review Link
function GoogleReviewLinkAccordion() {
    const [open, setOpen] = useState(false)

    return (
        <div
            data-testid="reviewlink-accordion"
            className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 mb-4 overflow-hidden"
        >
            <button
                type="button"
                data-testid="reviewlink-accordion-toggle"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition-colors"
            >
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">i</span>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">How to Find Your Google Review Link</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {open ? 'Click to hide step-by-step instructions' : 'Click to view step-by-step instructions'}
                    </p>
                </div>
                <svg
                    className={`w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div
                data-testid="reviewlink-accordion-content"
                className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
                style={{ maxHeight: open ? 500 : 0 }}
            >
                <div className="px-4 pb-4 pt-0 border-t border-blue-100 dark:border-blue-900/40">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3 mb-4">
                        Your Google Review link lets customers leave reviews directly from your survey completion page.
                    </p>
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 p-4 space-y-4">
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                                1
                            </div>
                            <div>
                                <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Find your Place ID</h4>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">Use Google&apos;s Place ID Finder to locate your business</p>
                                <a
                                    href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
                                >
                                    Open Place ID Finder
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                                2
                            </div>
                            <div>
                                <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Build your review URL</h4>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">Add your Place ID to the end of this URL:</p>
                                <div className="mt-2 px-3 py-2 rounded border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 font-mono text-sm text-zinc-700 dark:text-zinc-300">
                                    https://search.google.com/local/writereview?placeid=<span className="font-bold text-blue-600 dark:text-blue-400">YOUR_PLACE_ID</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                                3
                            </div>
                            <div>
                                <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Paste it into your location</h4>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">Copy the full URL and paste it in the &quot;Google Review Link&quot; field below</p>
                            </div>
                        </div>
                    </div>
                    <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-4">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        This link will appear on your survey completion screen
                    </p>
                </div>
            </div>
        </div>
    )
}

// Default fallback logo for consent/branding preview when no custom logo
const DEFAULT_LOGO_PATH = '/brand/logov2.png'
const LOGO_PLACEHOLDER = (
    <div className="flex flex-col items-center justify-center gap-1 py-2">
        <img src={DEFAULT_LOGO_PATH} alt="Logo" className="max-h-10 max-w-[140px] w-auto object-contain object-center" />
    </div>
)

function PhonePreviewShell({ children }: { children: ReactNode }) {
    return (
        <div className="w-full max-w-[280px] flex-shrink-0 shadow-2xl" style={{ aspectRatio: '9/19.5' }}>
            <div className="h-full rounded-[2.5rem] border-[14px] border-zinc-900 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-800 overflow-hidden flex flex-col">
                <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                    <div className="w-[100px] h-7 rounded-full bg-zinc-900 dark:bg-zinc-950" />
                </div>
                <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-b-[1.75rem]">{children}</div>
            </div>
        </div>
    )
}

function ProfileSettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const accountSlug = searchParams.get('account')
    const eventId = searchParams.get('event')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const tourCtx = useTourContext()

    const [activeTab, setActiveTab] = useState<ProfileSettingsTab>('consent')
    const [accountType, setAccountType] = useState<string | null>(null)
    const isProductModeKnown = accountType !== null
    const isEventsProfile = isProductModeKnown && isEventsAccount(accountType)
    const isRetailProfile = isProductModeKnown && !isEventsProfile

    // Settings is the single account-level Users surface. External entries can
    // deep-link here without creating a second account-management route.
    useEffect(() => {
        const requestedTab = searchParams.get('tab')
        if (requestedTab === 'users') setActiveTab('users')
        if (requestedTab === 'event-settings') setActiveTab('event-settings')
    }, [searchParams])

    // Sync activeTab with tour when tour drives tab switching
    useEffect(() => {
        if (!tourCtx?.tourTab) return
        if (tourCtx.tourTab === 'locations') {
            setActiveTab(isRetailProfile ? 'locations' : 'consent')
            return
        }
        if (tourCtx.tourTab === 'billing') {
            setActiveTab(isRetailProfile ? 'billing' : 'consent')
            return
        }
        if (['consent', 'branding', 'billing', 'users'].includes(tourCtx.tourTab)) {
            setActiveTab(tourCtx.tourTab as ProfileSettingsTab)
        }
    }, [isRetailProfile, tourCtx?.tourTab])

    useEffect(() => {
        if (!isRetailProfile && (activeTab === 'locations' || activeTab === 'billing')) {
            setActiveTab('consent')
        }
    }, [activeTab, isRetailProfile])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [locations, setLocations] = useState<Location[]>([])
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)

    // Save confirmation UX
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showSaveMessage = useCallback((type: 'success' | 'error', text: string) => {
        if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current)
        setSaveMessage({ type, text })
        saveMessageTimerRef.current = setTimeout(() => {
            setSaveMessage(null)
            saveMessageTimerRef.current = null
        }, 2500)
    }, [])

    useEffect(() => () => { if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current) }, [])

    // Settings (branding, consent, business name for consent header)
    const [businessName, setBusinessName] = useState<string>('')
    const [branding, setBranding] = useState({ logoUrl: '', primaryColor: '', primaryButtonColor: '' })
    const [consent, setConsent] = useState({
        title: "SignalThread",
        subtitle: "We'd love to hear from you",
        items: ["Answer a few questions by voice", "Takes just a few minutes", "We'll ask for microphone access", "Your responses stay anonymous"],
        buttonText: "I Agree, Let's Start",
        bulletStyle: 'CHECKMARK',
    })
    const [logoUploading, setLogoUploading] = useState(false)
    const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
    const [previewLogoError, setPreviewLogoError] = useState(false)

    type BillingPayload = {
        planTier: string
        trialEndsAt: string | null
        subscriptionStatus: string | null
        billingStatus: string | null
        currentPeriodEnd: string | null
        cancelAt: string | null
        cancelAtPeriodEnd: boolean | string | null
        scheduledCancellationAt?: string | null
    }
    const [billingInfo, setBillingInfo] = useState<BillingPayload | null>(null)
    const [billingLoading, setBillingLoading] = useState(false)
    const [billingError, setBillingError] = useState<string | null>(null)
    const [portalLoading, setPortalLoading] = useState(false)

    useEffect(() => setPreviewLogoError(false), [branding.logoUrl])
    const hasUploadedLogo = Boolean(branding.logoUrl)

    const uploadLogoFile = useCallback(async (file: File) => {
        if (!accountSlug) return
        const isSupportedType = /^image\/(png|svg\+xml|jpeg|jpg)$/.test(file.type)
        if (!isSupportedType) {
            setLogoUploadError('Use PNG, SVG, or JPG')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            setLogoUploadError('Logo must be under 2MB')
            return
        }

        setLogoUploadError(null)
        setLogoUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('account', accountSlug)
            const res = await fetch('/api/app/account/logo-upload', {
                method: 'POST',
                credentials: 'include',
                body: formData,
            })
            const data = await res.json()
            if (!data.success || !data.logoUrl) {
                const msg = data.error || 'Upload failed'
                console.warn('[Logo] upload failed:', msg)
                throw new Error(msg)
            }

            const logoUrl = data.logoUrl
            setBranding(b => ({ ...b, logoUrl }))
            const saveRes = await fetch(`/api/app/account/settings?account=${accountSlug}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branding: { logoUrl } }),
            })
            if (!saveRes.ok) {
                const saveData = await saveRes.json().catch(() => ({}))
                throw new Error(saveData?.error || 'Failed to save logo')
            }
            showSaveMessage('success', 'Saved')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Logo upload failed'
            setLogoUploadError(msg)
            console.warn('[Logo] upload error:', err)
            showSaveMessage('error', msg)
        } finally {
            setLogoUploading(false)
        }
    }, [accountSlug, showSaveMessage])

    const handleLogoInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || logoUploading) {
            e.target.value = ''
            return
        }
        await uploadLogoFile(file)
        e.target.value = ''
    }, [logoUploading, uploadLogoFile])

    const handleLogoDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        const file = e.dataTransfer.files?.[0]
        if (!file || logoUploading) return
        await uploadLogoFile(file)
    }, [logoUploading, uploadLogoFile])

    const handleRemoveLogo = useCallback(async () => {
        if (!accountSlug || logoUploading || !branding.logoUrl) return

        const previousLogoUrl = branding.logoUrl
        setLogoUploadError(null)
        setBranding(b => ({ ...b, logoUrl: '' }))
        setLogoUploading(true)
        try {
            const saveRes = await fetch(`/api/app/account/settings?account=${accountSlug}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branding: { logoUrl: null } }),
            })
            if (!saveRes.ok) {
                const saveData = await saveRes.json().catch(() => ({}))
                throw new Error(saveData?.error || 'Failed to remove logo')
            }
            showSaveMessage('success', 'Logo removed')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to remove logo'
            setBranding(b => ({ ...b, logoUrl: previousLogoUrl }))
            setLogoUploadError(msg)
            showSaveMessage('error', msg)
        } finally {
            setLogoUploading(false)
        }
    }, [accountSlug, branding.logoUrl, logoUploading, showSaveMessage])

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        googleReviewUrl: '',
        isActive: true
    })
    const [locationTeamType, setLocationTeamType] = useState<LocationTeamType>('')
    const [urlError, setUrlError] = useState<string | null>(null)

    useEffect(() => {
        if (activeTab !== 'billing' || !accountSlug || !isRetailProfile) return
        let cancelled = false
        setBillingLoading(true)
        setBillingError(null)
        fetch(`/api/app/account/billing?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return
                if (data.success && data.billing) {
                    setBillingInfo(data.billing)
                } else {
                    setBillingError(typeof data.error === 'string' ? data.error : 'Failed to load billing')
                }
            })
            .catch(() => {
                if (!cancelled) setBillingError('Failed to load billing')
            })
            .finally(() => {
                if (!cancelled) setBillingLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [activeTab, accountSlug, isRetailProfile])

    useEffect(() => {
        if (!accountSlug) {
            setError('Missing account parameter')
            setLoading(false)
            return
        }
        let cancelled = false
        const applyAccountType = (nextAccountType: string | null) => {
            if (!nextAccountType) return
            setAccountType(nextAccountType)
            if (isEventsAccount(nextAccountType)) {
                setActiveTab((current) =>
                    current === 'locations' || current === 'billing'
                        ? 'consent'
                        : current
                )
            } else {
                setActiveTab((current) =>
                    current === 'consent'
                        ? 'locations'
                        : current
                )
            }
        }

        const loadProfileSettings = async () => {
            setLoading(true)
            setError(null)

            let loadedAccountType: string | null = null
            try {
                const accountRes = await fetch(`/api/app/account?account=${accountSlug}`, { credentials: 'include' })
                const accountData = await accountRes.json().catch(() => ({}))
                if (!cancelled && accountRes.ok && typeof accountData.account?.accountType === 'string') {
                    loadedAccountType = accountData.account.accountType
                    applyAccountType(loadedAccountType)
                }
            } catch {
                // Settings may still return accountType; keep going.
            }

            try {
                const settingsRes = await fetch(`/api/app/account/settings?account=${accountSlug}`, { credentials: 'include' })
                const data = await settingsRes.json().catch(() => ({}))
                if (cancelled) return
                if (settingsRes.ok && data.success && data.settings) {
                    const settingsAccountType =
                        typeof data.account?.accountType === 'string'
                            ? data.account.accountType
                            : loadedAccountType
                    applyAccountType(settingsAccountType)
                    const s = data.settings
                    setBusinessName((s.businessName as string) || '')
                    const b = s.branding || {}
                    setBranding({
                        logoUrl: b.logoUrl || '',
                        primaryColor: b.primaryColor || '',
                        primaryButtonColor: b.primaryButtonColor || '',
                    })
                    const c = data.settings.consent || {}
                    const title = c.title || "SignalThread"
                    setConsent({
                        title: title === "Share your thoughts" ? "SignalThread" : title,
                        subtitle: c.subtitle || "We'd love to hear from you",
                        items: Array.isArray(c.items) ? c.items : ["Answer a few questions by voice", "Takes just a few minutes", "We'll ask for microphone access", "Your responses stay anonymous"],
                        buttonText: c.buttonText || "I Agree, Let's Start",
                        bulletStyle: normalizeConsentBulletStyle(c.bulletStyle),
                    })
                    if (isEventsAccount(settingsAccountType)) {
                        setLoading(false)
                    } else if (settingsAccountType) {
                        await fetchLocations(settingsAccountType)
                    } else {
                        setLoading(false)
                    }
                } else {
                    setError(typeof data.error === 'string' ? data.error : 'Failed to load settings')
                    if (loadedAccountType && !isEventsAccount(loadedAccountType)) {
                        await fetchLocations(loadedAccountType)
                    } else {
                        setLoading(false)
                    }
                }
            } catch {
                if (!cancelled) {
                    setError('Failed to load settings')
                    if (loadedAccountType && !isEventsAccount(loadedAccountType)) {
                        await fetchLocations(loadedAccountType)
                    } else {
                        setLoading(false)
                    }
                }
            }
        }

        loadProfileSettings()
        return () => {
            cancelled = true
        }
    }, [accountSlug])

    const fetchLocations = async (accountTypeOverride: string | null = accountType) => {
        if (!accountSlug) {
            setError('Missing account parameter')
            setLoading(false)
            return
        }
        if (!accountTypeOverride || isEventsAccount(accountTypeOverride)) {
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            const response = await fetch(`/api/app/locations?account=${accountSlug}`, {
                credentials: 'include'
            })

        if (!response.ok) throw new Error('Failed to load locations/teams')

            const data = await response.json()
            setLocations(data.locations || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const validateUrl = (url: string): boolean => {
        if (!url.trim()) return true // Empty is allowed
        if (!url.startsWith('https://')) {
            setUrlError('URL must start with https://')
            return false
        }
        setUrlError(null)
        return true
    }

    const handleAdd = () => {
        setShowAddForm(true)
        setEditingId(null)
        setLocationTeamType('')
        setFormData({
            name: '',
            address: '',
            city: '',
            state: '',
            postalCode: '',
            googleReviewUrl: '',
            isActive: true
        })
        setUrlError(null)
    }

    const handleEdit = (location: Location) => {
        setEditingId(location.id)
        setShowAddForm(false)
        setLocationTeamType('location')
        setFormData({
            name: location.name,
            address: location.address || '',
            city: location.city || '',
            state: location.state || '',
            postalCode: location.postalCode || '',
            googleReviewUrl: location.googleReviewUrl || '',
            isActive: location.isActive
        })
        setUrlError(null)
    }

    const handleCancel = () => {
        setShowAddForm(false)
        setEditingId(null)
        setLocationTeamType('')
        setFormData({
            name: '',
            address: '',
            city: '',
            state: '',
            postalCode: '',
            googleReviewUrl: '',
            isActive: true
        })
        setUrlError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!formData.name.trim()) {
            setError('Location/Team name is required')
            return
        }

        if (!validateUrl(formData.googleReviewUrl)) {
            return
        }

        try {
            setSaving(true)

            const url = editingId
                ? `/api/app/locations/${editingId}?account=${accountSlug}`
                : `/api/app/locations?account=${accountSlug}`

            const response = await fetch(url, {
                method: editingId ? 'PATCH' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name.trim(),
                    address: formData.address.trim() || null,
                    city: formData.city.trim() || null,
                    state: formData.state.trim() || null,
                    postalCode: formData.postalCode.trim() || null,
                    googleReviewUrl: formData.googleReviewUrl.trim() || null,
                    isActive: formData.isActive
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || `Failed to ${editingId ? 'update' : 'create'} location/team`)
            }

            await fetchLocations()
            handleCancel()
            showSaveMessage('success', 'Saved')
        } catch (err: any) {
            setError(err.message)
            showSaveMessage('error', err.message || 'Failed to save location/team')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this location/team? This action cannot be undone.')) {
            return
        }

        try {
            setSaving(true)
            setError(null)

            const response = await fetch(`/api/app/locations/${id}?account=${accountSlug}`, {
                method: 'DELETE',
                credentials: 'include'
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete location/team')
            }

            await fetchLocations()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <AdminLayout homePath={`/app?account=${accountSlug}`}>
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
            </AdminLayout>
        )
    }

    const eventsProfileTabs: Array<{ key: ProfileSettingsTab; label: string; tour?: string }> = [
        { key: 'event-settings', label: 'Event Settings' },
        { key: 'consent', label: 'Consent Screen', tour: 'consent-tab' },
        { key: 'branding', label: 'Branding', tour: 'branding-tab' },
        { key: 'users', label: 'Users', tour: 'users-tab' },
    ]
    const retailProfileTabs: Array<{ key: ProfileSettingsTab; label: string; tour?: string }> = [
        { key: 'locations', label: 'Locations/Teams', tour: 'tab-locations' },
        { key: 'consent', label: 'Consent Screen', tour: 'consent-tab' },
        { key: 'branding', label: 'Branding', tour: 'branding-tab' },
        { key: 'billing', label: 'Billing' },
        { key: 'users', label: 'Users', tour: 'users-tab' },
    ]
    const profileTabs = isRetailProfile ? retailProfileTabs : eventsProfileTabs
    const isCompactEventsProfile = !isRetailProfile
    const profileCardPadding = isCompactEventsProfile ? 'sm' : 'md'
    const settingsTitleClass = isCompactEventsProfile
        ? 'text-2xl sm:text-[1.75rem] font-bold text-zinc-900 dark:text-zinc-100'
        : 'text-3xl sm:text-[2rem] font-bold text-zinc-900 dark:text-zinc-100'
    const settingsSubtitleClass = isCompactEventsProfile
        ? 'mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'
        : 'mt-0.5 text-base text-zinc-600 dark:text-zinc-400'
    const settingsTabListClass = isCompactEventsProfile
        ? 'flex flex-wrap gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800 w-fit mb-3'
        : 'flex flex-wrap gap-1 p-1 rounded-full bg-zinc-100 dark:bg-zinc-800 w-fit mb-3'
    const settingsTabClass = (selected: boolean) =>
        isCompactEventsProfile
            ? `rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`
            : `px-5 py-2.5 text-sm font-medium rounded-full transition-colors ${
                selected
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`
    const panelTitleClass = isCompactEventsProfile
        ? 'text-xl font-bold text-zinc-900 dark:text-zinc-100'
        : 'text-2xl font-bold text-zinc-900 dark:text-zinc-100'
    const panelDescriptionClass = isCompactEventsProfile
        ? 'text-sm text-zinc-500 dark:text-zinc-400'
        : 'text-base text-zinc-500 dark:text-zinc-400'
    const consentBulletStyle = normalizeConsentBulletStyle(consent.bulletStyle)
    const consentBulletGlyph = getConsentBulletGlyph(consentBulletStyle)

    return (
        <AdminLayout homePath={`/app?account=${accountSlug}`}>
            <div className="lg:-mt-3">
                <button
                    onClick={() => router.push(accountSlug ? `/app?account=${accountSlug}` : '/app')}
                    className="inline-flex text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 mb-1.5"
                >
                    ← Back
                </button>
                <div className="mb-3">
                    <h1 className={settingsTitleClass}>Profile Settings</h1>
                    <p className={settingsSubtitleClass}>
                        {!isRetailProfile
                            ? 'Manage organization settings, consent, branding, and team users.'
                            : 'Manage your locations/teams, consent screen, branding, billing, and team users'}
                    </p>
                </div>

                {error && (
                    <Card padding={profileCardPadding} className="mb-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </Card>
                )}

            {/* Save confirmation banner */}
            {saveMessage && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-opacity ${
                    saveMessage.type === 'success'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                }`}>
                    {saveMessage.text}
                </div>
            )}

                {/* Segmented tab control - pill style */}
                <div className={settingsTabListClass} data-tour="account-setup-tabs">
                {profileTabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        data-tour={tab.tour}
                        onClick={() => setActiveTab(tab.key)}
                        className={settingsTabClass(activeTab === tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
                </div>

                {isEventsProfile && activeTab === 'event-settings' && (
                    eventId && accountSlug
                        ? <EventSettingsPanel accountSlug={accountSlug} eventId={eventId} />
                        : <Card padding={profileCardPadding}><h2 className={panelTitleClass}>Event Settings</h2><p className={`mt-1 ${panelDescriptionClass}`}>Open Settings from an Event workspace to manage that event’s details and collection timing.</p></Card>
                )}

                {/* Locations - Google help accordion (standalone, outside location card) */}
                {!isEventsProfile && activeTab === 'locations' && (
                <GoogleReviewLinkAccordion />
                )}

            {/* Locations - single container card */}
            {!isEventsProfile && activeTab === 'locations' && (
            <Card className="mb-6" data-tour="locations-panel">
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Locations/Teams</h2>
                            <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                        </div>
                        <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">Manage where feedback is collected and optional Google Review links</p>
                    </div>
                    <Button onClick={handleAdd} disabled={showAddForm || !!editingId}>
                        + Add Location/Team
                    </Button>
                </div>

                {locations.length === 0 ? (
                    <p className="text-center text-zinc-500 dark:text-zinc-400 py-8 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg">
                        Create a Location or Team to start collecting feedback.
                    </p>
                ) : (
                    <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                        {locations.map((location) => (
                            <div key={location.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className="mt-0.5 flex-shrink-0">{LOCATION_MARKER_SVG}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                                {location.name}
                                            </h4>
                                            {!location.isActive && (
                                                <span className="px-2 py-1 text-xs font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded">
                                                    Inactive
                                                </span>
                                            )}
                                        </div>

                                        {(location.address || location.city || location.state) && (
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                                                {[location.address, location.city, location.state]
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </p>
                                        )}

                                        {location.googleReviewUrl && (
                                            <div className="mt-2">
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                                    Google Review URL:
                                                </p>
                                                <a
                                                    href={location.googleReviewUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                                                >
                                                    {location.googleReviewUrl}
                                                </a>
                                            </div>
                                        )}

                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                                            {location._count.events} {location._count.events === 1 ? 'event' : 'events'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleEdit(location)}
                                        disabled={saving || showAddForm || (editingId !== null && editingId !== location.id)}
                                        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(location.id)}
                                        disabled={saving}
                                        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
            )}

            {/* Branding */}
            {activeTab === 'branding' && (
            <Card padding={profileCardPadding} className="mb-6" data-tour="branding-content">
                <h2 className={`${panelTitleClass} mb-1`}>Branding</h2>
                <p className={`${panelDescriptionClass} mb-4`}>Upload your logo and customize your brand colors</p>

                <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/svg+xml,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={handleLogoInputChange}
                />

                <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] ${
                    isCompactEventsProfile ? 'gap-5 lg:gap-6' : 'gap-6 lg:gap-8'
                }`}>
                    {/* Left: Branding controls */}
                    <div className={isCompactEventsProfile ? 'space-y-5 min-w-0' : 'space-y-7 min-w-0'}>
                        <div>
                            <h3 className={`${isCompactEventsProfile ? 'text-base' : 'text-lg'} font-semibold text-zinc-900 dark:text-zinc-100 mb-3`}>Logo Upload</h3>
                            <div
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                onDrop={handleLogoDrop}
                                className={`border-2 border-dashed rounded-lg ${isCompactEventsProfile ? 'p-4 sm:p-5 min-h-[180px]' : 'p-6 sm:p-7 min-h-[220px]'} transition-colors ${
                                    logoUploading
                                        ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50'
                                        : hasUploadedLogo
                                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20'
                                            : 'border-zinc-300 dark:border-zinc-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30'
                                }`}
                            >
                                {hasUploadedLogo ? (
                                    <div className="flex h-full flex-col items-center justify-center gap-4">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Logo uploaded
                                        </span>
                                        <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 min-h-[112px] flex items-center justify-center">
                                            {branding.logoUrl && !previewLogoError ? (
                                                <img
                                                    src={branding.logoUrl}
                                                    alt="Uploaded logo"
                                                    className="max-h-14 max-w-[200px] w-auto object-contain object-center"
                                                    onError={() => setPreviewLogoError(true)}
                                                />
                                            ) : (
                                                LOGO_PLACEHOLDER
                                            )}
                                        </div>
                                        {previewLogoError && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                                                Preview unavailable for this logo URL, but it is still saved.
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={logoUploading}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                {logoUploading ? 'Uploading…' : 'Replace Logo'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                disabled={logoUploading}
                                                onClick={handleRemoveLogo}
                                            >
                                                Remove Logo
                                            </Button>
                                        </div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                                            Drag and drop a new file here to replace your logo.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                                            <svg className="w-7 h-7 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                {logoUploading ? 'Uploading…' : 'Click to upload or drag and drop'}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                                PNG, JPG or SVG (recommended: 400x400px)
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={logoUploading}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            Choose File
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {logoUploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{logoUploadError}</p>}
                            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">This logo appears on your consent and kiosk experience screens.</p>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                </svg>
                                <h3 className={`${isCompactEventsProfile ? 'text-base' : 'text-lg'} font-semibold text-zinc-900 dark:text-zinc-100`}>Color Palette</h3>
                            </div>
                            <div className={isCompactEventsProfile ? 'space-y-4' : 'space-y-5'}>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Primary Button Color</label>
                                    <div className="flex gap-3">
                                        <input
                                            type="color"
                                            value={branding.primaryButtonColor || '#000000'}
                                            onChange={(e) => setBranding(b => ({ ...b, primaryButtonColor: e.target.value }))}
                                            className="w-10 h-10 rounded-lg border border-zinc-300 dark:border-zinc-600 cursor-pointer flex-shrink-0"
                                        />
                                        <input
                                            type="text"
                                            value={branding.primaryButtonColor}
                                            onChange={(e) => setBranding(b => ({ ...b, primaryButtonColor: e.target.value }))}
                                            placeholder="#000000"
                                            className="flex-1 px-4 py-2.5 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100"
                                        />
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">Used for main CTA buttons and primary actions</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Accent Color</label>
                                    <div className="flex gap-3">
                                        <input
                                            type="color"
                                            value={branding.primaryColor || '#8b5cf6'}
                                            onChange={(e) => setBranding(b => ({ ...b, primaryColor: e.target.value }))}
                                            className="w-10 h-10 rounded-lg border border-zinc-300 dark:border-zinc-600 cursor-pointer flex-shrink-0"
                                        />
                                        <input
                                            type="text"
                                            value={branding.primaryColor}
                                            onChange={(e) => setBranding(b => ({ ...b, primaryColor: e.target.value }))}
                                            placeholder="#8b5cf6"
                                            className="flex-1 px-4 py-2.5 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100"
                                        />
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">Used for badges, tags, and highlights</p>
                                </div>
                            </div>
                        </div>

                        <Button
                            type="button"
                            disabled={saving || logoUploading}
                            onClick={async () => {
                                setSaving(true)
                                setError(null)
                                try {
                                    const res = await fetch(`/api/app/account/settings?account=${accountSlug}`, {
                                        method: 'PATCH',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            branding: {
                                                logoUrl: branding.logoUrl || null,
                                                primaryColor: branding.primaryColor || null,
                                                primaryButtonColor: branding.primaryButtonColor || null,
                                            },
                                        }),
                                    })
                                    if (!res.ok) {
                                        const data = await res.json()
                                        throw new Error(data.error || 'Failed to save')
                                    }
                                    showSaveMessage('success', 'Saved')
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : 'Failed to save branding'
                                    setError(msg)
                                    showSaveMessage('error', msg)
                                } finally {
                                    setSaving(false)
                                }
                            }}
                        >
                            Save Branding
                        </Button>
                    </div>

                    {/* Right: Live Preview */}
                    <div className="flex flex-col lg:min-h-0">
                        <h3 className={`${isCompactEventsProfile ? 'text-base' : 'text-lg'} font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex-shrink-0`}>Live Preview</h3>
                        <div className={`${isCompactEventsProfile ? 'min-h-[420px]' : 'min-h-[500px]'} flex flex-1 items-center justify-center lg:min-h-0 pt-2 lg:pt-0`}>
                            <PhonePreviewShell>
                                <div className="h-full flex flex-col items-center justify-center p-5 min-h-0">
                                    <div className="flex justify-center mb-4">
                                        {branding.logoUrl && !previewLogoError ? (
                                            <img
                                                src={branding.logoUrl}
                                                alt="Logo"
                                                className="max-h-12 max-w-[180px] w-auto object-contain object-center"
                                                onError={() => setPreviewLogoError(true)}
                                            />
                                        ) : (
                                            LOGO_PLACEHOLDER
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Brand Preview</p>
                                        <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{businessName || 'Your Business'}</h2>
                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">How your survey experience appears in kiosk mode</p>
                                    </div>
                                    <div className="mt-4 w-full space-y-2 max-w-[220px]">
                                        <div
                                            className="rounded-lg px-3 py-2 text-[11px] font-semibold text-white text-center"
                                            style={{ backgroundColor: branding.primaryColor || '#8b5cf6' }}
                                        >
                                            Accent color preview
                                        </div>
                                        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 text-center">
                                            Preview of question and helper text
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-center w-full">
                                        <button
                                            type="button"
                                            disabled
                                            className="rounded-2xl px-6 py-2.5 text-xs font-semibold text-white"
                                            style={{ backgroundColor: branding.primaryButtonColor || '#000000' }}
                                        >
                                            Start Survey
                                        </button>
                                    </div>
                                </div>
                            </PhonePreviewShell>
                        </div>
                    </div>
                </div>
            </Card>
            )}

            {/* Consent Screen Content */}
            {activeTab === 'consent' && (
            <Card padding={profileCardPadding} className="mb-6 w-full" data-tour="consent-content">
                <h2 className={`${panelTitleClass} mb-1`}>{businessName || 'Consent Screen'}</h2>
                <p className={`${panelDescriptionClass} ${isCompactEventsProfile ? 'mb-4' : 'mb-6'}`}>
                    Customize the text that appears before your survey starts{businessName ? ` for ${businessName}` : ''}.
                </p>

                <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] ${
                    isCompactEventsProfile ? 'gap-5 lg:gap-6' : 'gap-6 lg:gap-8'
                }`}>
                    {/* Left: Form */}
                    <div className="space-y-4 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Business Name</label>
                                <input
                                    type="text"
                                    value={consent.title}
                                    placeholder="SignalThread"
                                    onChange={(e) => setConsent(c => ({ ...c, title: e.target.value }))}
                                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg dark:bg-zinc-800 dark:text-zinc-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Subtitle</label>
                                <input
                                    type="text"
                                    value={consent.subtitle}
                                    onChange={(e) => setConsent(c => ({ ...c, subtitle: e.target.value }))}
                                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg dark:bg-zinc-800 dark:text-zinc-100"
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Consent Items</label>
                                <div className="flex items-center gap-3">
                                    {isEventsProfile && (
                                        <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                            Bullet style
                                            <select
                                                aria-label="Consent bullet style"
                                                value={consent.bulletStyle}
                                                onChange={(e) => setConsent(c => ({ ...c, bulletStyle: normalizeConsentBulletStyle(e.target.value) }))}
                                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                            >
                                                {CONSENT_BULLET_STYLES.map((style) => (
                                                    <option key={style} value={style}>{CONSENT_BULLET_STYLE_LABELS[style]}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setConsent(c => ({ ...c, items: [...c.items, ''] }))}
                                        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                                    >
                                        + Add
                                    </button>
                                </div>
                            </div>
                            {consent.items.map((item, i) => (
                                <div key={i} className="flex gap-2 mb-1.5">
                                    <input
                                        type="text"
                                        value={item}
                                        onChange={(e) => setConsent(c => {
                                            const arr = [...c.items]
                                            arr[i] = e.target.value
                                            return { ...c, items: arr }
                                        })}
                                        className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg dark:bg-zinc-800 dark:text-zinc-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setConsent(c => ({ ...c, items: c.items.filter((_, j) => j !== i) }))}
                                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Button Text</label>
                            <input
                                type="text"
                                value={consent.buttonText}
                                onChange={(e) => setConsent(c => ({ ...c, buttonText: e.target.value }))}
                                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={async () => {
                                setSaving(true)
                                setError(null)
                                try {
                                    const res = await fetch(`/api/app/account/settings?account=${accountSlug}`, {
                                        method: 'PATCH',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            consent: {
                                                title: consent.title,
                                                subtitle: consent.subtitle,
                                                items: consent.items.filter(Boolean),
                                                buttonText: consent.buttonText,
                                                bulletStyle: consent.bulletStyle,
                                            },
                                        }),
                                    })
                                    if (!res.ok) {
                                        const data = await res.json()
                                        throw new Error(data.error || 'Failed to save')
                                    }
                                    showSaveMessage('success', 'Saved')
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : 'Failed to save consent'
                                    setError(msg)
                                    showSaveMessage('error', msg)
                                } finally {
                                    setSaving(false)
                                }
                            }}
                            disabled={saving}
                        >
                            Save Consent
                        </Button>
                    </div>

                    {/* Right: Live Preview */}
                    <div className="flex flex-col lg:min-h-0">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex-shrink-0">Live Preview</h3>
                        <div className="flex-1 flex items-center justify-center min-h-[500px] lg:min-h-0 pt-2 lg:pt-0">
                            <PhonePreviewShell>
                                <div className="h-full flex flex-col items-center justify-center p-5 min-h-0">
                                    <div className="flex justify-center mb-3">
                                        {branding.logoUrl && !previewLogoError ? (
                                            <img
                                                src={branding.logoUrl}
                                                alt="Logo"
                                                className="max-h-12 max-w-[180px] w-auto object-contain object-center"
                                                onError={() => setPreviewLogoError(true)}
                                            />
                                        ) : (
                                            LOGO_PLACEHOLDER
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{consent.title || 'Title'}</h2>
                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{consent.subtitle || 'Subtitle'}</p>
                                    </div>
                                    <div className="mt-3 space-y-1.5 max-w-full w-full px-1">
                                        {consent.items.filter(Boolean).map((item, i) => (
                                            <div key={i} className={`flex items-start ${consentBulletGlyph ? 'gap-2' : ''}`}>
                                                {consentBulletGlyph && (
                                                    <span
                                                        data-testid={`consent-preview-bullet-${consentBulletStyle.toLowerCase()}`}
                                                        className={consentBulletStyle === 'CHECKMARK'
                                                            ? 'mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-md text-[10px] font-bold text-white flex-shrink-0'
                                                            : 'mt-0.5 inline-flex h-4 w-4 items-center justify-center text-xs font-bold flex-shrink-0'}
                                                        style={consentBulletStyle === 'CHECKMARK'
                                                            ? { backgroundColor: branding.primaryColor || '#059669' }
                                                            : { color: branding.primaryColor || '#059669' }}
                                                    >
                                                        {consentBulletGlyph}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-700 dark:text-gray-300">{item || 'Item'}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 flex justify-center w-full">
                                        <button
                                            type="button"
                                            disabled
                                            className="rounded-2xl px-5 py-2.5 text-xs font-semibold text-white"
                                            style={{ backgroundColor: branding.primaryButtonColor || '#000000' }}
                                        >
                                            {consent.buttonText || 'Button'}
                                        </button>
                                    </div>
                                </div>
                            </PhonePreviewShell>
                        </div>
                    </div>
                </div>
            </Card>
            )}

            {isRetailProfile && activeTab === 'billing' && (
            <Card className="mb-6 w-full">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Billing</h2>
                        <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
                            Subscription and payment details for your workspace. Plan changes are handled in Stripe.
                        </p>
                    </div>
                    <Button
                        type="button"
                        className="w-full sm:w-auto shrink-0 min-w-[200px]"
                        disabled={portalLoading || billingLoading || !accountSlug}
                        onClick={async () => {
                            if (!accountSlug) return
                            setPortalLoading(true)
                            setBillingError(null)
                            try {
                                const res = await fetch(
                                    `/api/app/account/billing?account=${encodeURIComponent(accountSlug)}`,
                                    { method: 'POST', credentials: 'include' }
                                )
                                const data = await res.json().catch(() => ({}))
                                if (!res.ok || !data.success || !data.url) {
                                    throw new Error(
                                        typeof data.error === 'string' ? data.error : 'Could not open billing portal'
                                    )
                                }
                                window.location.href = data.url as string
                            } catch (e) {
                                setBillingError(e instanceof Error ? e.message : 'Could not open billing portal')
                            } finally {
                                setPortalLoading(false)
                            }
                        }}
                    >
                        {portalLoading ? 'Opening…' : 'Manage billing'}
                    </Button>
                </div>

                {billingError && (
                    <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                        {billingError}
                    </div>
                )}

                {billingLoading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                    </div>
                )}

                {!billingLoading && billingInfo && (
                    <div className="space-y-6">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-3">
                                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Plan</dt>
                                <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    {billingInfo.planTier
                                        ? billingInfo.planTier.charAt(0).toUpperCase() +
                                          billingInfo.planTier.slice(1).toLowerCase()
                                        : '—'}
                                </dd>
                            </div>
                            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-3">
                                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Subscription status
                                </dt>
                                <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    {(() => {
                                        const raw = billingInfo.subscriptionStatus ?? billingInfo.billingStatus ?? ''
                                        const pretty = raw
                                            ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
                                            : '—'
                                        const cancelAtIso =
                                            billingInfo.scheduledCancellationAt ??
                                            (billingInfo.cancelAtPeriodEnd === true ||
                                            billingInfo.cancelAtPeriodEnd === 'true'
                                                ? billingInfo.cancelAt ?? billingInfo.currentPeriodEnd
                                                : null)
                                        let endStr: string | null = null
                                        if (cancelAtIso) {
                                            try {
                                                endStr = new Date(cancelAtIso).toLocaleDateString(undefined, {
                                                    dateStyle: 'long',
                                                })
                                            } catch {
                                                endStr = null
                                            }
                                        }
                                        if (endStr) {
                                            return `${pretty} — cancels on ${endStr}`
                                        }
                                        return pretty
                                    })()}
                                </dd>
                            </div>
                            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-3">
                                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    {billingInfo.scheduledCancellationAt ||
                                    billingInfo.cancelAtPeriodEnd === true ||
                                    billingInfo.cancelAtPeriodEnd === 'true'
                                        ? 'Current period ends'
                                        : 'Renewal date'}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    {(() => {
                                        const iso =
                                            billingInfo.scheduledCancellationAt ?? billingInfo.currentPeriodEnd
                                        if (!iso) return '—'
                                        try {
                                            return new Date(iso).toLocaleDateString(undefined, {
                                                dateStyle: 'long',
                                            })
                                        } catch {
                                            return iso
                                        }
                                    })()}
                                </dd>
                            </div>
                            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-3">
                                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Trial ends
                                </dt>
                                <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    {billingInfo.trialEndsAt
                                        ? (() => {
                                              try {
                                                  return new Date(billingInfo.trialEndsAt).toLocaleDateString(
                                                      undefined,
                                                      { dateStyle: 'long' }
                                                  )
                                              } catch {
                                                  return billingInfo.trialEndsAt
                                              }
                                          })()
                                        : '—'}
                                </dd>
                            </div>
                        </dl>

                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Use <span className="font-medium text-zinc-700 dark:text-zinc-300">Manage billing</span> to update
                            payment method, view invoices, or change your plan.
                        </p>
                    </div>
                )}

                {!billingLoading && !billingInfo && !billingError && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-center py-8">No billing data loaded.</p>
                )}
            </Card>
            )}

            {activeTab === 'users' && accountSlug && <AccountUsersPanel accountSlug={accountSlug} />}

                {(showAddForm || editingId) && activeTab === 'locations' && (
                <Card className="mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                        {editingId ? 'Edit Location/Team' : 'Add Location/Team'}
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={locationTeamType}
                                onChange={(e) => setLocationTeamType(e.target.value as LocationTeamType)}
                                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            >
                                <option value="" disabled>Select type</option>
                                <option value="location">Location</option>
                                <option value="team">Team / Crew</option>
                            </select>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Choose Location for a physical place, or Team / Crew for a group that collects feedback in the field.
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                <span>
                                    {locationTeamType === 'team' ? 'Team/Crew Name' : 'Location Name'} <span className="text-red-500">*</span>
                                </span>
                                <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                        </div>

                        <div className={locationTeamType === 'team' ? 'rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/40 p-3' : ''}>
                            <label className={`block text-sm font-medium mb-2 ${locationTeamType === 'team' ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {locationTeamType === 'team' ? 'Address (optional)' : 'Address'}
                            </label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100 ${
                                    locationTeamType === 'team'
                                        ? 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                                        : 'border-zinc-300 dark:border-zinc-600'
                                }`}
                            />
                            {locationTeamType === 'team' && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                    Optional for teams/crews that collect feedback across multiple places.
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                    City
                                </label>
                                <input
                                    type="text"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                    State
                                </label>
                                <input
                                    type="text"
                                    value={formData.state}
                                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                Postal Code
                            </label>
                            <input
                                type="text"
                                value={formData.postalCode}
                                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                Google Review URL
                            </label>
                            <input
                                type="url"
                                value={formData.googleReviewUrl}
                                onChange={(e) => {
                                    setFormData({ ...formData, googleReviewUrl: e.target.value })
                                    validateUrl(e.target.value)
                                }}
                                placeholder="https://g.page/..."
                                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100 ${urlError ? 'border-red-500' : 'border-zinc-300 dark:border-zinc-600'
                                    }`}
                            />
                            {urlError && (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{urlError}</p>
                            )}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Must start with https:// or leave empty
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActive"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="w-4 h-4 text-blue-600 border-zinc-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="isActive" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Active
                            </label>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button type="button" onClick={handleCancel} variant="secondary">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saving || !!urlError}>
                                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Location/Team'}
                            </Button>
                        </div>
                    </form>
                </Card>
                )}
            </div>
        </AdminLayout>
    )
}

export default function ProfileSettingsPage() {
    return (
        <Suspense fallback={
            <AdminLayout>
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
            </AdminLayout>
        }>
            <ProfileSettingsContent />
        </Suspense>
    )
}
