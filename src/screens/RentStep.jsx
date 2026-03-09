import { useState, useRef, useEffect } from 'react'
import { fmt } from '../components/TermGraph'

/* ---------- HELPERS ---------- */

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

const FREQ_OPTIONS = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'termly', label: 'Per Term' },
]

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']

/* ---------- CHEVRON ---------- */

function Chevron({ open }) {
    return (
        <svg width="18" height="15" viewBox="0 0 18 15" fill="none" style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
        }}>
            <path d="M4 5.5L9 10.5L14 5.5" stroke="#9f9c9c"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ---------- DATE ROW ---------- */

function DateRow({ label, value, onChange, onDateTap, scrollRef }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 0',
        }}>
            <span style={{
                fontSize: 12, color: '#9f9c9c',
                fontFamily: 'Nunito, sans-serif',
            }}>
                {label}
            </span>
            <div style={{ position: 'relative' }}>
                <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: '#e06470',
                    borderBottom: '1px dotted rgba(224,100,112,0.45)',
                    paddingBottom: 1,
                    fontFamily: 'Nunito, sans-serif',
                    pointerEvents: 'none',
                }}>
                    {value ? fmt(value) : 'Select date'}
                </span>
                <input
                    type="date"
                    value={value || ''}
                    onFocus={() => {
                        onDateTap?.(true)
                        // Save scroll position and restore after browser auto-scrolls
                        const container = scrollRef?.current
                        if (container) {
                            const pos = container.scrollTop
                            requestAnimationFrame(() => {
                                container.scrollTop = pos
                            })
                        }
                    }}
                    onBlur={() => onDateTap?.(false)}
                    onChange={(e) => e.target.value && onChange(e.target.value)}
                    style={{
                        position: 'absolute', inset: 0,
                        opacity: 0, width: '100%', height: '100%',
                        cursor: 'pointer', fontSize: 16,
                    }}
                />
            </div>
        </div>
    )
}

/* ---------- MAIN ---------- */

