import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'
import { ALL_MONTH_KEYS, MONTH_LABELS } from '../config/onboardingConfig'
import { fmt } from '../components/TermGraph'

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

const DEFAULT_BURSARY_MONTHS = ['october', 'february', 'march']
const DEFAULT_BURSARY_DATES = {
    october: '2025-10-27',
    february: '2026-02-09',
    march: '2026-03-30',
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

/* ---------- CHEVRON ---------- */

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

/* ---------- MAIN (multi-bursary wrapper) ---------- */

export default function BursaryStep({
    bursaries = [],
    updateBursaries,
    compact = false,
    heading = 'Bursary',
    subtitle = "Scholarships, grants, or uni bursaries you've been awarded.",
}) {
    const [newBursaryId, setNewBursaryId] = useState(null)
    const addBursary = () => {
        const id = `bursary_${Date.now()}`
        setNewBursaryId(id)
        updateBursaries(prev => [...prev, {
            id,
            amount: '',
            months: [...DEFAULT_BURSARY_MONTHS],
            dates: { ...DEFAULT_BURSARY_DATES },
            instalmentAmounts: {},
        }])
        setTimeout(() => setNewBursaryId(null), 400)
    }

    const [removingIdx, setRemovingIdx] = useState(null)
    const [collapsingIdx, setCollapsingIdx] = useState(null)
    const bursaryHeights = useRef({})

    const removeBursary = (idx) => {
        if (bursaries.length <= 1) return
        const el = document.querySelector(`[data-bursary-entry-${idx}]`)
        if (el) bursaryHeights.current[idx] = el.offsetHeight
        setRemovingIdx(idx)
        setTimeout(() => {
            setCollapsingIdx(idx)
            setTimeout(() => {
                setRemovingIdx(null)
                setCollapsingIdx(null)
                delete bursaryHeights.current[idx]
                updateBursaries(prev => prev.filter((_, i) => i !== idx))
            }, 350)
        }, 200)
    }

    const updateBursary = (idx, field, value) => {
        updateBursaries(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '0 24px 12px', flexShrink: 0 }}>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#444', margin: 0, lineHeight: 1.5,
                }}>
                    {subtitle}
                </p>
            </div>
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 24px 0' : '0 24px 24px',
                minHeight: 0,
            }}>
                {bursaries.map((bursary, idx) => {
                    const isRemoving = removingIdx === idx
                    const isCollapsing = collapsingIdx === idx
                    const isNew = bursary.id === newBursaryId
                    return (
                    <div key={bursary.id || idx} data-bursary-entry {...{[`data-bursary-entry-${idx}`]: ''}} style={{
                        marginBottom: isCollapsing ? 0 : 10,
                        ...(isCollapsing ? {
                            maxHeight: 0,
                            opacity: 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.35s ease, margin-bottom 0.35s ease',
                        } : isRemoving ? {
                            maxHeight: (bursaryHeights.current[idx] || 500) + 2,
                            opacity: 0,
                            overflow: 'hidden',
                            transform: 'scale(0.97)',
                            transition: 'opacity 0.2s ease, transform 0.2s ease',
                        } : isNew ? {
                            animation: 'loanFadeIn 0.35s ease',
                        } : {}),
                    }}>
                        {(bursaries.length > 1 || removingIdx !== null) && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                margin: idx === 0 ? '0 0 8px' : '16px 0 8px',
                                maxHeight: (bursaries.length > 1) ? 30 : 0,
                                opacity: (bursaries.length > 1) ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.35s ease, opacity 0.25s ease',
                            }}>
                                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Bursary {idx + 1}</span>
                                <button onClick={() => removeBursary(idx)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#d4566a',
                                }}>Remove</button>
                            </div>
                        )}
                        <BursaryEntry
                            amount={bursary.amount}
                            updateAmount={(val) => updateBursary(idx, 'amount', val)}
                            months={bursary.months}
                            updateMonths={(val) => updateBursary(idx, 'months', val)}
                            dates={bursary.dates}
                            updateDates={(val) => updateBursary(idx, 'dates', val)}
                            instalmentAmounts={bursary.instalmentAmounts}
                            updateInstalmentAmounts={(val) => updateBursary(idx, 'instalmentAmounts', val)}
                            compact
                            scrollOnFocus={idx > 0}
                        />
                    </div>
                )})}
                <button
                    onClick={addBursary}
                    style={{
                        width: '100%', height: 40,
                        background: 'transparent',
                        border: '1.5px dashed #ddd',
                        borderRadius: 14,
                        fontSize: 14, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#147b75', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 6,
                        marginTop: 16,
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add another bursary
                </button>
                <div style={{ height: '15vh', flexShrink: 0 }} />
            </div>
        </div>
    )
}

/* ---------- SINGLE BURSARY ENTRY ---------- */

