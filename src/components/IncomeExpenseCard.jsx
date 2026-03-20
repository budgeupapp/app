import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ALL_MONTH_KEYS, MONTH_LABELS } from '../config/onboardingConfig'
import { fmt } from './TermGraph'

/* Center text in select elements (iOS Safari ignores textAlign) */
const selectCenterStyle = document.createElement('style')
selectCenterStyle.textContent = '.select-center { text-align: center; text-align-last: center; -webkit-text-align-last: center; }'
if (!document.querySelector('[data-select-center]')) { selectCenterStyle.setAttribute('data-select-center', ''); document.head.appendChild(selectCenterStyle) }

/* ---------- HELPERS ---------- */

function splitEvenly(total, n) {
    if (n <= 0) return []
    const base = Math.floor(total * 100 / n) / 100
    const remainder = Math.round((total - base * n) * 100)
    return Array.from({ length: n }, (_, i) =>
        Math.round((base + (i < remainder ? 0.01 : 0)) * 100) / 100
    )
}

function formatDisplay(raw) {
    if (!raw) return ''
    const [whole, ...rest] = raw.split('.')
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
}

function cleanNum(val) {
    let v = val.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (parts.length === 2 && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2)
    if (parseFloat(v) > 500000) v = '500000'
    return v
}

const SHORT_MONTH = {
    september: 'Sept', october: 'Oct', november: 'Nov', december: 'Dec',
    january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
    may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
}

function getMonthRange(monthKey) {
    const MONTH_NUM = {
        september: 8, october: 9, november: 10, december: 11,
        january: 0, february: 1, march: 2, april: 3,
        may: 4, june: 5, july: 6, august: 7,
    }
    const m = MONTH_NUM[monthKey]
    const year = m >= 8 ? 2025 : 2026
    const last = new Date(year, m + 1, 0)
    const pad = (n) => String(n).padStart(2, '0')
    return {
        min: `${year}-${pad(m + 1)}-01`,
        max: `${year}-${pad(m + 1)}-${pad(last.getDate())}`,
    }
}