export default function RentStep({
    rentAmount,
    updateRentAmount,
    rentFrequency,
    updateRentFrequency,
    rentNextDate,
    updateRentNextDate,
    rentEntryMode,
    updateRentEntryMode,
    terms,
    rentTermDates,
    updateRentTermDates,
    rentQuarterlyDates,
    updateRentQuarterlyDates,
    compact = false,
}) {
    const tab = rentEntryMode || 'per_payment'
    const [rawYearly, setRawYearly] = useState(() => {
        if (tab === 'yearly') {
            const n = parseFloat(String(rentAmount || '').replace(/,/g, ''))
            return n ? String(n) : ''
        }
        return ''
    })
    const [rawPerPayment, setRawPerPayment] = useState(() => {
        if (tab !== 'yearly') {
            const n = parseFloat(String(rentAmount || '').replace(/,/g, ''))
            return n ? String(n) : ''
        }
        return ''
    })
    const rawAmount = tab === 'yearly' ? rawYearly : rawPerPayment
    const setRawAmount = tab === 'yearly' ? setRawYearly : setRawPerPayment
    const [datesExpanded, setDatesExpanded] = useState(!!rentNextDate)
    const [inputFocused, setInputFocused] = useState(false)
    const scrollRef = useRef(null)
    const blurTimerRef = useRef(null)
    const datesBoxRef = useRef(null)
    const freqBoxRef = useRef(null)
    const freqContainerRef = useRef(null)
    const preMultiScrollRef = useRef(0)

    const isMultiDate = rentFrequency === 'quarterly' || rentFrequency === 'termly'

    const scrollInputToTop = (e) => {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
        const input = e.target
        setInputFocused(true)
        setTimeout(() => {
            const container = scrollRef.current
            if (!container) return
            const containerRect = container.getBoundingClientRect()
            const inputRect = input.getBoundingClientRect()
            const scrollOffset = inputRect.top - containerRect.top + container.scrollTop
            container.scrollTo({ top: Math.max(0, scrollOffset - 20), behavior: 'smooth' })
        }, 301)
    }

    const dateActiveRef = useRef(false)
    const freqTapRef = useRef(false)

    const handleInputBlur = () => {
        blurTimerRef.current = setTimeout(() => {
            if (dateActiveRef.current || freqTapRef.current) {
                setInputFocused(false)
                freqTapRef.current = false
                return
            }
            setInputFocused(false)
            setTimeout(() => {
                if (!dateActiveRef.current) {
                    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                }
            }, 100)
        }, 50)
    }

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateRentAmount(val)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Title */}
            {!compact && (
            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    Rent
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                }}>
                    How much do you pay in rent? A rough estimate is fine!
                </p>
            </div>
            )}

            {/* Scrollable content */}
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 24px 16px',
                display: 'flex', flexDirection: 'column',
            }} ref={scrollRef}>
                {/* Tab switcher */}
                <div style={{
                    background: '#f3f3f3', borderRadius: 10,
                    padding: 3, display: 'flex', gap: 0,
                    marginBottom: 20, flexShrink: 0,
                }}>
                    {[
                        { id: 'yearly', label: 'Year Total' },
                        { id: 'per_payment', label: 'Per Payment' },
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => {
                                updateRentEntryMode(id)
                                if (id === 'yearly') {
                                    updateRentAmount(rawYearly || '')
                                } else {
                                    updateRentAmount(rawPerPayment || '')
                                }
                            }}
                            style={{
                                flex: 1, height: 36, border: 'none',
                                borderRadius: 10, cursor: 'pointer',
                                background: tab === id ? '#fff' : 'transparent',
                                color: tab === id ? '#000' : '#838383',
                                fontSize: 14, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                transition: 'background 0.2s ease, color 0.2s ease',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Amount input */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px',
                }}>
                    {tab === 'yearly' ? 'What is your total yearly rent?' : 'How much is each payment?'}
                </p>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid #e8e8e8', borderRadius: 10,
                    padding: '0 14px', height: 38, gap: 6,
                    marginBottom: 20, maxWidth: 160,
                }}>
                    <span style={{
                        fontSize: 16, fontWeight: 600,
                        color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                    }}>£</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formatDisplay(rawAmount)}
                        onChange={handleAmountChange}
                        onFocus={scrollInputToTop}
                        onBlur={handleInputBlur}
                        style={{
                            flex: 1, border: 'none',
                            background: 'transparent',
                            fontSize: 16, fontWeight: 500,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#000', outline: 'none', padding: 0,
                            height: 50,
                        }}
                    />
                </div>

                {/* Payment schedule */}
                <p ref={freqBoxRef} style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 10px',
                }}>
                    How often do you pay?
                </p>
                <div ref={freqContainerRef} style={{
                    border: '1px solid #e8e8e8', borderRadius: 10,
                }}>
                    {/* Frequency pills */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8,
                        padding: '10px 12px',
                    }}>
                        {FREQ_OPTIONS.map(({ id, label }) => {
                            const selected = rentFrequency === id
                            return (
                                <button
                                    key={id}
                                    onClick={() => {
                                        freqTapRef.current = true
                                        const wasMultiDate = rentFrequency === 'quarterly' || rentFrequency === 'termly'
                                        const goingMultiDate = id === 'quarterly' || id === 'termly'
                                        const container = scrollRef.current

                                        // Save scroll position before state change
                                        const savedScroll = container ? container.scrollTop : 0

                                        updateRentFrequency(id)
                                        if (id === 'quarterly' && !rentQuarterlyDates?.[0]) {
                                            const defaults = {}
                                            QUARTER_DEFAULTS.forEach((d, i) => { defaults[i] = d })
                                            updateRentQuarterlyDates(defaults)
                                        }

                                        if (goingMultiDate && !wasMultiDate) {
                                            // Entering multi-date: save position and scroll up
                                            preMultiScrollRef.current = savedScroll
                                            setTimeout(() => {
                                                const el = freqBoxRef.current
                                                if (!container || !el) return
                                                const containerRect = container.getBoundingClientRect()
                                                const elRect = el.getBoundingClientRect()
                                                const offset = elRect.top - containerRect.top + container.scrollTop
                                                container.scrollTo({ top: Math.max(0, offset - 10), behavior: 'smooth' })
                                            }, 50)
                                        } else if (!goingMultiDate && wasMultiDate) {
                                            // Leaving multi-date: scroll so entire box visible
                                            setTimeout(() => {
                                                const box = freqContainerRef.current
                                                if (!container || !box) return
                                                const containerRect = container.getBoundingClientRect()
                                                const boxRect = box.getBoundingClientRect()
                                                const boxBottom = boxRect.bottom - containerRect.top + container.scrollTop
                                                const visibleHeight = containerRect.height
                                                const targetScroll = Math.max(0, boxBottom - visibleHeight + 10)
                                                container.scrollTo({ top: targetScroll, behavior: 'smooth' })
                                            }, 50)
                                        } else if (!goingMultiDate && !wasMultiDate) {
                                            // weekly/monthly: scroll so entire box visible
                                            setTimeout(() => {
                                                const box = freqContainerRef.current
                                                if (!container || !box) return
                                                const containerRect = container.getBoundingClientRect()
                                                const boxRect = box.getBoundingClientRect()
                                                const boxBottom = boxRect.bottom - containerRect.top + container.scrollTop
                                                const visibleHeight = containerRect.height
                                                const targetScroll = Math.max(0, boxBottom - visibleHeight + 10)
                                                container.scrollTo({ top: targetScroll, behavior: 'smooth' })
                                            }, 50)
                                        } else {
                                            // Same group (multi-date): preserve scroll position
                                            requestAnimationFrame(() => {
                                                if (container) container.scrollTop = savedScroll
                                            })
                                        }
                                    }}
                                    style={{
                                        background: selected ? '#e06470' : '#f5f5f5',
                                        color: selected ? '#fff' : '#aaa',
                                        border: 'none',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease, color 0.15s ease',
                                    }}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Date section — varies by frequency */}
                    <div
                        ref={datesBoxRef}
                        onClick={() => {
                            if (isMultiDate) return // always expanded for quarterly/termly
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
                            background: 'rgba(224,100,112,0.1)',
                            borderRadius: '0 0 10px 10px',
                            padding: '10px 12px',
                            cursor: isMultiDate ? 'default' : 'pointer',
                        }}
                    >
                        {/* Weekly / Monthly: single next-date accordion */}
                        {!isMultiDate && (
                            <>
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
                                            I know my next payment date
                                        </p>
                                        <p style={{
                                            fontSize: 10, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#5e5e5e', margin: '2px 0 0',
                                        }}>
                                            Optional – helps us forecast your budget more accurately
                                        </p>
                                    </div>
                                    <Chevron open={datesExpanded} />
                                </div>

                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        maxHeight: datesExpanded ? 200 : 0,
                                        opacity: datesExpanded ? 1 : 0,
                                        overflow: 'hidden',
                                        transition: 'max-height 0.3s ease, opacity 0.2s ease',
                                    }}
                                >
                                    <div style={{ marginTop: 10 }}>
                                        <DateRow
                                            label="Next payment"
                                            value={rentNextDate}
                                            onChange={updateRentNextDate}
                                            onDateTap={(active) => { dateActiveRef.current = active }}
                                            scrollRef={scrollRef}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Termly: one row per term */}
                        {rentFrequency === 'termly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{
                                        fontSize: 14, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#000', margin: 0,
                                    }}>
                                        Payment dates
                                    </p>
                                    {rentTermDates && Object.keys(rentTermDates).length > 0 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); updateRentTermDates({}) }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                padding: 4, display: 'flex', alignItems: 'center',
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
                                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{
                                    fontSize: 10, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#5e5e5e', margin: '0 0 8px',
                                }}>
                                    Defaults to your term start dates — tap to change
                                </p>
                                <div style={{
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                }}>
                                    {(terms || []).map(term => (
                                        <DateRow
                                            key={term.id}
                                            label={term.name}
                                            value={rentTermDates?.[term.id] || term.start}
                                            onChange={(val) => updateRentTermDates({ ...rentTermDates, [term.id]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }}
                                            scrollRef={scrollRef}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Quarterly: 4 date rows */}
                        {rentFrequency === 'quarterly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{
                                        fontSize: 14, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#000', margin: 0,
                                    }}>
                                        Payment dates
                                    </p>
                                    {rentQuarterlyDates && Object.values(rentQuarterlyDates).some((v, i) => v !== QUARTER_DEFAULTS[i]) && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                const defaults = {}
                                                QUARTER_DEFAULTS.forEach((d, i) => { defaults[i] = d })
                                                updateRentQuarterlyDates(defaults)
                                            }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                padding: 4, display: 'flex', alignItems: 'center',
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
                                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{
                                    fontSize: 10, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#5e5e5e', margin: '0 0 8px',
                                }}>
                                    When is each quarterly payment due?
                                </p>
                                <div style={{
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                }}>
                                    {QUARTER_LABELS.map((label, i) => (
                                        <DateRow
                                            key={i}
                                            label={label}
                                            value={rentQuarterlyDates?.[i] || QUARTER_DEFAULTS[i]}
                                            onChange={(val) => updateRentQuarterlyDates({ ...rentQuarterlyDates, [i]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }}
                                            scrollRef={scrollRef}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
                {inputFocused && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
