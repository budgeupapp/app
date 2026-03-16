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

/* ---------- MAIN ---------- */

export default function BursaryStep({
    bursaryAmount,
    updateBursaryAmount,
    bursaryMonths,
    updateBursaryMonths,
    bursaryDates,
    updateBursaryDates,
    bursaryInstalmentAmounts,
    updateBursaryInstalmentAmounts,
    compact = false,
    heading = 'Bursary',
    subtitle = "Scholarships, grants, or uni bursaries you've been awarded.",
}) {
    const [tab, setTab] = useState('yearly')
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(bursaryAmount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const [rawInstalments, setRawInstalments] = useState(() => {
        const obj = {}
        for (const m of (bursaryMonths || DEFAULT_BURSARY_MONTHS)) {
            const existing = bursaryInstalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        return obj
    })
    useEffect(() => {
        const n = parseFloat(String(bursaryAmount || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [bursaryAmount])
    useEffect(() => {
        const obj = {}
        for (const m of (bursaryMonths || DEFAULT_BURSARY_MONTHS)) {
            const existing = bursaryInstalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        setRawInstalments(obj)
    }, [bursaryInstalmentAmounts])
    const [datesExpanded, setDatesExpanded] = useState(false)
    const [inputFocused, setInputFocused] = useState(false)
    const scrollRef = useRef(null)
    const blurTimerRef = useRef(null)
    const datesBoxRef = useRef(null)
    const dateActiveRef = useRef(false)
    const amountInputRef = useRef(null)

    const months = (bursaryMonths || DEFAULT_BURSARY_MONTHS)
        .slice()
        .sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))

    const questionRef = useRef(null)
    const touchStartRef = useRef(null)

    const handleInputTouchStart = (e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const handleInputTouchEnd = (e) => {
        if (!touchStartRef.current) return
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y
        touchStartRef.current = null
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
        if (!compact) return
        const input = e.target
        input.focus({ preventScroll: true })
        const label = questionRef.current
        if (!label) return
        let scrollParent = label.parentElement
        while (scrollParent) {
            const style = window.getComputedStyle(scrollParent)
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scrollParent.scrollHeight > scrollParent.clientHeight) break
            scrollParent = scrollParent.parentElement
        }
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect()
            const labelRect = label.getBoundingClientRect()
            const offset = labelRect.top - parentRect.top + scrollParent.scrollTop
            const stickyHeader = scrollParent.querySelector('[data-sticky-header]')
            const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
            scrollParent.scrollTo({ top: Math.max(0, offset - headerH - 8), behavior: 'smooth' })
        }
    }

    const scrollInputToTop = (e) => {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
        const input = e.target
        setInputFocused(true)
        if (compact) return
        setTimeout(() => {
            const container = scrollRef.current
            if (!container) return
            const containerRect = container.getBoundingClientRect()
            const inputRect = input.getBoundingClientRect()
            const scrollOffset = inputRect.top - containerRect.top + container.scrollTop
            container.scrollTo({ top: Math.max(0, scrollOffset - 30), behavior: 'smooth' })
        }, 301)
    }

    const handleInputBlur = () => {
        blurTimerRef.current = setTimeout(() => {
            if (dateActiveRef.current) { setInputFocused(false); return }
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            setTimeout(() => { if (!dateActiveRef.current) setInputFocused(false) }, 500)
        }, 50)
    }

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateBursaryAmount(val)
        // Recalculate instalments from new yearly total
        const yearlyVal = parseFloat(val) || 0
        if (yearlyVal > 0 && months.length > 0) {
            const amounts = splitEvenly(yearlyVal, months.length)
            const newInstalments = {}
            const newRaw = {}
            months.forEach((m, i) => {
                newInstalments[m] = String(amounts[i])
                newRaw[m] = String(amounts[i])
            })
            updateBursaryInstalmentAmounts(newInstalments)
            setRawInstalments(newRaw)
        } else {
            updateBursaryInstalmentAmounts({})
            setRawInstalments({})
        }
    }

    const handleInstalmentChange = (month, e) => {
        const val = cleanNum(e.target.value)
        const newInstalments = { ...bursaryInstalmentAmounts, [month]: val }
        setRawInstalments(prev => ({ ...prev, [month]: val }))
        updateBursaryInstalmentAmounts(newInstalments)
        // Update yearly total to sum of all instalments
        const total = months.reduce((sum, m) => {
            const v = m === month ? val : (bursaryInstalmentAmounts?.[m] || '')
            return sum + (parseFloat(String(v).replace(/,/g, '')) || 0)
        }, 0)
        const rounded = Math.round(total * 100) / 100
        setRawAmount(String(rounded))
        updateBursaryAmount(String(rounded))
    }

    const toggleMonth = (month) => {
        const next = months.includes(month)
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateBursaryMonths(next)
        // Redistribute yearly total equally among new month set
        const yearlyVal = parseFloat(String(bursaryAmount || '').replace(/,/g, '')) || 0
        if (yearlyVal > 0 && next.length > 0) {
            const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
            const amounts = splitEvenly(yearlyVal, sortedNext.length)
            const newInstalments = {}
            const newRaw = {}
            sortedNext.forEach((m, i) => {
                newInstalments[m] = String(amounts[i])
                newRaw[m] = String(amounts[i])
            })
            updateBursaryInstalmentAmounts(newInstalments)
            setRawInstalments(newRaw)
        } else {
            updateBursaryInstalmentAmounts({})
            setRawInstalments({})
        }
        // Clean up stale dates for removed months
        if (!next.includes(month) && bursaryDates?.[month]) {
            const { [month]: __, ...restDates } = bursaryDates
            updateBursaryDates(restDates)
        }
    }

    const handleDateChange = (month, val) => {
        updateBursaryDates({ ...bursaryDates, [month]: val })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && (
                <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                    <h2 style={{
                        fontSize: 25, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                    }}>
                        {heading}
                    </h2>
                    <p style={{
                        fontSize: 15, fontFamily: 'Nunito, sans-serif',
                        color: '#444', margin: '0 0 16px', lineHeight: 1.5,
                    }}>
                        {subtitle}
                    </p>
                </div>
            )}

            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 24px 0' : '0 24px 24px',
                marginBottom: -5,
                minHeight: 0,
            }} ref={scrollRef}>
                {/* Tab switcher */}
                {(() => {
                    const tabs = [
                        { id: 'yearly', label: 'Year Total' },
                        { id: 'instalment', label: 'Per Instalment' },
                    ]
                    const activeIndex = tabs.findIndex(t => t.id === tab)
                    return (
                        <div style={{
                            display: 'flex', width: '100%', position: 'relative',
                            background: '#fff', borderRadius: 50, padding: 3,
                            marginBottom: 20, flexShrink: 0,
                            border: '1px solid #f0f0f0',
                        }}>
                            <div style={{
                                position: 'absolute', top: 3, bottom: 3,
                                left: `calc(${(activeIndex / 2) * 100}% + 3px)`,
                                width: `calc(50% - 4px)`,
                                background: '#147b75', borderRadius: 50,
                                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            }} />
                            {tabs.map(({ id, label }) => (
                                <div
                                    key={id}
                                    onClick={() => {
                                        const ms = (bursaryMonths || DEFAULT_BURSARY_MONTHS)
                                            .slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                                        if (id === 'instalment' && tab !== 'instalment') {
                                            const yearlyVal = parseFloat(String(bursaryAmount || '').replace(/,/g, ''))
                                            if (yearlyVal > 0 && ms.length > 0) {
                                                const amounts = splitEvenly(yearlyVal, ms.length)
                                                const newInstalments = {}
                                                const newRaw = {}
                                                ms.forEach((m, i) => {
                                                    newInstalments[m] = String(amounts[i])
                                                    newRaw[m] = String(amounts[i])
                                                })
                                                updateBursaryInstalmentAmounts(newInstalments)
                                                setRawInstalments(newRaw)
                                            }
                                        }
                                        if (id === 'yearly' && tab !== 'yearly') {
                                            const total = ms.reduce((sum, m) => {
                                                return sum + (parseFloat(String(bursaryInstalmentAmounts?.[m] || '').replace(/,/g, '')) || 0)
                                            }, 0)
                                            if (total > 0) {
                                                const rounded = Math.round(total * 100) / 100
                                                setRawAmount(String(rounded))
                                                updateBursaryAmount(String(rounded))
                                            }
                                        }
                                        setTab(id)
                                    }}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        padding: '8px 0', borderRadius: 50, cursor: 'pointer',
                                        position: 'relative', zIndex: 1,
                                        color: tab === id ? '#fff' : '#1a1a1a',
                                        fontSize: 13, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        transition: tab === id ? 'color 0.12s ease 0.12s' : 'color 0.15s ease 0.15s',
                                    }}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    )
                })()}

                {/* Year Total */}
                {tab === 'yearly' && (
                    <>
                        <p ref={questionRef} style={{
                            fontSize: 14, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#000', margin: '0 0 8px',
                        }}>
                            Yearly bursary amount
                        </p>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center',
                            border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff',
                            padding: '0 14px', height: 38, gap: 6,
                            marginBottom: 20, width: 160,
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
                                onTouchStart={handleInputTouchStart}
                                onTouchEnd={handleInputTouchEnd}
                                onFocus={scrollInputToTop}
                                onBlur={handleInputBlur}
                                style={{
                                    flex: 1, border: 'none',
                                    background: 'transparent',
                                    fontSize: 16, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', outline: 'none', padding: 0,
                                }}
                            />
                        </div>
                    </>
                )}

                {/* Instalments section */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 10px',
                }}>
                    {tab === 'instalment' ? 'Instalment months & amounts' : 'Which months do you receive instalments?'}
                </p>

                <div style={{
                    border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff',
                    overflow: 'hidden',
                    marginBottom: 16,
                }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                        padding: '10px 12px',
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

                    {tab === 'instalment' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            {months.map((m) => (
                                <div key={m} style={{
                                    display: 'flex', alignItems: 'center',
                                    background: '#fff', borderRadius: 10,
                                    border: '1px solid #e8e8e8',
                                    padding: '0 14px', height: 44,
                                    gap: 8,
                                }}>
                                    <span style={{
                                        fontSize: 13, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#147b75', minWidth: 32,
                                    }}>
                                        {SHORT_MONTH[m]}
                                    </span>
                                    <div style={{ width: 1, height: 20, background: '#e8e8e8' }} />
                                    <span style={{
                                        fontSize: 15, fontWeight: 600,
                                        color: '#888', fontFamily: 'Nunito, sans-serif',
                                    }}>{getCurrencySymbol()}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={formatDisplay(rawInstalments[m] || '')}
                                        onChange={(e) => handleInstalmentChange(m, e)}
                                        onTouchStart={handleInputTouchStart}
                                        onFocus={scrollInputToTop}
                                        onBlur={handleInputBlur}
                                        style={{
                                            flex: 1, border: 'none',
                                            background: 'transparent',
                                            fontSize: 15, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none',
                                            padding: 0,
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Payment dates accordion */}
                    <div
                        ref={datesBoxRef}
                        onClick={() => {
                            const next = !datesExpanded
                            setDatesExpanded(next)
                            if (next) {
                                setTimeout(() => {
                                    const container = scrollRef.current
                                    const box = datesBoxRef.current
                                    if (!container || !box) return
                                    const containerRect = container.getBoundingClientRect()
                                    const boxRect = box.getBoundingClientRect()
                                    const scrollOffset = boxRect.top - containerRect.top + container.scrollTop
                                    container.scrollTo({ top: Math.max(0, scrollOffset - 2), behavior: 'smooth' })
                                }, 320)
                            }
                        }}
                        style={{
                            padding: '14px 12px 12px',
                            cursor: 'pointer',
                            marginTop: 12,
                            borderTop: '1px solid #eee',
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: 14, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', margin: 0,
                                }}>
                                    I know the exact payment dates
                                </p>
                                <p style={{
                                    fontSize: 10, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#444', margin: '2px 0 0',
                                }}>
                                    Optional – improves accuracy
                                </p>
                            </div>
                            <Chevron open={datesExpanded} />
                        </div>

                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                maxHeight: datesExpanded ? 500 : 0,
                                opacity: datesExpanded ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.3s ease, opacity 0.2s ease',
                            }}
                        >
                            <div style={{
                                marginTop: 10,
                                display: 'flex', flexDirection: 'column', gap: 8,
                            }}>
                                {months.map(m => (
                                    <div key={m} style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '6px 0',
                                    }}>
                                        <span style={{
                                            fontSize: 13, color: '#888',
                                            fontWeight: 600,
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>
                                            {MONTH_LABELS[m]}
                                        </span>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 700,
                                                color: '#147b75',
                                                fontFamily: 'Nunito, sans-serif',
                                                pointerEvents: 'none',
                                                background: 'rgba(20,123,117,0.08)',
                                                padding: '3px 10px',
                                                borderRadius: 8,
                                                display: 'inline-block',
                                                pointerEvents: 'none',
                                            }}>
                                                {(bursaryDates?.[m] || DEFAULT_BURSARY_DATES[m]) ? fmt(bursaryDates?.[m] || DEFAULT_BURSARY_DATES[m]) : 'Select date'}
                                            </span>
                                            <input
                                                type="date"
                                                value={bursaryDates?.[m] || DEFAULT_BURSARY_DATES[m] || getMonthRange(m).min}
                                                min={getMonthRange(m).min}
                                                max={getMonthRange(m).max}
                                                onFocus={() => {
                                                    dateActiveRef.current = true
                                                    const container = scrollRef.current
                                                    if (container) {
                                                        const pos = container.scrollTop
                                                        requestAnimationFrame(() => { container.scrollTop = pos })
                                                    }
                                                }}
                                                onBlur={() => { dateActiveRef.current = false }}
                                                onChange={(e) => e.target.value && handleDateChange(m, e.target.value)}
                                                style={{
                                                    position: 'absolute', inset: 0,
                                                    opacity: 0, width: '100%', height: '100%',
                                                    cursor: 'pointer', fontSize: 16,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                {inputFocused && !compact && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
