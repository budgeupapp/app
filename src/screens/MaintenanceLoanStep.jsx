import { useState, useRef } from 'react'
import { DEFAULT_LOAN_MONTHS, ALL_MONTH_KEYS, MONTH_LABELS } from '../config/onboardingConfig'
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

/* Short month label for instalment rows */
const SHORT_MONTH = {
    september: 'Sept', october: 'Oct', november: 'Nov', december: 'Dec',
    january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
    may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
}

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

export default function MaintenanceLoanStep({
    loanAmount,
    updateLoanAmount,
    loanMonths,
    updateLoanMonths,
    loanKnowDates,
    updateLoanKnowDates,
    loanDates,
    updateLoanDates,
    instalmentAmounts,
    updateInstalmentAmounts,
}) {
    const [tab, setTab] = useState('yearly') // 'yearly' | 'instalment'
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(loanAmount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const [rawInstalments, setRawInstalments] = useState(() => {
        const obj = {}
        for (const m of (loanMonths || DEFAULT_LOAN_MONTHS)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        return obj
    })
    const [showMonthPicker, setShowMonthPicker] = useState(false)
    const [datesExpanded, setDatesExpanded] = useState(false)
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
            container.scrollTo({ top: Math.max(0, scrollOffset - 30), behavior: 'smooth' })
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

    const months = loanMonths || DEFAULT_LOAN_MONTHS

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateLoanAmount(val)
    }

    const handleInstalmentChange = (month, e) => {
        const val = cleanNum(e.target.value)
        setRawInstalments(prev => ({ ...prev, [month]: val }))
        updateInstalmentAmounts({ ...instalmentAmounts, [month]: val })
    }

    const toggleMonth = (month) => {
        const next = months.includes(month)
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateLoanMonths(next)
        // Clean up instalment amounts and stale dates for removed months
        if (!next.includes(month)) {
            const { [month]: _, ...rest } = rawInstalments
            setRawInstalments(rest)
            if (loanDates?.[month]) {
                const { [month]: __, ...restDates } = loanDates
                updateLoanDates(restDates)
            }
        }
    }

    const handleDateChange = (month, val) => {
        updateLoanDates({ ...loanDates, [month]: val })
    }

    const availableMonths = ALL_MONTH_KEYS.filter(m => !months.includes(m))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Title */}
            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    Maintenance loan
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                }}>
                    A rough estimate is fine!{' '}
                    <span
                        onClick={() => window.open('https://www.gov.uk/student-finance/new-fulltime-students', '_blank')}
                        style={{
                            color: '#147b75', fontWeight: 500,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                        }}
                    >Click here</span> for a guide.
                </p>
            </div>

            {/* Scrollable content */}
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 24px 24px',
                minHeight: 0,
            }} ref={scrollRef}>
                {/* Tab switcher */}
                <div style={{
                    background: '#f3f3f3', borderRadius: 10,
                    padding: 3, display: 'flex', gap: 0,
                    marginBottom: 20, flexShrink: 0,
                }}>
                    {[
                        { id: 'yearly', label: 'Year Total' },
                        { id: 'instalment', label: 'Per Instalment' },
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
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

                {/* Year Total tab content */}
                {tab === 'yearly' && (
                    <>
                        <p style={{
                            fontSize: 14, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#000', margin: '0 0 8px',
                        }}>
                            What is your total yearly student loan?
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
                                    height: 50
                                }}
                            />
                        </div>
                    </>
                )}

                {/* Months section (both tabs) */}
                <p style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 10px',
                }}>
                    Which months do you receive instalments?
                </p>

                {/* Instalment section wrapper */}
                <div style={{
                    border: '1px solid #e8e8e8', borderRadius: 10,
                    padding: '12px 12px 8px',
                    marginBottom: 16,
                }}>
                    {/* Selected month pills */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8,
                        marginBottom: 10,
                    }}>
                        {months.map(m => (
                            <button
                                key={m}
                                onClick={() => toggleMonth(m)}
                                style={{
                                    background: '#147b75', color: '#fff',
                                    border: 'none', borderRadius: 10,
                                    padding: '7px 15px',
                                    fontSize: 12, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    cursor: 'pointer',
                                }}
                            >
                                {MONTH_LABELS[m]}
                            </button>
                        ))}

                        {/* + Different months button */}
                        <button
                            onClick={() => setShowMonthPicker(!showMonthPicker)}
                            style={{
                                background: 'transparent',
                                border: '1px dashed #dbdbdb',
                                borderRadius: 10,
                                padding: '7px 12px',
                                fontSize: 12, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#8d8d8d', cursor: 'pointer',
                            }}
                        >
                            + Different months
                        </button>
                    </div>

                    {/* Month picker dropdown */}
                    {showMonthPicker && availableMonths.length > 0 && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 6,
                            padding: '8px 0',
                            borderTop: '1px solid #f3f3f3',
                            marginBottom: 4,
                        }}>
                            {availableMonths.map(m => (
                                <button
                                    key={m}
                                    onClick={() => toggleMonth(m)}
                                    style={{
                                        background: '#f7f7f7', color: '#5e5e5e',
                                        border: 'none', borderRadius: 8,
                                        padding: '5px 12px',
                                        fontSize: 11, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {MONTH_LABELS[m]}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Payment dates accordion */}
                    <div
                        onClick={() => {
                            const next = !datesExpanded
                            setDatesExpanded(next)
                            if (next) {
                                updateLoanKnowDates(true)
                                setTimeout(() => {
                                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
                                }, 50)
                            }
                        }}
                        style={{
                            background: 'rgba(20,123,117,0.1)',
                            borderRadius: 10, padding: '10px 12px',
                            cursor: 'pointer',
                            marginTop: 4,
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
                                style={{
                                    marginTop: 10,
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                }}
                            >
                                {months.map(m => (
                                    <div key={m} style={{ position: 'relative' }}>
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
                                                {MONTH_LABELS[m]}
                                            </span>
                                            <span style={{
                                                fontSize: 13, fontWeight: 600,
                                                color: '#147b75',
                                                borderBottom: '1px dotted rgba(20,123,117,0.45)',
                                                paddingBottom: 1,
                                                fontFamily: 'Nunito, sans-serif',
                                            }}>
                                                {loanDates?.[m] ? fmt(loanDates[m]) : 'Select date'}
                                            </span>
                                        </div>
                                        <input
                                            type="date"
                                            value={loanDates?.[m] || ''}
                                            onChange={(e) => e.target.value && handleDateChange(m, e.target.value)}
                                            style={{
                                                position: 'absolute', inset: 0,
                                                opacity: 0, width: '100%', height: '100%',
                                                cursor: 'pointer', fontSize: 16,
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Per Instalment tab: instalment amounts */}
                {tab === 'instalment' && (
                    <>
                        <p style={{
                            fontSize: 14, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#000', margin: '0 0 8px',
                        }}>
                            Instalment amounts
                        </p>
                        <div style={{
                            border: '1px solid #e8e8e8', borderRadius: 10,
                            overflow: 'hidden',
                        }}>
                            {months.map((m, i) => (
                                <div key={m} style={{
                                    display: 'flex', alignItems: 'center',
                                    borderTop: i > 0 ? '1px solid #f3f3f3' : 'none',
                                }}>
                                    <div style={{
                                        width: 100, padding: '10px 14px',
                                        borderRight: '1px solid #f3f3f3',
                                        flexShrink: 0,
                                    }}>
                                        <span style={{
                                            fontSize: 14, fontWeight: 600,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#5e5e5e',
                                        }}>
                                            {SHORT_MONTH[m]}
                                        </span>
                                    </div>
                                    <div style={{
                                        flex: 1, display: 'flex',
                                        alignItems: 'center', gap: 6,
                                        padding: '0 14px',
                                    }}>
                                        <span style={{
                                            fontSize: 16, fontWeight: 600,
                                            color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                                        }}>£</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={formatDisplay(rawInstalments[m] || '')}
                                            onChange={(e) => handleInstalmentChange(m, e)}
                                            onFocus={scrollInputToTop}
                                            onBlur={handleInputBlur}
                                            style={{
                                                flex: 1, border: 'none',
                                                background: 'transparent',
                                                fontSize: 16, fontWeight: 500,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: '#000', outline: 'none',
                                                padding: '10px 0',
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                {/* Extra space so last input can scroll to top — only when focused */}
                {inputFocused && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
