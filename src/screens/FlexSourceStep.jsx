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
]

function DropdownArrow({ color }) {
    return (
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <path d="M1 1L5 5L9 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function DateRow({ label, value, onChange, onClear, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 12, color: '#777', fontFamily: 'Nunito, sans-serif' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                    <span style={{
                        fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                        color: value ? color : color,
                        borderBottom: `1px dotted ${value ? `${color}90` : `${color}60`}`,
                        paddingBottom: 1, pointerEvents: 'none',
                    }}>{value ? fmt(value) : 'Select date'}</span>
                    <input type="date" value={value || ''} onChange={(e) => e.target.value && onChange(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }} />
                </div>
                {value && onClear && (
                    <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
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
    const color = isExpense ? '#e06470' : '#147b75'
    const colorBg = isExpense ? 'rgba(224,100,112,0.06)' : 'rgba(20,123,117,0.06)'
    const colorBgStrong = isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)'
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

    const scrollInputToTop = () => {
        // Pin scroll position on focus to prevent iOS auto-scroll
    }

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
            <p ref={questionRef} style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>
                How much?
            </p>

            {/* Amount + frequency dropdown — always shown */}
            <div style={{ display: 'flex', marginBottom: 16 }}>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid #e8e8e8', borderRight: 'none', borderRadius: '10px 0 0 10px',
                    padding: '0 14px', height: 40, boxSizing: 'border-box', gap: 6,
                    flex: 1, minWidth: 0,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                    <input type="text" inputMode="decimal" placeholder="0.00"
                        value={formatDisplay(rawAmount)} onChange={handleAmountChange} onBlur={handleAmountBlur}
                        onTouchStart={handleInputTouchStart} onTouchEnd={handleInputTouchEnd}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#000', outline: 'none', padding: 0, height: '100%', minWidth: 0 }}
                    />
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select value={frequency} onChange={(e) => update({ frequency: e.target.value })}
                        style={{
                            height: 40, boxSizing: 'border-box',
                            border: '1px solid #e8e8e8', borderRadius: '0 10px 10px 0',
                            padding: '0 26px 0 10px', fontSize: 13, fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif', color: color,
                            background: colorBg, WebkitAppearance: 'none', appearance: 'none',
                            cursor: 'pointer', outline: 'none',
                        }}>
                        {PERIOD_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <DropdownArrow color={color} />
                </div>
            </div>

            {/* Dates */}
            <div style={{ background: colorBgStrong, borderRadius: 10, padding: '10px 12px' }}>
                <DateRow label={isOneOff ? 'Date' : 'Start'} value={startDate} onChange={(val) => update({ startDate: val })} color={color} />
                {!isOneOff && (
                    <DateRow label="End (optional)" value={endDate} onChange={(val) => update({ endDate: val })} color={color} />
                )}
            </div>
        </div>
    )
}