function BursaryEntry({
    amount,
    updateAmount,
    months: monthsProp,
    updateMonths,
    dates: datesProp,
    updateDates,
    instalmentAmounts,
    updateInstalmentAmounts,
    compact = false,
    scrollOnFocus = false,
}) {
    const [tab, setTab] = useState('yearly')
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const [rawInstalments, setRawInstalments] = useState(() => {
        const obj = {}
        for (const m of (monthsProp || DEFAULT_BURSARY_MONTHS)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        return obj
    })
    useEffect(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [amount])
    useEffect(() => {
        const obj = {}
        for (const m of (monthsProp || DEFAULT_BURSARY_MONTHS)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        setRawInstalments(obj)
    }, [instalmentAmounts])

    const dateActiveRef = useRef(false)
    const amountInputRef = useRef(null)

    const months = (monthsProp || DEFAULT_BURSARY_MONTHS)
        .slice()
        .sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))

    const bursaryDates = datesProp || DEFAULT_BURSARY_DATES

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateAmount(val)
        const numVal = parseFloat(val) || 0
        if (numVal > 0 && months.length > 0) {
            if (tab === 'instalment') {
                const ni = {}, nr = {}
                months.forEach(m => { ni[m] = val; nr[m] = val })
                updateInstalmentAmounts(ni)
                setRawInstalments(nr)
            } else {
                const amounts = splitEvenly(numVal, months.length)
                const ni = {}, nr = {}
                months.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                updateInstalmentAmounts(ni)
                setRawInstalments(nr)
            }
        } else {
            updateInstalmentAmounts({})
            setRawInstalments({})
        }
    }

    const handleInstalmentChange = (month, e) => {
        const val = cleanNum(e.target.value)
        const newInstalments = { ...instalmentAmounts, [month]: val }
        setRawInstalments(prev => ({ ...prev, [month]: val }))
        updateInstalmentAmounts(newInstalments)
        const total = months.reduce((sum, m) => {
            const v = m === month ? val : (instalmentAmounts?.[m] || '')
            return sum + (parseFloat(String(v).replace(/,/g, '')) || 0)
        }, 0)
        const rounded = Math.round(total * 100) / 100
        setRawAmount(String(rounded))
        updateAmount(String(rounded))
    }

    const toggleMonth = (month) => {
        const next = months.includes(month)
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateMonths(next)
        const numVal = parseFloat(String(amount || '').replace(/,/g, '')) || 0
        if (numVal > 0 && next.length > 0) {
            const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
            const ni = {}, nr = {}
            if (tab === 'instalment') {
                sortedNext.forEach(m => { ni[m] = String(numVal); nr[m] = String(numVal) })
            } else {
                const amounts = splitEvenly(numVal, sortedNext.length)
                sortedNext.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
            }
            updateInstalmentAmounts(ni)
            setRawInstalments(nr)
        } else {
            updateInstalmentAmounts({})
            setRawInstalments({})
        }
        if (!next.includes(month) && bursaryDates?.[month]) {
            const { [month]: __, ...restDates } = bursaryDates
            updateDates(restDates)
        }
    }

    const handleDateChange = (month, val) => {
        updateDates({ ...bursaryDates, [month]: val })
    }

    const [customAmounts, setCustomAmounts] = useState(
        () => Object.values(instalmentAmounts || {}).some(v => parseFloat(String(v || '0').replace(/,/g, '')) > 0)
    )

    return (
        <div>
                {/* Amount input with frequency dropdown */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    marginBottom: 16,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        border: '1px solid #e8e8e8', borderRight: 'none',
                        borderRadius: '10px 0 0 10px', background: '#fff',
                        padding: '0 14px', height: 44, gap: 6, flex: 1,
                    }}>
                        <span style={{
                            fontSize: 16, fontWeight: 600,
                            color: '#444', fontFamily: 'Nunito, sans-serif',
                        }}>{getCurrencySymbol()}</span>
                        <input
                            ref={amountInputRef}
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={formatDisplay(rawAmount)}
                            onChange={handleAmountChange}
                            onFocus={scrollOnFocus ? (e) => {
                                const entry = e.target.closest('[data-bursary-entry]')
                                if (entry) setTimeout(() => entry.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
                            } : undefined}
                            style={{
                                flex: 1, border: 'none',
                                background: 'transparent',
                                fontSize: 16, fontWeight: 500,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#000', outline: 'none', padding: 0,
                            }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={tab}
                            onChange={(e) => {
                                const id = e.target.value
                                const ms = months
                                if (id === 'instalment' && tab !== 'instalment') {
                                    const perVal = parseFloat(String(amount || '').replace(/,/g, ''))
                                    if (perVal > 0 && ms.length > 0) {
                                        const ni = {}, nr = {}
                                        ms.forEach(m => { ni[m] = String(perVal); nr[m] = String(perVal) })
                                        updateInstalmentAmounts(ni)
                                        setRawInstalments(nr)
                                    }
                                }
                                if (id === 'yearly' && tab !== 'yearly') {
                                    const yearlyVal = parseFloat(String(amount || '').replace(/,/g, ''))
                                    if (yearlyVal > 0 && ms.length > 0) {
                                        const amounts = splitEvenly(yearlyVal, ms.length)
                                        const ni = {}, nr = {}
                                        ms.forEach((m, idx) => { ni[m] = String(amounts[idx]); nr[m] = String(amounts[idx]) })
                                        updateInstalmentAmounts(ni)
                                        setRawInstalments(nr)
                                    }
                                }
                                setTab(id)
                            }}
                            style={{
                                height: 44, border: '1px solid #e8e8e8',
                                borderRadius: '0 10px 10px 0',
                                padding: '0 28px 0 12px',
                                fontSize: 13, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#147b75', background: 'rgba(20,123,117,0.06)',
                                WebkitAppearance: 'none', appearance: 'none',
                                cursor: 'pointer', outline: 'none',
                            }}
                        >
                            <option value="yearly">Yearly</option>
                            <option value="instalment">Irregular</option>
                        </select>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <path d="M1 1L5 5L9 1" stroke="#147b75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>

                {/* Month selector */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 10px',
                }}>
                    Which months do you receive instalments?
                </p>

                <div style={{
                    border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff',
                    overflow: 'hidden', marginBottom: 16,
                }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                        padding: '14px 12px',
                    }}>
                        {ALL_MONTH_KEYS.map(m => {
                            const selected = months.includes(m)
                            return (
                                <button
                                    key={m}
                                    onClick={() => toggleMonth(m)}
                                    style={{
                                        background: selected ? '#147b75' : '#fff',
                                        color: selected ? '#fff' : '#666',
                                        border: selected ? '1.5px solid #147b75' : '1.5px solid #ddd',
                                        borderRadius: 50,
                                        padding: '8px 0',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: 'none',
                                    }}
                                >
                                    {SHORT_MONTH[m]}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Customise amounts & dates — collapsible card */}
                {months.length > 0 && (
                    <div style={{
                        border: '1px solid #e8e8e8', borderRadius: 12, background: '#fff',
                        overflow: 'hidden', marginBottom: 16,
                    }}>
                        <div
                            onClick={() => {
                                const next = !customAmounts
                                setCustomAmounts(next)
                                if (next && tab !== 'instalment') {
                                    const perVal = parseFloat(String(amount || '').replace(/,/g, ''))
                                    if (perVal > 0 && months.length > 0) {
                                        const ni = {}, nr = {}
                                        months.forEach(m => { ni[m] = String(perVal); nr[m] = String(perVal) })
                                        updateInstalmentAmounts(ni)
                                        setRawInstalments(nr)
                                    }
                                    setTab('instalment')
                                }
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                cursor: 'pointer', padding: '12px 14px',
                            }}
                        >
                            <div>
                                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                    Customise amounts & dates
                                </span>
                                <p style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#999', margin: '2px 0 0' }}>
                                    Optional — set exact amount and date per instalment
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
                            {months.map((m, i) => (
                                <div key={m}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 14px',
                                        borderTop: '1px solid #f3f3f3',
                                    }}>
                                        <span style={{
                                            fontSize: 13, fontWeight: 600,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#888', minWidth: 70,
                                        }}>
                                            {MONTH_LABELS[m]}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 2,
                                                background: '#f8f8f8', borderRadius: 8,
                                                padding: '4px 8px', width: 80, boxSizing: 'border-box',
                                            }}>
                                                <span style={{
                                                    fontSize: 13, fontWeight: 600,
                                                    color: '#999', fontFamily: 'Nunito, sans-serif',
                                                    flexShrink: 0,
                                                }}>{getCurrencySymbol()}</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0.00"
                                                    value={formatDisplay(rawInstalments[m] || '')}
                                                    onChange={(e) => handleInstalmentChange(m, e)}
                                                    style={{
                                                        flex: 1, border: 'none',
                                                        background: 'transparent',
                                                        fontSize: 13, fontWeight: 600,
                                                        fontFamily: 'Nunito, sans-serif',
                                                        color: '#000', outline: 'none',
                                                        padding: 0, textAlign: 'left',
                                                    }}
                                                />
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{
                                                    fontSize: 13, fontWeight: 600,
                                                    color: '#888',
                                                    fontFamily: 'Nunito, sans-serif',
                                                    pointerEvents: 'none',
                                                    background: '#f8f8f8',
                                                    padding: '4px 10px',
                                                    borderRadius: 8,
                                                    display: 'inline-block',
                                                    whiteSpace: 'nowrap',
                                                    minWidth: 80,
                                                    textAlign: 'center',
                                                }}>
                                                    {bursaryDates?.[m] ? fmt(bursaryDates[m]) : 'Set date'}
                                                </span>
                                                <input
                                                    type="date"
                                                    value={bursaryDates?.[m] || getMonthRange(m).min}
                                                    min={getMonthRange(m).min}
                                                    max={getMonthRange(m).max}
                                                    onFocus={() => { dateActiveRef.current = true }}
                                                    onBlur={() => { dateActiveRef.current = false }}
                                                    onChange={(e) => e.target.value && handleDateChange(m, e.target.value)}
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
                                                    opacity: months.length > 1 ? 0.4 : 0.15,
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
                        </div>
                    </div>
                )}

        </div>
    )
}
