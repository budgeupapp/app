import { useState, useRef } from 'react'
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
    return v
}

const FREQ_OPTIONS = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'termly', label: 'Termly' },
]

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

/* ---------- MAIN ---------- */

export default function RentStep({
    rentAmount,
    updateRentAmount,
    rentFrequency,
    updateRentFrequency,
    rentNextDate,
    updateRentNextDate,
}) {
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(rentAmount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const [datesExpanded, setDatesExpanded] = useState(!!rentNextDate)
    const [inputFocused, setInputFocused] = useState(false)
    const scrollRef = useRef(null)
    const blurTimerRef = useRef(null)

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

    const handleInputBlur = () => {
        blurTimerRef.current = setTimeout(() => {
            setInputFocused(false)
            setTimeout(() => {
                scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    Accommodation rent
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                }}>
                    Include your total rent amount — we'll work out the rest.
                </p>
            </div>

            {/* Scrollable content */}
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 24px 16px',
                display: 'flex', flexDirection: 'column',
            }} ref={scrollRef}>
                {/* Amount input */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px',
                }}>
                    Rent amount
                </p>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid #e8e8e8', borderRadius: 10,
                    padding: '0 14px', height: 38, gap: 6,
                    marginBottom: 20,
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

                {/* Frequency */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 10px',
                }}>
                    How often do you pay?
                </p>
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8,
                    marginBottom: 20,
                }}>
                    {FREQ_OPTIONS.map(({ id, label }) => {
                        const selected = rentFrequency === id
                        return (
                            <button
                                key={id}
                                onClick={() => updateRentFrequency(id)}
                                style={{
                                    background: selected ? '#147b75' : '#fff',
                                    color: selected ? '#fff' : '#5e5e5e',
                                    border: selected ? 'none' : '1px solid #e8e8e8',
                                    borderRadius: 10,
                                    padding: '7px 15px',
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

                {/* Next payment date accordion */}
                <div style={{
                    border: '1px solid #e8e8e8', borderRadius: 10,
                    padding: '12px 12px 8px',
                }}>
                    <div
                        onClick={() => {
                            const next = !datesExpanded
                            setDatesExpanded(next)
                            if (next) {
                                setTimeout(() => {
                                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
                                }, 50)
                            }
                        }}
                        style={{
                            background: 'rgba(20,123,117,0.1)',
                            borderRadius: 10, padding: '10px 12px',
                            cursor: 'pointer',
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

                        {datesExpanded && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ marginTop: 10 }}
                            >
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '5px 12px',
                                        pointerEvents: 'none',
                                    }}>
                                        <span style={{
                                            fontSize: 12, color: '#9f9c9c',
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>
                                            Next payment
                                        </span>
                                        <span style={{
                                            fontSize: 13, fontWeight: 600,
                                            color: '#147b75',
                                            borderBottom: '1px dotted rgba(20,123,117,0.45)',
                                            paddingBottom: 1,
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>
                                            {rentNextDate ? fmt(rentNextDate) : 'Select date'}
                                        </span>
                                    </div>
                                    <input
                                        type="date"
                                        value={rentNextDate || ''}
                                        onChange={(e) => e.target.value && updateRentNextDate(e.target.value)}
                                        style={{
                                            position: 'absolute', inset: 0,
                                            opacity: 0, width: '100%', height: '100%',
                                            cursor: 'pointer', fontSize: 16,
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {inputFocused && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
