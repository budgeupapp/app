import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'
import { DEFAULT_LOAN_MONTHS, ALL_MONTH_KEYS, MONTH_LABELS } from '../config/onboardingConfig'
import { fmt } from '../components/TermGraph'

/* ---------- HELPERS ---------- */

// Split total into n amounts that sum exactly to total (handles remainders)
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

/* Short month label for instalment rows */
const SHORT_MONTH = {
    september: 'Sept', october: 'Oct', november: 'Nov', december: 'Dec',
    january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
    may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
}

/* Month key → { min, max } date range for date picker */
function getMonthRange(monthKey) {
    const MONTH_NUM = {
        september: 8, october: 9, november: 10, december: 11,
        january: 0, february: 1, march: 2, april: 3,
        may: 4, june: 5, july: 6, august: 7,
    }
    const m = MONTH_NUM[monthKey]
    const year = m >= 8 ? 2025 : 2026 // Sept-Dec = 2025, Jan-Aug = 2026
    const first = new Date(year, m, 1)
    const last = new Date(year, m + 1, 0) // last day of month
    const pad = (n) => String(n).padStart(2, '0')
    return {
        min: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`,
        max: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
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

/* ---------- MAIN (multi-loan wrapper) ---------- */

export default function MaintenanceLoanStep({
    loans = [],
    updateLoans,
    compact = false,
    heading = 'Maintenance Loan',
    subtitle = "Enter the loan you're given for rent and living costs.",
}) {
    const addLoan = () => {
        updateLoans(prev => [...prev, {
            id: `loan_${Date.now()}`,
            amount: '',
            months: [...DEFAULT_LOAN_MONTHS],
            knowDates: false,
            dates: {},
            instalmentAmounts: {},
        }])
    }

    const removeLoan = (idx) => {
        if (loans.length <= 1) return
        updateLoans(prev => prev.filter((_, i) => i !== idx))
    }

    const updateLoan = (idx, field, value) => {
        updateLoans(prev => prev.map((loan, i) => i === idx ? { ...loan, [field]: value } : loan))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && (
                <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                    <h2 style={{
                        fontSize: 25, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#000', margin: '0 0 4px', lineHeight: 1.3,
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
                minHeight: 0,
            }}>
                {loans.map((loan, idx) => (
                    <div key={loan.id || idx}>
                        {idx > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
                                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Loan {idx + 1}</span>
                                <button onClick={() => removeLoan(idx)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#d4566a',
                                }}>Remove</button>
                            </div>
                        )}
                        <LoanEntry
                            loanAmount={loan.amount}
                            updateLoanAmount={(val) => updateLoan(idx, 'amount', val)}
                            loanMonths={loan.months}
                            updateLoanMonths={(val) => updateLoan(idx, 'months', val)}
                            loanKnowDates={loan.knowDates}
                            updateLoanKnowDates={(val) => updateLoan(idx, 'knowDates', val)}
                            loanDates={loan.dates}
                            updateLoanDates={(val) => updateLoan(idx, 'dates', val)}
                            instalmentAmounts={loan.instalmentAmounts}
                            updateInstalmentAmounts={(val) => updateLoan(idx, 'instalmentAmounts', val)}
                            compact
                        />
                    </div>
                ))}
                <button
                    onClick={addLoan}
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
                        marginTop: 16
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add another loan
                </button>
            </div>
        </div>
    )
}

/* ---------- SINGLE LOAN ENTRY ---------- */

function LoanEntry({
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
    compact = false,
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
    useEffect(() => {
        const n = parseFloat(String(loanAmount || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [loanAmount])
    useEffect(() => {
        const obj = {}
        for (const m of (loanMonths || DEFAULT_LOAN_MONTHS)) {
            const existing = instalmentAmounts?.[m]
            const n = parseFloat(String(existing || '').replace(/,/g, ''))
            obj[m] = n ? String(n) : ''
        }
        setRawInstalments(obj)
    }, [instalmentAmounts])
    const [datesExpanded, setDatesExpanded] = useState(false)
    const datesBoxRef = useRef(null)
    const amountInputRef = useRef(null)
    const dateActiveRef = useRef(false)

    const months = (loanMonths || DEFAULT_LOAN_MONTHS)
        .slice()
        .sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateLoanAmount(val)
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
            updateInstalmentAmounts(newInstalments)
            setRawInstalments(newRaw)
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
        // Update yearly total to sum of all instalments
        const total = months.reduce((sum, m) => {
            const v = m === month ? val : (instalmentAmounts?.[m] || '')
            return sum + (parseFloat(String(v).replace(/,/g, '')) || 0)
        }, 0)
        const rounded = Math.round(total * 100) / 100
        setRawAmount(String(rounded))
        updateLoanAmount(String(rounded))
    }

    const toggleMonth = (month) => {
        const next = months.includes(month)
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateLoanMonths(next)
        // Redistribute yearly total equally among new month set
        const yearlyVal = parseFloat(String(loanAmount || '').replace(/,/g, '')) || 0
        if (yearlyVal > 0 && next.length > 0) {
            const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
            const amounts = splitEvenly(yearlyVal, sortedNext.length)
            const newInstalments = {}
            const newRaw = {}
            sortedNext.forEach((m, i) => {
                newInstalments[m] = String(amounts[i])
                newRaw[m] = String(amounts[i])
            })
            updateInstalmentAmounts(newInstalments)
            setRawInstalments(newRaw)
        } else {
            updateInstalmentAmounts({})
            setRawInstalments({})
        }
        // Clean up stale dates for removed months
        if (!next.includes(month) && loanDates?.[month]) {
            const { [month]: __, ...restDates } = loanDates
            updateLoanDates(restDates)
        }
    }

    const handleDateChange = (month, val) => {
        updateLoanDates({ ...loanDates, [month]: val })
    }

    const sym = getCurrencySymbol()
    const yearlyVal = parseFloat(String(loanAmount || '0').replace(/,/g, '')) || 0
    const perInstalment = months.length > 0 ? Math.round(yearlyVal / months.length * 100) / 100 : 0
    const [customAmounts, setCustomAmounts] = useState(false)

    return (
        <div>
            {/* Amount input + toggle */}
            <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 4px' }}>
                {tab === 'instalment' ? 'Amount per instalment' : 'Yearly loan amount'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff',
                    padding: '0 14px', height: 38, gap: 6, width: 150,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                    <input
                        ref={amountInputRef}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formatDisplay(rawAmount)}
                        onChange={tab === 'instalment' ? (e) => {
                            const val = cleanNum(e.target.value)
                            setRawAmount(val)
                            const perVal = parseFloat(val) || 0
                            // Set yearly = per instalment × months
                            const yearly = Math.round(perVal * months.length * 100) / 100
                            updateLoanAmount(String(yearly))
                            // Set all instalments equal
                            const newInstalments = {}
                            const newRaw = {}
                            months.forEach(m => { newInstalments[m] = val; newRaw[m] = val })
                            updateInstalmentAmounts(newInstalments)
                            setRawInstalments(newRaw)
                        } : handleAmountChange}
                        style={{
                            flex: 1, border: 'none', background: 'transparent',
                            fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                            color: '#000', outline: 'none', padding: 0,
                        }}
                    />
                </div>
            </div>

            {/* Toggle: yearly / per instalment */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {['yearly', 'instalment'].map(id => (
                    <button key={id} onClick={() => {
                        if (id === 'instalment' && tab !== 'instalment') {
                            // Switch to per-instalment: show per-instalment amount
                            const per = months.length > 0 ? Math.round(yearlyVal / months.length * 100) / 100 : 0
                            setRawAmount(per ? String(per) : '')
                        }
                        if (id === 'yearly' && tab !== 'yearly') {
                            // Switch to yearly: show yearly total
                            const total = months.reduce((sum, m) => sum + (parseFloat(String(instalmentAmounts?.[m] || '').replace(/,/g, '')) || 0), 0)
                            setRawAmount(total ? String(Math.round(total * 100) / 100) : '')
                            updateLoanAmount(String(Math.round(total * 100) / 100))
                        }
                        setTab(id)
                    }} style={{
                        background: tab === id ? '#147b75' : '#fff',
                        color: tab === id ? '#fff' : '#666',
                        border: tab === id ? '1.5px solid #147b75' : '1.5px solid #ddd',
                        borderRadius: 50, padding: '6px 14px',
                        fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        cursor: 'pointer', transition: 'all 0.2s ease',
                    }}>
                        {id === 'yearly' ? 'Yearly total' : 'Per instalment'}
                    </button>
                ))}
            </div>

            {/* Summary */}
            {yearlyVal > 0 && months.length > 0 && (
                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888', margin: '0 0 16px' }}>
                    {tab === 'instalment'
                        ? `${sym}${rawAmount || '0'} × ${months.length} = ${sym}${Math.round(yearlyVal).toLocaleString()}/yr`
                        : `${months.length} instalments of ${sym}${Math.round(perInstalment).toLocaleString()} each`
                    }
                </p>
            )}

            {/* Month pills */}
            <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 10px' }}>
                Which months do you receive instalments?
            </p>
            <div style={{
                border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff',
                overflow: 'hidden', marginBottom: 16,
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 12px' }}>
                    {ALL_MONTH_KEYS.map(m => {
                        const selected = months.includes(m)
                        return (
                            <button key={m} onClick={() => toggleMonth(m)} style={{
                                background: selected ? '#147b75' : '#fff',
                                color: selected ? '#fff' : '#666',
                                border: selected ? '1.5px solid #147b75' : '1.5px solid #ddd',
                                borderRadius: 50, padding: '8px 0',
                                fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: 'none',
                            }}>
                                {SHORT_MONTH[m]}
                            </button>
                        )
                    })}
                </div>

                {/* Customise amounts — expandable */}
                {months.length > 0 && (
                    <div style={{ borderTop: '1px solid #eee' }}>
                        <div
                            onClick={() => setCustomAmounts(!customAmounts)}
                            style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#555' }}>
                                Customise amounts & dates
                            </span>
                            <Chevron open={customAmounts} />
                        </div>
                        <div style={{
                            maxHeight: customAmounts ? 600 : 0,
                            opacity: customAmounts ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.35s ease, opacity 0.25s ease',
                        }}>
                            <div style={{ padding: '0 12px 12px' }}>
                                {months.map(m => (
                                    <div key={m} style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 0',
                                    }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888' }}>
                                            {MONTH_LABELS[m]}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div
                                                onClick={(e) => { const inp = e.currentTarget.querySelector('input'); if (inp) inp.focus() }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'text' }}
                                            >
                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#888', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0.00"
                                                    value={formatDisplay(rawInstalments[m] || '')}
                                                    onChange={(e) => handleInstalmentChange(m, e)}
                                                    style={{
                                                        width: 55, border: 'none', background: 'transparent',
                                                        fontSize: 13, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                                        color: '#000', outline: 'none', padding: 0,
                                                    }}
                                                />
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{
                                                    fontSize: 13, fontWeight: 700, color: '#147b75',
                                                    fontFamily: 'Nunito, sans-serif', pointerEvents: 'none',
                                                    background: 'rgba(20,123,117,0.08)',
                                                    padding: '3px 10px', borderRadius: 8,
                                                    display: 'inline-block', whiteSpace: 'nowrap',
                                                }}>
                                                    {loanDates?.[m] ? fmt(loanDates[m]) : 'Select date'}
                                                </span>
                                                <input
                                                    type="date"
                                                    value={loanDates?.[m] || getMonthRange(m).min}
                                                    min={getMonthRange(m).min}
                                                    max={getMonthRange(m).max}
                                                    onFocus={() => { dateActiveRef.current = true }}
                                                    onBlur={() => { dateActiveRef.current = false }}
                                                    onChange={(e) => e.target.value && handleDateChange(m, e.target.value)}
                                                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
