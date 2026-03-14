import { useState, useRef } from 'react'
import { getCurrencySymbol } from '../lib/settings'

const FREQ_OPTIONS = [
    { id: 'one-off', label: 'One-off' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'fortnightly', label: 'Fortnightly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'termly', label: 'Per Term' },
    { id: 'yearly', label: 'Yearly' },
]

export default function FlexSourceStep({ data, onChange, isExpense }) {
    const { amount = '', frequency = 'monthly', startDate = '', endDate = '' } = data || {}
    const [rawAmount, setRawAmount] = useState(amount)
    const sym = getCurrencySymbol()

    const update = (fields) => onChange({ ...data, ...fields })

    const handleAmountChange = (e) => {
        const val = e.target.value.replace(/[^0-9.,]/g, '')
        setRawAmount(val)
        update({ amount: val })
    }

    const handleAmountBlur = () => {
        const num = parseFloat(String(rawAmount).replace(/,/g, ''))
        if (!isNaN(num) && num > 0) {
            const formatted = num % 1 === 0 ? num.toLocaleString() : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            setRawAmount(formatted)
            update({ amount: formatted })
        }
    }

    const isOneOff = frequency === 'one-off'

    return (
        <div style={{ padding: '8px 0 4px' }}>
            {/* Amount input */}
            <div style={{
                display: 'flex', alignItems: 'center',
                background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8',
                overflow: 'hidden', marginBottom: 12,
            }}>
                <span style={{
                    padding: '0 0 0 14px', fontSize: 16, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif', color: isExpense ? '#e06470' : '#147b75',
                }}>{sym}</span>
                <input
                    type="text" inputMode="decimal" placeholder="0"
                    value={rawAmount}
                    onChange={handleAmountChange}
                    onBlur={handleAmountBlur}
                    style={{
                        flex: 1, border: 'none', outline: 'none',
                        padding: '12px 14px 12px 4px', fontSize: 16, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif', color: '#1a1a1a',
                        background: 'transparent',
                    }}
                />
                {!isOneOff && (
                    <span style={{
                        padding: '0 14px 0 0', fontSize: 12, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif', color: '#999', whiteSpace: 'nowrap',
                    }}>
                        /{frequency === 'weekly' ? 'wk' : frequency === 'fortnightly' ? '2wk' : frequency === 'monthly' ? 'mo' : frequency === 'quarterly' ? 'qtr' : frequency === 'termly' ? 'term' : 'yr'}
                    </span>
                )}
            </div>

            {/* Frequency pills */}
            <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12,
            }}>
                {FREQ_OPTIONS.map(o => (
                    <button key={o.id} onClick={() => update({ frequency: o.id })}
                        style={{
                            padding: '6px 12px', borderRadius: 50, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                            background: frequency === o.id ? (isExpense ? '#e06470' : '#147b75') : (isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)'),
                            color: frequency === o.id ? '#fff' : (isExpense ? '#e06470' : '#147b75'),
                            transition: 'all 0.15s ease',
                        }}>
                        {o.label}
                    </button>
                ))}
            </div>

            {/* Date inputs */}
            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999', marginBottom: 4, display: 'block' }}>
                        {isOneOff ? 'Date' : 'Start date'}
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => update({ startDate: e.target.value })}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '1px solid #e8e8e8', borderRadius: 10,
                            padding: '10px 12px', fontSize: 13, fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif', color: startDate ? '#1a1a1a' : '#ccc',
                            background: '#fff', outline: 'none',
                        }}
                    />
                </div>
                {!isOneOff && (
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999', marginBottom: 4, display: 'block' }}>
                            End date <span style={{ color: '#ccc' }}>(optional)</span>
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => update({ endDate: e.target.value })}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                border: '1px solid #e8e8e8', borderRadius: 10,
                                padding: '10px 12px', fontSize: 13, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif', color: endDate ? '#1a1a1a' : '#ccc',
                                background: '#fff', outline: 'none',
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