function CustomSelect({ value, onChange, options, minWidth = 120, triggerStyle }) {
    const [open, setOpen] = useState(false)
    const [openUp, setOpenUp] = useState(false)
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
    const ref = useRef(null)
    const menuRef = useRef(null)

    useEffect(() => {
        if (!open) return
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target) && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
    }, [open])

    const handleOpen = () => {
        if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            const spaceBelow = window.innerHeight - rect.bottom
            const up = spaceBelow < 260
            setOpenUp(up)
            const rightVal = window.innerWidth - rect.right + 8
            // Ensure menu doesn't go past left edge (leave 8px margin)
            const menuWidth = Math.max(minWidth, rect.width)
            const maxRight = window.innerWidth - menuWidth - 8
            setMenuPos({
                top: up ? undefined : rect.top,
                bottom: up ? window.innerHeight - rect.bottom : undefined,
                right: Math.max(8, Math.min(rightVal, maxRight)),
            })
        }
        setOpen(!open)
    }

    const selected = options.find(o => o.value === value)

    return (
        <>
            {/* Backdrop */}
            {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />}

            <div ref={ref} style={{ position: 'relative', zIndex: open ? 9999 : 'auto', height: '100%', display: 'flex' }}>
                {/* Trigger */}
                <div
                    onClick={handleOpen}
                    style={{ position: 'relative', ...(triggerStyle || {
                        fontSize: 14, fontWeight: 600, color: '#333',
                        fontFamily: 'Nunito, sans-serif',
                        background: '#f8f8f8',
                        padding: '6px 28px 6px 12px', borderRadius: 8,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        minWidth, textAlign: 'center',
                        display: 'inline-block',
                    })}}
                >
                    {selected?.label || value}
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                    }}>
                        <path d="M1 1L5 5L9 1" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

            </div>

            {/* Portal dropdown — rendered at document body to escape stacking contexts */}
            {createPortal(
                <>
                    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99999 }} />}
                    <div ref={menuRef} style={{
                        position: 'fixed',
                        ...(openUp
                            ? { bottom: menuPos.bottom, right: menuPos.right }
                            : { top: menuPos.top, right: menuPos.right }),
                        maxWidth: 'calc(100vw - 16px)',
                        background: '#fff',
                        borderRadius: 14,
                        boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
                        transform: open
                            ? 'scale(1) translateY(0)'
                            : openUp ? 'scale(0.85) translateY(4px)' : 'scale(0.85) translateY(-4px)',
                        opacity: open ? 1 : 0,
                        transformOrigin: openUp ? 'bottom right' : 'top right',
                        transition: open
                            ? 'transform 0.25s cubic-bezier(.175,.885,.32,1.275), opacity 0.15s ease'
                            : 'transform 0.2s cubic-bezier(.4,0,1,1), opacity 0.15s ease',
                        minWidth: Math.max(minWidth + 40, 180),
                        pointerEvents: open ? 'auto' : 'none',
                        overflow: 'hidden',
                        zIndex: 100000,
                    }}>
                        <div style={{ overflowY: 'auto', maxHeight: 280, padding: '6px 0' }}>
                            {options.map((o) => {
                                const isSelected = o.value === value
                                return (
                                <div
                                    key={o.value}
                                    onClick={() => { onChange(o.value); setOpen(false) }}
                                    style={{
                                        padding: '11px 20px',
                                        fontSize: 16, fontWeight: isSelected ? 600 : 400,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: isSelected ? '#147b75' : '#333',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}
                                >
                                    {o.label}
                                    {isSelected && (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#147b75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    )
}

function Chevron({ open }) {
    return (
        <svg width="18" height="15" viewBox="0 0 18 15" fill="none" style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
        }}>
            <path d="M4 5.5L9 10.5L14 5.5" stroke="#777"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

const FREQ_LABELS = {
    weekly: 'Per week',
    fortnightly: 'Per fortnight',
    monthly: 'Per month',
    yearly: 'Per year',
    irregular: 'Per instalment',
    'one-off': 'One-off',
}

const SCHEDULE_FREQ_LABELS = {
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    irregular: 'In instalments',
    'one-off': 'One-off',
}

/* ==========================================================================
   MULTI-ENTRY WRAPPER
   ========================================================================== */

export default function IncomeExpenseCard({
    entries = [],
    updateEntries,
    subtitle = '',
    categoryLabel = '',           // "Student Finance", "Rent" etc (for delete toast)
    entryLabel = 'Entry',        // "Loan", "Bursary", "Payment" etc
    addLabel = 'Add another',    // "Add another loan"
    compact = false,              // hide add button + spacer (Dashboard mode)
    frequencyOptions = ['weekly', 'monthly', 'yearly', 'irregular'],
    defaultFrequency = 'yearly',
    defaultMonths = [],           // for irregular mode
    defaultDates = {},            // for irregular mode
    isExpense = false,
    icon: IconComponent = null,   // Phosphor icon component
    iconColor = null,             // icon tint (defaults to accent)
    nameEditable = false,         // show name input per entry
    frequencyLabels: freqLabelOverrides = null, // custom labels e.g. { irregular: 'Per instalment' }
    scheduleFreqOptions = null, // custom schedule freq options when yearly (e.g. ['yearly', 'irregular'])
    scheduleFreqLabels = null, // custom labels for schedule freq options
    entryTotals = null, // per-entry totals from graph events
    entryRemovedCounts = null, // per-entry removed event counts
    entryOverrideCounts = null, // per-entry override counts
    onVisibleEntryChange = null, // callback(idx) when scrolled entry changes
    onDeleteEntry = null, // callback({ label, undoFn, entryId, deletedIdx }) when an entry is deleted
    onClearEntryEvents = null, // callback(entryEditType) clear removed/overrides for this entry
}) {
    const wrapperRef = useRef(null)
    const scrollContainerRef = useRef(null)
    const touchStartRef = useRef(null)

    // Track which entry is closest to viewport center (for multi-entry graph highlighting)
    useEffect(() => {
        if (!onVisibleEntryChange || !scrollContainerRef.current) return
        const check = () => {
            const entryEls = scrollContainerRef.current?.querySelectorAll('[data-entry]')
            if (!entryEls || entryEls.length <= 1) return
            const viewTop = window.innerHeight * 0.35
            let bestIdx = 0, bestDist = Infinity
            entryEls.forEach((el) => {
                const idx = parseInt(el.dataset.entryIdx)
                if (isNaN(idx)) return
                const rect = el.getBoundingClientRect()
                // Pick entry whose top is closest to (and not far below) the target line
                const dist = Math.abs(rect.top - viewTop)
                if (dist < bestDist) { bestDist = dist; bestIdx = idx }
            })
            onVisibleEntryChange(bestIdx)
        }
        // Listen to scroll on any parent (dashboard scroll container)
        window.addEventListener('scroll', check, true)
        check() // initial check
        return () => window.removeEventListener('scroll', check, true)
    }, [onVisibleEntryChange, entries.length])

    // Compact mode: same pattern as onboarding — prevent viewport bounce on input focus
    useEffect(() => {
        if (!compact || !wrapperRef.current) return
        const el = wrapperRef.current

        const handleTouchEnd = (e) => {
            const t = e.target
            if (!t.matches('input, textarea, select')) return
            if (t.type === 'date') return
            if (t === document.activeElement) return
            e.preventDefault()
            t.focus({ preventScroll: true })
        }

        el.addEventListener('touchend', handleTouchEnd, { passive: false })
        return () => el.removeEventListener('touchend', handleTouchEnd)
    }, [compact])

    const [newId, setNewId] = useState(null)
    const addEntry = () => {
        const id = `entry_${Date.now()}`
        setNewId(id)
        updateEntries(prev => [...prev, {
            id,
            amount: '',
            frequency: defaultFrequency,
            nextDate: '',
            months: [...defaultMonths],
            dates: { ...defaultDates },
            instalmentAmounts: {},
        }])
        setTimeout(() => setNewId(null), 350)
    }

    const [deletingIdx, setDeletingIdx] = useState(null)
    const removeEntry = (idx) => {
        if (entries.length <= 1) return
        const prevEntries = [...entries]
        const name = categoryLabel || entryLabel
        const label = entries.length > 1 ? `${name} ${idx + 1}` : name
        // Animate out then remove
        setDeletingIdx(idx)
        setTimeout(() => {
            setDeletingIdx(null)
            updateEntries(prev => {
                if (prev.length <= 1) return prev
                return prev.filter((_, i) => i !== idx)
            })
            if (onDeleteEntry) {
                onDeleteEntry({ label: `${label} deleted`, entryId: prevEntries[idx]?.id, deletedIdx: idx })
            }
        }, 300)
    }

    const updateEntry = (idx, field, value) => {
        updateEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
    }

    return (
        <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && subtitle && (
                <div style={{ padding: '0 24px 12px', flexShrink: 0 }}>
                    <p style={{
                        fontSize: 15, fontFamily: 'Nunito, sans-serif',
                        color: '#444', margin: 0, lineHeight: 1.5,
                    }}>
                        {subtitle}
                    </p>
                </div>
            )}
            <div ref={scrollContainerRef} style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 16px 12px' : '0 24px 24px',
                background: compact ? '#fff' : '#f5f7f7',
                minHeight: 0,
            }}>
                {entries.map((entry, idx) => {
                    const isNew = entry.id === newId
                    return (
                    <div key={entry.id || idx} data-entry data-entry-id={entry.id} data-entry-idx={idx} style={{
                        marginBottom: deletingIdx === idx ? 0 : (compact ? 12 : 20),
                        maxHeight: deletingIdx === idx ? 0 : 2000,
                        opacity: deletingIdx === idx ? 0 : 1,
                        overflow: 'hidden',
                        transition: deletingIdx === idx ? 'max-height 0.3s ease, opacity 0.2s ease, margin-bottom 0.3s ease' : 'none',
                        ...(isNew ? {
                            animation: 'loanFadeIn 0.35s ease',
                        } : {}),
                    }}>
                        {entries.length > 1 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                margin: idx === 0 ? '0 0 8px' : '16px 0 8px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                        {entryLabel} {idx + 1}
                                    </span>
                                    {entryTotals && entryTotals[idx] != null && (
                                        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: compact ? '#999' : '#777' }}>
                                            {isExpense ? '\u2212' : '+'}{getCurrencySymbol()}{Math.round(entryTotals[idx]).toLocaleString()}/yr
                                        </span>
                                    )}
                                    {entryRemovedCounts?.[idx] > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470', background: 'rgba(224,100,112,0.1)', padding: '1px 6px', borderRadius: 6, lineHeight: 1.4 }}>
                                            {entryRemovedCounts[idx]} skipped
                                        </span>
                                    )}
                                    {entryOverrideCounts?.[idx] > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 6px', borderRadius: 6, lineHeight: 1.4 }}>
                                            {entryOverrideCounts[idx]} edited
                                        </span>
                                    )}
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeEntry(idx) }} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#d4566a',
                                }}>Delete</button>
                            </div>
                        )}
                        {nameEditable && (
                            <div style={{ marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: compact ? '#888' : '#666', display: 'block', marginBottom: 6 }}>
                                    Name
                                </span>
                                <input
                                    type="text"
                                    placeholder="e.g. Birthday money"
                                    value={entry.label || ''}
                                    onChange={(e) => updateEntry(idx, 'label', e.target.value)}
                                    style={{
                                        width: '100%', border: compact ? 'none' : '1px solid #e8e8e8', borderRadius: 10, background: compact ? '#f5f5f5' : '#fff',
                                        padding: '0 14px', height: 44, fontSize: 14, fontWeight: 500,
                                        fontFamily: 'Nunito, sans-serif', color: '#000',
                                        outline: 'none', boxSizing: 'border-box',
                                        background: '#fff',
                                    }}
                                />
                            </div>
                        )}
                        <EntryCard
                            entry={entry}
                            updateField={(field, value) => updateEntry(idx, field, value)}
                            frequencyOptions={frequencyOptions}
                            defaultMonths={defaultMonths}
                            defaultDates={defaultDates}
                            isExpense={isExpense}
                            scrollOnFocus={!compact && idx > 0}
                            compact={compact}
                            freqLabelOverrides={freqLabelOverrides}
                            scheduleFreqOptions={scheduleFreqOptions}
                            scheduleFreqLabels={scheduleFreqLabels}
                            onClearEntryEvents={onClearEntryEvents ? () => onClearEntryEvents(entry.id) : null}
                        />
                    </div>
                )})}
                {!compact && (
                    <button
                        onClick={addEntry}
                        style={{
                            width: '100%', height: 48,
                            background: isExpense ? 'rgba(224,100,112,0.08)' : 'rgba(20,123,117,0.08)',
                            border: 'none',
                            borderRadius: 14,
                            fontSize: 14, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: isExpense ? '#e06470' : '#147b75',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 6,
                            marginTop: 16,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        {addLabel}
                    </button>
                )}
                {!compact && <div style={{ height: '15vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}

/* ==========================================================================
   SINGLE ENTRY CARD
   ========================================================================== */

function EntryCard({
    entry,
    updateField,
    frequencyOptions,
    defaultMonths,
    defaultDates,
    isExpense,
    scrollOnFocus,
    compact,
    freqLabelOverrides,
    scheduleFreqOptions = null,
    scheduleFreqLabels = null,
    onClearEntryEvents = null,
}) {
    const {
        amount = '',
        frequency = 'monthly',
        nextDate: nextDateRaw = '',
        months: monthsProp = defaultMonths,
        dates: datesProp = defaultDates,
        instalmentAmounts = {},
        variesByTerm = false,
        nonTermAmount = '',
    } = entry
    const nextDate = nextDateRaw || '2025-09-01'

    const accent = isExpense ? '#e06470' : '#147b75'
    const accentBg = isExpense ? 'rgba(224,100,112,0.06)' : 'rgba(20,123,117,0.06)'
    // Input styling: compact (dashboard) uses borderless grey bg, onboarding uses bordered white bg
    const inputBg = compact ? '#f5f5f5' : '#fff'
    const inputBorder = compact ? 'none' : '1px solid #e8e8e8'
    // Grey text: darker in onboarding for contrast against grey card bg
    const grey1 = compact ? '#999' : '#777' // section headers, light labels
    const grey2 = compact ? '#888' : '#666' // field labels
    const grey3 = compact ? '#aaa' : '#888' // currency symbols, hints

    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    useEffect(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [amount])

    const [rawNonTermAmount, setRawNonTermAmount] = useState(() => {
        const n = parseFloat(String(nonTermAmount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    useEffect(() => {
        const n = parseFloat(String(nonTermAmount || '').replace(/,/g, ''))
        setRawNonTermAmount(n ? String(n) : '')
    }, [nonTermAmount])

    const [rawInstalments, setRawInstalments] = useState(() => {
        const obj = {}
        for (const m of (monthsProp || defaultMonths)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        return obj
    })
    useEffect(() => {
        const obj = {}
        for (const m of (monthsProp || defaultMonths)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        setRawInstalments(obj)
    }, [instalmentAmounts])

    const [nextDateExpanded, setNextDateExpanded] = useState(true)
    const [customAmounts, setCustomAmounts] = useState(
        () => Object.values(instalmentAmounts || {}).some(v => parseFloat(String(v || '0').replace(/,/g, '')) > 0)
    )
    const [instalmentWarning, setInstalmentWarning] = useState('')
    const dateActiveRef = useRef(false)
    const [showFreqPicker, setShowFreqPicker] = useState(frequency === 'yearly')
    // Default schedule frequency: use custom options if provided, else per instalment for yearly, monthly otherwise
    const defaultScheduleFreq = entry.scheduleFrequency
        || (scheduleFreqOptions ? scheduleFreqOptions.find(f => f !== 'yearly') || scheduleFreqOptions[0] : null)
        || (frequency === 'yearly' ? (freqLabelOverrides ? 'irregular' : 'monthly') : null)
        || (frequencyOptions.includes('monthly') ? 'monthly' : frequencyOptions.find(f => f !== 'yearly' && f !== 'one-off'))
        || 'monthly'
    const [scheduleFreq, setScheduleFreq] = useState(defaultScheduleFreq)

    const sf0 = entry.scheduleFrequency || (frequency === 'yearly' ? scheduleFreq : frequency)
    const isIrregular = frequency === 'irregular' || (frequency === 'yearly' && sf0 === 'irregular')
    const months = (monthsProp || defaultMonths)
        .slice()
        .sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))

    // Per instalment only when amount freq is irregular (not yearly with irregular schedule)
    const isPerInstalment = frequency === 'irregular'

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateField('amount', val)
        // For irregular: update instalment amounts
        if (isIrregular) {
            const numVal = parseFloat(val) || 0
            if (numVal > 0 && months.length > 0) {
                const ni = {}, nr = {}
                if (isPerInstalment) {
                    // Per instalment: each month gets the same entered amount
                    months.forEach(m => { ni[m] = val; nr[m] = val })
                } else {
                    // Total: distribute evenly across months
                    const amounts = splitEvenly(numVal, months.length)
                    months.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                }
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            }
        }
    }

    const handleNonTermAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawNonTermAmount(val)
        updateField('nonTermAmount', val)
    }

    const handleInstalmentChange = (month, e) => {
        const val = cleanNum(e.target.value)
        const totalAmt = parseFloat(String(amount || '0').replace(/,/g, '')) || 0
        const parsedVal = parseFloat(val) || 0
        // Validate: single instalment can't exceed total
        if (parsedVal > totalAmt && totalAmt > 0) {
            setInstalmentWarning(`Can't exceed total of ${getCurrencySymbol()}${Math.round(totalAmt).toLocaleString()}`)
            return
        }
        setInstalmentWarning('')
        // If only 1 instalment, it must equal the total
        if (months.length === 1 && totalAmt > 0 && Math.abs(parsedVal - totalAmt) > 0.01) {
            setInstalmentWarning(`Only 1 instalment — must equal the total (${getCurrencySymbol()}${Math.round(totalAmt).toLocaleString()}). Add more months to split.`)
            const totalStr = String(totalAmt)
            setRawInstalments({ [month]: totalStr })
            updateField('instalmentAmounts', { [month]: totalStr })
            setTimeout(() => setInstalmentWarning(''), 3000)
            return
        }
        // Redistribute remainder across other months
        const otherMonths = months.filter(m => m !== month)
        const remainder = Math.max(0, totalAmt - parsedVal)
        const ni = { [month]: val }
        const nr = { [month]: val }
        if (otherMonths.length > 0 && totalAmt > 0) {
            const perOther = Math.round(remainder * 100 / otherMonths.length) / 100
            const leftover = Math.round((remainder - perOther * otherMonths.length) * 100)
            otherMonths.forEach((m, i) => {
                const v = String(Math.round((perOther + (i < leftover ? 0.01 : 0)) * 100) / 100)
                ni[m] = v
                nr[m] = v
            })
        } else {
            otherMonths.forEach(m => { ni[m] = instalmentAmounts?.[m] || ''; nr[m] = instalmentAmounts?.[m] || '' })
        }
        setRawInstalments(nr)
        updateField('instalmentAmounts', ni)
    }

    const toggleMonth = (month) => {
        const isRemoving = months.includes(month)
        const next = isRemoving
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateField('months', next)
        const numVal = parseFloat(String(amount || '').replace(/,/g, '')) || 0
        if (isRemoving) {
            if (isPerInstalment) {
                // Per instalment: just remove the month, keep everything else
                const { [month]: _a, ...ni } = instalmentAmounts || {}
                const { [month]: _b, ...nr } = rawInstalments || {}
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            } else {
                // Per year: redistribute total evenly across remaining months
                const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                const ni = {}, nr = {}
                if (numVal > 0) {
                    const amounts = splitEvenly(numVal, sortedNext.length)
                    sortedNext.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                }
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            }
        } else if (numVal > 0 && next.length > 0) {
            if (isPerInstalment) {
                // Per instalment: keep existing amounts, set new month to the amount value
                const amtStr = String(numVal)
                const ni = { ...instalmentAmounts, [month]: amtStr }
                const nr = { ...rawInstalments, [month]: amtStr }
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            } else {
                // Per year: redistribute total evenly across all months
                const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                const ni = {}, nr = {}
                const amounts = splitEvenly(numVal, sortedNext.length)
                sortedNext.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            }
        }
        if (!next.includes(month) && datesProp?.[month]) {
            const { [month]: __, ...rest } = datesProp
            updateField('dates', rest)
        }
    }

    // When yearly is selected and user picks a sub-frequency in Schedule card
    const sf = entry.scheduleFrequency || (showFreqPicker ? scheduleFreq : frequency)

    const isRegularFreq = frequency === 'weekly' || frequency === 'fortnightly' || frequency === 'monthly'

    const scrollOnFocusHandler = scrollOnFocus ? (e) => {
        const el = e.target.closest('[data-entry]')
        if (el) setTimeout(() => {
            const panel = el.closest('.onboarding-panel')
            if (panel) {
                const panelRect = panel.getBoundingClientRect()
                const elRect = el.getBoundingClientRect()
                const offset = elRect.top - panelRect.top + panel.scrollTop - 10
                panel.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
            }
        }, 301)
    } : undefined

    const showTermSplit = variesByTerm && isRegularFreq

    return (
        <div>
            {/* Amount + frequency */}
            <div style={{ marginBottom: 16, width: '100%', boxSizing: 'border-box' }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: compact ? '#999' : '#777', display: 'block', marginTop: 4, marginBottom: 6 }}>
                    {isExpense ? 'I pay' : 'I earn'}
                </span>
                <div style={{ display: 'flex', gap: 8, height: showTermSplit ? 89 : 44, transition: 'height 0.3s ease' }}>
                    <div style={{ flex: '1 1 0', minWidth: 0, height: '100%' }}>
                        <div style={{
                            border: inputBorder,
                            borderRadius: 10, background: inputBg,
                            overflow: 'hidden',
                            height: '100%',
                        }}>
                            {/* Term amount row */}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                padding: '0 14px', height: 44, gap: 6,
                            }}>
                                {showTermSplit && (
                                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey3, whiteSpace: 'nowrap' }}>
                                        Term
                                    </span>
                                )}
                                <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>
                                    {getCurrencySymbol()}
                                </span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={formatDisplay(rawAmount)}
                                    onChange={handleAmountChange}
                                    onFocus={scrollOnFocusHandler}
                                    style={{
                                        flex: 1, border: 'none', background: 'transparent',
                                        fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                        color: '#000', outline: 'none', padding: 0,
                                    }}
                                />
                            </div>

                            {/* Non-term amount row */}
                            {showTermSplit && (
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    padding: '0 14px', height: 44, gap: 6,
                                    borderTop: '1px solid #f0f0f0',
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey3, whiteSpace: 'nowrap' }}>
                                        Hols
                                    </span>
                                    <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>
                                        {getCurrencySymbol()}
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={formatDisplay(rawNonTermAmount)}
                                        onChange={handleNonTermAmountChange}
                                        onFocus={scrollOnFocusHandler}
                                        style={{
                                            flex: 1, border: 'none', background: 'transparent',
                                            fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: 0, height: '100%' }}>
                    <CustomSelect
                        value={frequency}
                        onChange={(v) => {
                            const prevFreq = frequency
                            const currentAmt = parseFloat(String(amount || '0').replace(/,/g, '')) || 0
                            updateField('frequency', v)
                            setShowFreqPicker(v === 'yearly')

                            // Recalculate instalment amounts only (never change the amount field)
                            if (currentAmt > 0 && months.length > 0) {
                                if (prevFreq === 'yearly' && v === 'irregular') {
                                    // Per year → Per instalment: each instalment = the amount
                                    const amtStr = String(currentAmt)
                                    const ni = {}, nr = {}
                                    months.forEach(m => { ni[m] = amtStr; nr[m] = amtStr })
                                    updateField('instalmentAmounts', ni)
                                    setRawInstalments(nr)
                                } else if (prevFreq === 'irregular' && v === 'yearly') {
                                    // Per instalment → Per year: split total evenly
                                    const ni = {}, nr = {}
                                    const amounts = splitEvenly(currentAmt, months.length)
                                    months.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                                    updateField('instalmentAmounts', ni)
                                    setRawInstalments(nr)
                                }
                            }

                            // Reset schedule frequency to default for the new amount frequency
                            if (v === 'yearly') {
                                const newSf = freqLabelOverrides ? 'irregular' : 'monthly'
                                updateField('scheduleFrequency', newSf)
                                setScheduleFreq(newSf)
                            } else {
                                updateField('scheduleFrequency', v)
                                setScheduleFreq(v)
                            }
                            // Reset schedule dates
                            updateField('nextDate', '')
                            updateField('endDate', '')
                            updateField('dayOfWeek', '')
                            updateField('dayOfMonth', '')
                            // Clear stale removed/overrides for this entry
                            if (onClearEntryEvents) onClearEntryEvents()
                            if (v !== 'weekly' && v !== 'fortnightly' && v !== 'monthly') {
                                if (variesByTerm) {
                                    updateField('variesByTerm', false)
                                    updateField('nonTermAmount', '')
                                    setRawNonTermAmount('')
                                }
                            }
                        }}
                        options={frequencyOptions.map(f => ({ value: f, label: freqLabelOverrides?.[f] || FREQ_LABELS[f] }))}
                        minWidth={100}
                        triggerStyle={{
                            width: '100%', border: inputBorder,
                            borderRadius: 10,
                            padding: '0 28px 0 12px',
                            fontSize: 14, fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#333', background: inputBg,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                            boxSizing: 'border-box',
                            minHeight: 44, height: '100%',
                        }}
                    />
                    </div>
                </div>

                {/* Toggle — only for regular frequencies */}
                {isRegularFreq && (
                    <button
                        onClick={() => {
                            updateField('variesByTerm', !variesByTerm)
                            if (variesByTerm) {
                                updateField('nonTermAmount', '')
                                setRawNonTermAmount('')
                            }
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'none', border: 'none',
                            cursor: 'pointer', padding: '10px 0 0', margin: 0,
                        }}
                    >
                        <div style={{
                            width: 36, height: 20, borderRadius: 10,
                            background: variesByTerm ? '#147b75' : '#ddd',
                            transition: 'background 0.2s ease',
                            position: 'relative', flexShrink: 0,
                        }}>
                            <div style={{
                                width: 16, height: 16, borderRadius: 8,
                                background: '#fff', position: 'absolute',
                                top: 2, left: variesByTerm ? 18 : 2,
                                transition: 'left 0.2s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: variesByTerm ? '#333' : (compact ? '#bbb' : '#999') }}>
                            Different amount outside term
                        </span>
                    </button>
                )}
            </div>

            {/* Divider between Amount and Schedule */}

            {/* === ONE-OFF MODE: just a date picker === */}
            {frequency === 'one-off' && (<>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                    On
                </span>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{
                        height: 44, border: inputBorder, borderRadius: 10,
                        display: 'flex', alignItems: 'center', padding: '0 14px',
                        background: inputBg,
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: nextDateRaw ? '#333' : '#bbb' }}>
                            {nextDateRaw ? fmt(nextDateRaw) : 'Select date'}
                        </span>
                    </div>
                    <input
                        type="date"
                        value={nextDateRaw || ''}
                        onFocus={() => { dateActiveRef.current = true }}
                        onBlur={() => { dateActiveRef.current = false }}
                        onChange={(e) => e.target.value && updateField('nextDate', e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }}
                    />
                </div>
            </>)}

            {/* === WEEKLY/FORTNIGHTLY/MONTHLY/YEARLY: schedule card === */}
            {(frequency === 'weekly' || frequency === 'fortnightly' || frequency === 'monthly' || frequency === 'yearly' || showFreqPicker) && frequency !== 'irregular' && frequency !== 'one-off' && (<>
                <div style={{ marginBottom: 16 }}>
                    {/* Paid dropdown row (only for yearly — others skip straight to day selector) */}
                    {frequency === 'yearly' && (sf === 'weekly' || sf === 'fortnightly' || sf === 'monthly' || sf === 'yearly' || showFreqPicker || sf === 'irregular') && (
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                    Paid
                                </span>
                                <CustomSelect
                                    value={entry.scheduleFrequency || (frequency === 'yearly' ? (scheduleFreq || 'irregular') : frequency)}
                                    onChange={(v) => {
                                        setScheduleFreq(v)
                                        updateField('scheduleFrequency', v)
                                        // Clear stale removed/overrides when paid frequency changes
                                        if (onClearEntryEvents) onClearEntryEvents()
                                    }}
                                    options={(scheduleFreqOptions || (() => {
                                        const order = ['weekly', 'fortnightly', 'monthly', 'yearly']
                                        const idx = order.indexOf(frequency)
                                        const opts = idx >= 0 ? order.slice(0, idx + 1) : order
                                        if (frequency === 'yearly') opts.push('irregular')
                                        return opts
                                    })()).map(f => ({ value: f, label: scheduleFreqLabels?.[f] || SCHEDULE_FREQ_LABELS[f] || FREQ_LABELS[f] }))}
                                    triggerStyle={{
                                        width: '100%', height: 44, border: inputBorder,
                                        borderRadius: 10, padding: '0 28px 0 14px',
                                        fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                        color: '#333', background: inputBg, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            {sf !== 'irregular' && <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                    {sf === 'monthly' ? 'On the' : 'On'}
                                </span>
                            {sf === 'yearly' || sf === 'one-off' ? (
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        height: 44, border: inputBorder, borderRadius: 10,
                                        display: 'flex', alignItems: 'center', padding: '0 14px',
                                        background: inputBg,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: nextDateRaw ? '#333' : '#bbb' }}>
                                            {nextDateRaw ? fmt(nextDateRaw) : 'Select date'}
                                        </span>
                                    </div>
                                    <input
                                        type="date"
                                        value={nextDateRaw || ''}
                                        onFocus={() => { dateActiveRef.current = true }}
                                        onBlur={() => { dateActiveRef.current = false }}
                                        onChange={(e) => e.target.value && updateField('nextDate', e.target.value)}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }}
                                    />
                                </div>
                            ) : (sf === 'weekly' || sf === 'fortnightly') ? (
                                <CustomSelect
                                    value={entry.dayOfWeek || 'monday'}
                                    onChange={(v) => updateField('dayOfWeek', v)}
                                    options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => ({ value: d.toLowerCase(), label: d + 's' }))}
                                    triggerStyle={{
                                        width: '100%', height: 44, border: inputBorder,
                                        borderRadius: 10, padding: '0 28px 0 14px',
                                        fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                        color: '#333', background: inputBg, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', boxSizing: 'border-box',
                                    }}
                                />
                            ) : (
                                <CustomSelect
                                    value={entry.dayOfMonth || '1'}
                                    onChange={(v) => updateField('dayOfMonth', v)}
                                    minWidth={200}
                                    options={[
                                        ...Array.from({ length: 31 }, (_, i) => {
                                            const d = i + 1
                                            const suffix = d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'
                                            return { value: String(d), label: `${d}${suffix} of each month` }
                                        }),
                                        { value: 'last', label: 'Last day of each month' },
                                    ]}
                                    triggerStyle={{
                                        width: '100%', height: 44, border: inputBorder,
                                        borderRadius: 10, padding: '0 28px 0 14px',
                                        fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                        color: '#333', background: inputBg, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', boxSizing: 'border-box',
                                    }}
                                />
                            )}
                            </div>}
                        </div>
                    )}

                    {/* Simple "Paid on" for monthly amount frequency */}
                    {frequency === 'monthly' && (
                        <div style={{ marginBottom: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                Paid on the
                            </span>
                            <CustomSelect
                                value={entry.dayOfMonth || '1'}
                                onChange={(v) => updateField('dayOfMonth', v)}
                                minWidth={200}
                                options={[
                                    ...Array.from({ length: 31 }, (_, i) => {
                                        const d = i + 1
                                        const suffix = d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'
                                        return { value: String(d), label: `${d}${suffix} of each month` }
                                    }),
                                    { value: 'last', label: 'Last day of each month' },
                                ]}
                                triggerStyle={{
                                    width: '100%', height: 44, border: inputBorder,
                                    borderRadius: 10, padding: '0 28px 0 14px',
                                    fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                    color: '#333', background: inputBg, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', boxSizing: 'border-box',
                                }}
                            />
                        </div>
                    )}

                    {/* Simple "Paid on" for weekly/fortnightly amount frequency */}
                    {(frequency === 'weekly' || frequency === 'fortnightly') && (
                        <div style={{ marginBottom: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                Paid {frequency === 'weekly' ? 'weekly' : 'fortnightly'} on
                            </span>
                            <CustomSelect
                                value={entry.dayOfWeek || 'monday'}
                                onChange={(v) => updateField('dayOfWeek', v)}
                                options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => ({ value: d.toLowerCase(), label: d + 's' }))}
                                triggerStyle={{
                                    width: '100%', height: 44, border: inputBorder,
                                    borderRadius: 10, padding: '0 28px 0 14px',
                                    fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                    color: '#333', background: inputBg, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', boxSizing: 'border-box',
                                }}
                            />
                        </div>
                    )}

                    {/* From / Until dates (weekly/fortnightly/monthly) */}
                    {(sf === 'weekly' || sf === 'fortnightly' || sf === 'monthly') && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                    From
                                </span>
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        height: 44, border: inputBorder, borderRadius: 10,
                                        display: 'flex', alignItems: 'center', padding: '0 14px',
                                        background: inputBg,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: nextDate ? '#333' : '#bbb' }}>
                                            {nextDate ? fmt(nextDate) : 'Select date'}
                                        </span>
                                    </div>
                                    <input
                                        type="date"
                                        value={nextDate || ''}
                                        onFocus={() => { dateActiveRef.current = true }}
                                        onBlur={() => { dateActiveRef.current = false }}
                                        onChange={(e) => e.target.value && updateField('nextDate', e.target.value)}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }}
                                    />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                                    Until
                                </span>
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        height: 44, border: inputBorder, borderRadius: 10,
                                        display: 'flex', alignItems: 'center', padding: '0 14px',
                                        background: inputBg,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                            {fmt(entry.endDate || '2026-08-31')}
                                        </span>
                                    </div>
                                    <input
                                        type="date"
                                        value={entry.endDate || '2026-08-31'}
                                        onFocus={() => { dateActiveRef.current = true }}
                                        onBlur={() => { dateActiveRef.current = false }}
                                        onChange={(e) => e.target.value && updateField('endDate', e.target.value)}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </>)}

            {/* === IRREGULAR MODE: month pills + customise === */}
            {(isIrregular || sf === 'irregular') && (
                <>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: grey2, display: 'block', marginBottom: 6 }}>
                        {frequency === 'irregular' ? 'Paid in' : 'In'}
                    </span>
                    <div style={{
                        border: inputBorder, borderRadius: 12, background: inputBg,
                        overflow: 'hidden', marginBottom: 16,
                    }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
                            padding: '12px',
                        }}>
                            {ALL_MONTH_KEYS.map(m => {
                                const selected = months.includes(m)
                                return (
                                    <button key={m} onClick={() => toggleMonth(m)} style={{
                                        background: selected ? accent : (compact ? '#fff' : '#eee'),
                                        color: selected ? '#fff' : grey2,
                                        border: 'none',
                                        borderRadius: 8, padding: '7px 0',
                                        fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer', transition: 'all 0.2s ease',
                                    }}>
                                        {SHORT_MONTH[m]}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Customise amounts & dates */}
                        {months.length > 0 && (<>
                            <div
                                onClick={() => {
                                    const next = !customAmounts
                                    setCustomAmounts(next)
                                    if (next) {
                                        const yearlyVal = parseFloat(String(amount || '').replace(/,/g, ''))
                                        if (yearlyVal > 0 && months.length > 0 && !Object.values(instalmentAmounts || {}).some(v => parseFloat(String(v || '0').replace(/,/g, '')) > 0)) {
                                            const amounts = splitEvenly(yearlyVal, months.length)
                                            const ni = {}, nr = {}
                                            months.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                                            updateField('instalmentAmounts', ni)
                                            setRawInstalments(nr)
                                        }
                                    }
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    cursor: 'pointer', padding: '12px 14px', borderTop: '1px solid #f0f0f0',
                                }}
                            >
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#555' }}>
                                        Customise amounts & dates
                                    </span>
                                    <p style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: grey3, margin: '2px 0 0' }}>
                                        Optional — set exact amount and date per payment
                                    </p>
                                </div>
                                <Chevron open={customAmounts} />
                            </div>

                            <div style={{
                                maxHeight: customAmounts ? 1000 : 0,
                                opacity: customAmounts ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.35s cubic-bezier(.25,1,.5,1), opacity 0.25s ease',
                            }}>
                                {months.map((m) => (
                                    <div key={m} data-month-row style={{ scrollMarginTop: 10 }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px',
                                        }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333', minWidth: 70 }}>
                                                {MONTH_LABELS[m]}
                                            </span>
                                            {isPerInstalment && (
                                                <span style={{
                                                    fontSize: 14, fontWeight: 600, color: '#333', fontFamily: 'Nunito, sans-serif',
                                                    padding: '6px 0', whiteSpace: 'nowrap', marginLeft: 28,
                                                }}>
                                                    {getCurrencySymbol()}{formatDisplay(rawInstalments[m] || '')}
                                                </span>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: -5, marginLeft: 'auto' }}>
                                                {!isPerInstalment && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 2,
                                                    background: compact ? '#fff' : '#f0f0f0', borderRadius: 8,
                                                    padding: '4px 8px', width: 80, boxSizing: 'border-box',
                                                    marginLeft: 5
                                                }}>
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: grey2, fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>
                                                        {getCurrencySymbol()}
                                                    </span>
                                                    <input
                                                        type="text" inputMode="decimal" placeholder="0.00"
                                                        value={formatDisplay(rawInstalments[m] || '')}
                                                        onChange={(e) => handleInstalmentChange(m, e)}
                                                        onFocus={compact ? undefined : (e) => {
                                                            const row = e.target.closest('[data-month-row]')
                                                            if (row) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'start' }), 301)
                                                        }}
                                                        style={{
                                                            flex: 1, border: 'none', background: 'transparent',
                                                            fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                                            color: grey2, outline: 'none', padding: 0, textAlign: 'left',
                                                        }}
                                                    />
                                                </div>)}
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{
                                                        fontSize: 14, fontWeight: 600, color: grey2,
                                                        fontFamily: 'Nunito, sans-serif', pointerEvents: 'none',
                                                        background: compact ? '#fff' : '#f0f0f0', padding: '6px 12px', borderRadius: 8,
                                                        display: 'inline-block', whiteSpace: 'nowrap',
                                                        minWidth: 120, textAlign: 'center',
                                                    }}>
                                                        {fmt(datesProp?.[m] || getMonthRange(m).min)}
                                                    </span>
                                                    <input
                                                        type="date"
                                                        value={datesProp?.[m] || getMonthRange(m).min}
                                                        min={getMonthRange(m).min}
                                                        max={getMonthRange(m).max}
                                                        onFocus={() => { dateActiveRef.current = true }}
                                                        onBlur={() => { dateActiveRef.current = false }}
                                                        onChange={(e) => e.target.value && updateField('dates', { ...datesProp, [m]: e.target.value })}
                                                        style={{
                                                            position: 'absolute', inset: 0,
                                                            opacity: 0, width: '100%', height: '100%',
                                                            cursor: 'pointer', fontSize: 16,
                                                        }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => months.length > 1 && toggleMonth(m)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        padding: 4, display: 'flex', alignItems: 'center',
                                                        opacity: months.length > 1 ? 1 : 0.25,
                                                    }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {instalmentWarning && (
                                    <p style={{ margin: '8px 12px 4px', fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                        {instalmentWarning}
                                    </p>
                                )}
                            </div>
                        </>)}
                    </div>
                </>
            )}
        </div>
    )
}
