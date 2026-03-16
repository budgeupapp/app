import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'
import { ALL_MONTH_KEYS, MONTH_LABELS } from '../config/onboardingConfig'
import { fmt } from './TermGraph'

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
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    irregular: 'Per instalment',
}

/* ==========================================================================
   MULTI-ENTRY WRAPPER
   ========================================================================== */

export default function IncomeExpenseCard({
    entries = [],
    updateEntries,
    subtitle = '',
    entryLabel = 'Entry',        // "Loan", "Bursary", "Payment" etc
    addLabel = 'Add another',    // "Add another loan"
    frequencyOptions = ['weekly', 'monthly', 'yearly', 'irregular'],
    defaultFrequency = 'yearly',
    defaultMonths = [],           // for irregular mode
    defaultDates = {},            // for irregular mode
    isExpense = false,
}) {
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
        setTimeout(() => setNewId(null), 400)
    }

    const [removingIdx, setRemovingIdx] = useState(null)
    const [collapsingIdx, setCollapsingIdx] = useState(null)
    const heights = useRef({})

    const removeEntry = (idx) => {
        if (entries.length <= 1) return
        const el = document.querySelector(`[data-entry-${idx}]`)
        if (el) heights.current[idx] = el.offsetHeight
        setRemovingIdx(idx)
        setTimeout(() => {
            setCollapsingIdx(idx)
            setTimeout(() => {
                setRemovingIdx(null)
                setCollapsingIdx(null)
                delete heights.current[idx]
                updateEntries(prev => prev.filter((_, i) => i !== idx))
            }, 350)
        }, 200)
    }

    const updateEntry = (idx, field, value) => {
        updateEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
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
                padding: '0 24px 24px',
                minHeight: 0,
            }}>
                {entries.map((entry, idx) => {
                    const isRemoving = removingIdx === idx
                    const isCollapsing = collapsingIdx === idx
                    const isNew = entry.id === newId
                    return (
                    <div key={entry.id || idx} data-entry {...{[`data-entry-${idx}`]: ''}} style={{
                        marginBottom: isCollapsing ? 0 : 10,
                        ...(isCollapsing ? {
                            maxHeight: 0, opacity: 0, overflow: 'hidden',
                            transition: 'max-height 0.35s ease, margin-bottom 0.35s ease',
                        } : isRemoving ? {
                            maxHeight: (heights.current[idx] || 500) + 2,
                            opacity: 0, overflow: 'hidden', transform: 'scale(0.97)',
                            transition: 'opacity 0.2s ease, transform 0.2s ease',
                        } : isNew ? {
                            animation: 'loanFadeIn 0.35s ease',
                        } : {}),
                    }}>
                        {(entries.length > 1 || removingIdx !== null) && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                margin: idx === 0 ? '0 0 8px' : '16px 0 8px',
                                maxHeight: (entries.length > 1) ? 30 : 0,
                                opacity: (entries.length > 1) ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.35s ease, opacity 0.25s ease',
                            }}>
                                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                    {entryLabel} {idx + 1}
                                </span>
                                <button onClick={() => removeEntry(idx)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#d4566a',
                                }}>Remove</button>
                            </div>
                        )}
                        <EntryCard
                            entry={entry}
                            updateField={(field, value) => updateEntry(idx, field, value)}
                            frequencyOptions={frequencyOptions}
                            defaultMonths={defaultMonths}
                            defaultDates={defaultDates}
                            isExpense={isExpense}
                            scrollOnFocus={idx > 0}
                        />
                    </div>
                )})}
                <button
                    onClick={addEntry}
                    style={{
                        width: '100%', height: 40,
                        background: 'transparent',
                        border: '1.5px dashed #ddd',
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
                <div style={{ height: '15vh', flexShrink: 0 }} />
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
}) {
    const {
        amount = '',
        frequency = 'monthly',
        nextDate = '',
        months: monthsProp = defaultMonths,
        dates: datesProp = defaultDates,
        instalmentAmounts = {},
    } = entry

    const accent = isExpense ? '#e06470' : '#147b75'
    const accentBg = isExpense ? 'rgba(224,100,112,0.06)' : 'rgba(20,123,117,0.06)'

    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    useEffect(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [amount])

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

    const [nextDateExpanded, setNextDateExpanded] = useState(!!nextDate)
    const [customAmounts, setCustomAmounts] = useState(
        () => Object.values(instalmentAmounts || {}).some(v => parseFloat(String(v || '0').replace(/,/g, '')) > 0)
    )
    const dateActiveRef = useRef(false)

    const isIrregular = frequency === 'irregular'
    const months = (monthsProp || defaultMonths)
        .slice()
        .sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        updateField('amount', val)
        // For irregular: update instalment amounts
        if (isIrregular) {
            const numVal = parseFloat(val) || 0
            if (numVal > 0 && months.length > 0) {
                const amounts = splitEvenly(numVal, months.length)
                const ni = {}, nr = {}
                months.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
                updateField('instalmentAmounts', ni)
                setRawInstalments(nr)
            }
        }
    }

    const handleInstalmentChange = (month, e) => {
        const val = cleanNum(e.target.value)
        const newInstalments = { ...instalmentAmounts, [month]: val }
        setRawInstalments(prev => ({ ...prev, [month]: val }))
        updateField('instalmentAmounts', newInstalments)
    }

    const toggleMonth = (month) => {
        const next = months.includes(month)
            ? months.filter(m => m !== month)
            : [...months, month]
        if (next.length === 0) return
        updateField('months', next)
        const numVal = parseFloat(String(amount || '').replace(/,/g, '')) || 0
        if (numVal > 0 && next.length > 0) {
            const sortedNext = next.slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
            const amounts = splitEvenly(numVal, sortedNext.length)
            const ni = {}, nr = {}
            sortedNext.forEach((m, i) => { ni[m] = String(amounts[i]); nr[m] = String(amounts[i]) })
            updateField('instalmentAmounts', ni)
            setRawInstalments(nr)
        }
        if (!next.includes(month) && datesProp?.[month]) {
            const { [month]: __, ...rest } = datesProp
            updateField('dates', rest)
        }
    }

    return (
        <div>
            {/* Amount + frequency dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid #e8e8e8', borderRight: 'none',
                    borderRadius: '10px 0 0 10px', background: '#fff',
                    padding: '0 14px', height: 44, gap: 6, flex: 1,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>
                        {getCurrencySymbol()}
                    </span>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formatDisplay(rawAmount)}
                        onChange={handleAmountChange}
                        onFocus={scrollOnFocus ? (e) => {
                            const entry = e.target.closest('[data-entry]')
                            if (entry) setTimeout(() => entry.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
                        } : undefined}
                        style={{
                            flex: 1, border: 'none', background: 'transparent',
                            fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                            color: '#000', outline: 'none', padding: 0,
                        }}
                    />
                </div>
                <div style={{ position: 'relative' }}>
                    <select
                        value={frequency}
                        onChange={(e) => updateField('frequency', e.target.value)}
                        style={{
                            height: 44, border: '1px solid #e8e8e8',
                            borderRadius: '0 10px 10px 0',
                            padding: '0 28px 0 12px',
                            fontSize: 13, fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif',
                            color: accent, background: accentBg,
                            WebkitAppearance: 'none', appearance: 'none',
                            cursor: 'pointer', outline: 'none',
                        }}
                    >
                        {frequencyOptions.map(f => (
                            <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                        ))}
                    </select>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                        <path d="M1 1L5 5L9 1" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            </div>

            {/* === IRREGULAR MODE: month pills + customise === */}
            {isIrregular && (
                <>
                    <p style={{
                        fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        color: '#000', margin: '0 0 10px',
                    }}>
                        Which months do you receive payments?
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
                                    <button key={m} onClick={() => toggleMonth(m)} style={{
                                        background: selected ? accent : '#fff',
                                        color: selected ? '#fff' : '#666',
                                        border: selected ? `1.5px solid ${accent}` : '1.5px solid #ddd',
                                        borderRadius: 50, padding: '8px 0',
                                        fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: 'none',
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
                                    cursor: 'pointer', padding: '12px 14px', borderTop: '1px solid #eee',
                                }}
                            >
                                <div>
                                    <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                        Customise amounts & dates
                                    </span>
                                    <p style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#999', margin: '2px 0 0' }}>
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
                                    <div key={m}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderTop: '1px solid #f3f3f3',
                                        }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888', minWidth: 70 }}>
                                                {MONTH_LABELS[m]}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 2,
                                                    background: '#f8f8f8', borderRadius: 8,
                                                    padding: '4px 8px', width: 80, boxSizing: 'border-box',
                                                }}>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#999', fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>
                                                        {getCurrencySymbol()}
                                                    </span>
                                                    <input
                                                        type="text" inputMode="decimal" placeholder="0.00"
                                                        value={formatDisplay(rawInstalments[m] || '')}
                                                        onChange={(e) => handleInstalmentChange(m, e)}
                                                        style={{
                                                            flex: 1, border: 'none', background: 'transparent',
                                                            fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                                            color: '#000', outline: 'none', padding: 0, textAlign: 'left',
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{
                                                        fontSize: 13, fontWeight: 600, color: '#888',
                                                        fontFamily: 'Nunito, sans-serif', pointerEvents: 'none',
                                                        background: '#f8f8f8', padding: '4px 10px', borderRadius: 8,
                                                        display: 'inline-block', whiteSpace: 'nowrap',
                                                        minWidth: 80, textAlign: 'center',
                                                    }}>
                                                        {datesProp?.[m] ? fmt(datesProp[m]) : 'Set date'}
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
                        </>)}
                    </div>
                </>
            )}

            {/* === REGULAR MODE (weekly/monthly/yearly): next date accordion === */}
            {!isIrregular && (
                <div style={{
                    border: '1px solid #e8e8e8', borderRadius: 12, background: '#fff',
                    overflow: 'hidden', marginBottom: 16,
                }}>
                    <div
                        onClick={() => setNextDateExpanded(!nextDateExpanded)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer', padding: '12px 14px',
                        }}
                    >
                        <div>
                            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                I know when I next get paid
                            </span>
                            <p style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#999', margin: '2px 0 0' }}>
                                Optional — improves accuracy
                            </p>
                        </div>
                        <Chevron open={nextDateExpanded} />
                    </div>
                    <div style={{
                        maxHeight: nextDateExpanded ? 100 : 0,
                        opacity: nextDateExpanded ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.35s cubic-bezier(.25,1,.5,1), opacity 0.25s ease',
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderTop: '1px solid #f3f3f3',
                        }}>
                            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888' }}>
                                Next payment date
                            </span>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    fontSize: 13, fontWeight: 600, color: '#888',
                                    fontFamily: 'Nunito, sans-serif', pointerEvents: 'none',
                                    background: '#f8f8f8', padding: '4px 10px', borderRadius: 8,
                                    display: 'inline-block', whiteSpace: 'nowrap',
                                    minWidth: 80, textAlign: 'center',
                                }}>
                                    {nextDate ? fmt(nextDate) : 'Set date'}
                                </span>
                                <input
                                    type="date"
                                    value={nextDate || ''}
                                    onFocus={() => { dateActiveRef.current = true }}
                                    onBlur={() => { dateActiveRef.current = false }}
                                    onChange={(e) => e.target.value && updateField('nextDate', e.target.value)}
                                    style={{
                                        position: 'absolute', inset: 0,
                                        opacity: 0, width: '100%', height: '100%',
                                        cursor: 'pointer', fontSize: 16,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
