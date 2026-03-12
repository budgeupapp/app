import { getCurrencySymbol } from '../lib/settings'
import { useState, useEffect } from 'react'

function formatDisplay(raw) {
    if (!raw) return ''
    const [whole, ...rest] = raw.split('.')
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
}

export default function OverdraftStep({ overdraft, updateOverdraft }) {
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(overdraft || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    useEffect(() => {
        const n = parseFloat(String(overdraft || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [overdraft])

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parseFloat(val) > 50000) val = '50000'
        setRawAmount(val)
        updateOverdraft(val)
    }

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 16px' }}>
            <h2 style={{
                fontSize: 25, fontWeight: 700,
                fontFamily: 'Nunito, sans-serif',
                color: '#000', margin: '0 0 8px', lineHeight: 1.3,
            }}>
                Overdraft Limit
            </h2>
            <p style={{
                fontSize: 15, fontFamily: 'Nunito, sans-serif',
                color: '#5e5e5e', margin: '0 0 24px', lineHeight: 1.5,
            }}>
                What’s your overdraft limit? Leave blank if you don’t have one.
            </p>

            <div style={{
                display: 'flex', alignItems: 'center',
                borderRadius: 10, border: '1px solid #e8e8e8',
                padding: '0 14px', height: 50, gap: 8,
                maxWidth: 160,
            }}>
                <span style={{
                    fontSize: 20, fontWeight: 600,
                    color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                }}>{getCurrencySymbol()}</span>

                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={formatDisplay(rawAmount)}
                    onChange={handleChange}
                    onFocus={() => { }}
                    style={{
                        flex: 1, border: 'none',
                        background: 'transparent',
                        fontSize: 20, fontWeight: 500,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#000',
                        outline: 'none', padding: 0,
                    }}
                />
            </div>
        </div>
    )
}
