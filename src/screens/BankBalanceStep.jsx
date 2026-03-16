import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'

/* ---------- HELPERS ---------- */

function formatDisplay(raw) {
    if (!raw) return ''
    const neg = raw.startsWith('-')
    const abs = neg ? raw.slice(1) : raw
    const [whole, ...rest] = abs.split('.')
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const result = rest.length ? `${formatted}.${rest.join('.')}` : formatted
    return neg ? `-${result}` : result
}

/* ---------- MAIN ---------- */

export default function BankBalanceStep({ balance, updateBalance, heading = 'Bank Balance', subtitle = "What's your current bank balance? Add up all your accounts \u2014 a rough estimate is fine!" }) {
    const [rawAmount, setRawAmount] = useState(() => {
        const n = parseFloat(String(balance || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    useEffect(() => {
        const n = parseFloat(String(balance || '').replace(/,/g, ''))
        setRawAmount(n ? String(n) : '')
    }, [balance])

    const negative = rawAmount.startsWith('-')

    const toggleSign = () => {
        const next = negative ? rawAmount.slice(1) : `-${rawAmount || '0'}`
        setRawAmount(next)
        const num = parseFloat(next || '0') || 0
        updateBalance(String(num || ''))
    }

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.\-]/g, '')
        // allow minus only at start
        if (val.indexOf('-') > 0) val = val.replace(/-/g, '')
        if (val.startsWith('-')) val = '-' + val.slice(1).replace(/-/g, '')
        const parts = val.replace(/^-/, '').split('.')
        if (parts.length > 2) val = (val.startsWith('-') ? '-' : '') + parts[0] + '.' + parts.slice(1).join('')
        if (parts.length === 2 && parts[1].length > 2) val = (val.startsWith('-') ? '-' : '') + parts[0] + '.' + parts[1].slice(0, 2)
        const absVal = Math.abs(parseFloat(val) || 0)
        if (absVal > 500000) val = (val.startsWith('-') ? '-' : '') + '500000'
        setRawAmount(val)
        const num = parseFloat(val || '0') || 0
        updateBalance(String(num || ''))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 8px' }}>

            {/* Amount input */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <button
                    onClick={toggleSign}
                    style={{
                        background: negative ? '#e06470' : '#147b75',
                        color: '#fff',
                        border: 'none', borderRadius: 10,
                        width: 36, height: 50,
                        fontSize: 20, fontWeight: 700,
                        cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Nunito, sans-serif',
                    }}
                >
                    {negative ? '−' : '+'}
                </button>

                <div style={{
                    display: 'flex', alignItems: 'center',
                    borderRadius: 10, border: '1px solid #e8e8e8', background: '#fff',
                    padding: '0 14px', height: 50, gap: 6,
                    width: 160, background: '#fff',
                }}>
                    <span style={{
                        fontSize: 20, fontWeight: 600,
                        color: '#444', fontFamily: 'Nunito, sans-serif',
                    }}>{getCurrencySymbol()}</span>

                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formatDisplay(rawAmount)}
                        onChange={handleChange}
                        onFocus={() => {}}
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

            <p style={{
                fontSize: 11, fontFamily: 'Nunito, sans-serif',
                color: '#9f9c9c', margin: '8px 0 0',
            }}>
                Don't include any savings or overdraft here.
            </p>
            </div>
        </div>
    )
}
