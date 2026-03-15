import { useState, useRef } from 'react'
import { getCurrencySymbol } from '../lib/settings'
import { fmt } from '../components/TermGraph'

function formatDisplay(raw) { if (!raw) return ''; const [whole, ...rest] = raw.split('.'); const f = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return rest.length ? `${f}.${rest.join('.')}` : f }
function cleanNum(val) { let v = val.replace(/[^0-9.]/g, ''); const p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join(''); if (parseFloat(v) > 500000) v = '500000'; return v }

const PERIOD_OPTIONS = [
    { id: 'one-off', label: 'One-off' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'fortnightly', label: 'Fortnightly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'termly', label: 'Per Term' },
    { id: 'yearly', label: 'Yearly' },
]

function DropdownArrow({ color = '#147b75' }) {
    return (<svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M1 1L5 5L9 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>)
}
function Chevron({ open }) {
    return (<svg width="18" height="15" viewBox="0 0 18 15" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}><path d="M4 5.5L9 10.5L14 5.5" stroke="#9f9c9c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>)
}
function DateRow({ label, value, onChange, onClear }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 12, color: '#9f9c9c', fontFamily: 'Nunito, sans-serif' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: value ? '#147b75' : '#ccc', borderBottom: value ? '1px dotted rgba(20,123,117,0.45)' : 'none', paddingBottom: 1, fontFamily: 'Nunito, sans-serif', pointerEvents: 'none' }}>{value ? fmt(value) : 'Select date'}</span>
                    <input type="date" value={value || ''} onChange={(e) => e.target.value && onChange(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }} />
                </div>
                {value && onClear && (
                    <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                )}
            </div>
        </div>
    )
}

export default function FlexSourceStep({ data, onChange, isExpense }) {
    const { amount = '', frequency = 'monthly', startDate = '', endDate = '' } = data || {}
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(amount || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const sym = getCurrencySymbol()
    const accentColor = isExpense ? '#e06470' : '#147b75'
    const accentBg = isExpense ? 'rgba(224,100,112,0.06)' : 'rgba(20,123,117,0.06)'
    const accentBgStrong = isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)'

    const [datesExpanded, setDatesExpanded] = useState(!!(startDate || endDate))

    const update = (fields) => onChange({ ...data, ...fields })

    const handleAmountChange = (e) => {
        const val = cleanNum(e.target.value)
        setRawAmount(val)
        update({ amount: val })
    }

    const handleAmountBlur = () => {
        const num = parseFloat(String(rawAmount).replace(/,/g, ''))
        if (!isNaN(num) && num > 0) {
            const formatted = formatDisplay(String(num))
            setRawAmount(formatted)
            update({ amount: formatted })
        }
    }

    const isOneOff = frequency === 'one-off'

    return (
        <div style={{ padding: '8px 0 4px' }}>
            {/* Amount + period — joined like Rent */}
            <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>
                How much?
            </p>
            <div style={{ display: 'flex', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e8e8e8', borderRight: 'none', borderRadius: '10px 0 0 10px', padding: '0 14px', height: 40, boxSizing: 'border-box', gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                    <input type="text" inputMode="decimal" placeholder="0.00" value={formatDisplay(rawAmount)} onChange={handleAmountChange}
                        onBlur={handleAmountBlur}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#000', outline: 'none', padding: 0, height: '100%', minWidth: 0 }} />
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select value={frequency} onChange={(e) => update({ frequency: e.target.value })}
                        style={{ height: 40, boxSizing: 'border-box', border: '1px solid #e8e8e8', borderRadius: '0 10px 10px 0', padding: '0 26px 0 10px', fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: accentColor, background: accentBg, WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', outline: 'none' }}>
                        {PERIOD_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <DropdownArrow color={accentColor} />
                </div>
            </div>

            {/* Date section */}
            {isOneOff ? (
                /* One-off: expandable */
                <div onClick={() => setDatesExpanded(p => !p)}
                    style={{ background: accentBgStrong, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>When is it?</p>
                            <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '2px 0 0' }}>When does this happen?</p>
                        </div>
                        <Chevron open={datesExpanded} />
                    </div>
                    <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: datesExpanded ? 200 : 0, opacity: datesExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
                        <div style={{ marginTop: 10 }}>
                            <DateRow label="Date" value={startDate} onChange={(val) => update({ startDate: val })} />
                        </div>
                    </div>
                </div>
            ) : (
                /* Recurring: always shown, start required, end optional */
                <div style={{ background: accentBgStrong, borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>When does it start?</p>
                    <DateRow label="From" value={startDate} onChange={(val) => update({ startDate: val })} />
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                        <div onClick={() => setDatesExpanded(p => !p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                            <div>
                                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>Set an end date</p>
                                <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '2px 0 0' }}>Optional</p>
                            </div>
                            <Chevron open={datesExpanded} />
                        </div>
                        <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: datesExpanded ? 200 : 0, opacity: datesExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
                            <div style={{ marginTop: 8 }}>
                                <DateRow label="To" value={endDate} onChange={(val) => update({ endDate: val })} onClear={() => update({ endDate: '' })} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
