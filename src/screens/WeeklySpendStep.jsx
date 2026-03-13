import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useCallback } from 'react'
import { analytics, DASHBOARD_EVENTS } from '../lib/analytics/index.js'

const MAX_SPEND = 350
const SLIDER_STEP = 5

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val))
}

export default function WeeklySpendStep({
    weeklySpend,
    updateWeeklySpend,
    weeklySpendNonTerm,
    updateWeeklySpendNonTerm,
    weeklySpendVariesByTerm,
    updateWeeklySpendVariesByTerm,
    compact = false,
}) {
    const termVal = Number(weeklySpend) || 0
    const nonTermVal = Number(weeklySpendNonTerm) || 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && (
                <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                    <h2 style={{
                        fontSize: 25, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                    }}>
                        Weekly Spend
                    </h2>
                    <p style={{
                        fontSize: 15, fontFamily: 'Nunito, sans-serif',
                        color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                    }}>
                        Groceries, going out, transport — your everyday spending.
                    </p>
                </div>
            )}

            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 0 24px' : '0 24px 24px',
                minHeight: 0,
            }}>
                <SpendSliderCard
                    label="Average Weekly Spending"
                    sublabel="Adjust to see how your forecast changes in real time."
                    description="Groceries, going out, transport etc."
                    value={termVal}
                    onChange={updateWeeklySpend}
                    max={MAX_SPEND}
                    color="#e06470"
                    variesByTerm={weeklySpendVariesByTerm}
                    onToggleVaries={() => updateWeeklySpendVariesByTerm(!weeklySpendVariesByTerm)}
                    nonTermVal={nonTermVal}
                    onChangeNonTerm={updateWeeklySpendNonTerm}
                    onDragEnd={() => analytics.track(DASHBOARD_EVENTS.WEEKLY_SPEND_UPDATED)}
                />
            </div>
        </div>
    )
}

function Slider({ value, onChange, max, color, onDragEnd }) {
    const trackRef = useRef(null)
    const [dragging, setDragging] = useState(false)
    const pct = (value / max) * 100

    const updateFromX = useCallback((clientX) => {
        const track = trackRef.current
        if (!track) return
        const rect = track.getBoundingClientRect()
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
        const snapped = Math.round(ratio * max / SLIDER_STEP) * SLIDER_STEP
        onChange(String(snapped))
    }, [max, onChange])

    const handlePointerDown = (e) => {
        const startX = e.clientX
        const startY = e.clientY
        let decided = false
        let isHorizontal = false

        const onMove = (ev) => {
            if (!decided) {
                const dx = Math.abs(ev.clientX - startX)
                const dy = Math.abs(ev.clientY - startY)
                if (dx < 5 && dy < 5) return
                decided = true
                isHorizontal = dx > dy
                if (isHorizontal) {
                    setDragging(true)
                    updateFromX(ev.clientX)
                } else {
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                    return
                }
            }
            if (isHorizontal) {
                ev.preventDefault()
                updateFromX(ev.clientX)
            }
        }
        const onUp = () => {
            setDragging(false)
            onDragEnd?.()
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    return (
        <div ref={trackRef} onPointerDown={handlePointerDown}
            style={{ position: 'relative', height: 20, cursor: 'pointer', touchAction: 'pan-y', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: '#f0f0f0' }} />
            <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 4, borderRadius: 2, background: color, transition: dragging ? 'none' : 'width 0.1s ease' }} />
            <div style={{ position: 'absolute', left: `clamp(0px, calc(${pct}% - 7px), calc(100% - 14px))`, width: 14, height: 14, borderRadius: 7, background: '#fff', border: `2.5px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: dragging ? 'none' : 'left 0.1s ease' }} />
        </div>
    )
}

function SpendSliderCard({ label, sublabel, description, value, onChange, max, color, variesByTerm, onToggleVaries, nonTermVal, onChangeNonTerm, onDragEnd }) {
    const monthly = Math.round(value * (52 / 12))
    const yearly = value * 52
    const nonTermMonthly = Math.round((nonTermVal || 0) * (52 / 12))
    const nonTermYearly = (nonTermVal || 0) * 52

    return (
        <div style={{ border: '1px solid #f3f3f3', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 14px 12px' }}>
                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>{label}</p>
                <p style={{ fontSize: 10, fontWeight: 400, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c', margin: '2px 0 12px' }}>{sublabel}</p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: variesByTerm ? 700 : 400, fontFamily: 'Nunito, sans-serif', color: variesByTerm ? color : '#5e5e5e' }}>
                        {variesByTerm ? 'Term time' : description}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000' }}>{getCurrencySymbol()}{value}</span>
                </div>
                <Slider value={value} onChange={onChange} max={max} color={color} onDragEnd={onDragEnd} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>{getCurrencySymbol()}0</span>
                    <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>{getCurrencySymbol()}{max}</span>
                </div>
                <div style={{ marginTop: 10, background: '#fdf0f1', borderRadius: 5, padding: '6px 0', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: color }}>
                        {`≈${getCurrencySymbol()}${monthly.toLocaleString()}/month · ${getCurrencySymbol()}${yearly.toLocaleString()}/year`}
                    </span>
                </div>

                {/* Second slider for during holidays — animated */}
                {onChangeNonTerm !== undefined && (
                    <div style={{
                        maxHeight: variesByTerm ? 200 : 0,
                        opacity: variesByTerm ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.3s ease, opacity 0.2s ease',
                    }}>
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f3f3f3' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#EC8C17' }}>Holidays</span>
                                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000' }}>{getCurrencySymbol()}{nonTermVal || 0}</span>
                            </div>
                            <Slider value={nonTermVal || 0} onChange={onChangeNonTerm} max={max} color="#EC8C17" onDragEnd={onDragEnd} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>{getCurrencySymbol()}0</span>
                                <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>{getCurrencySymbol()}{max}</span>
                            </div>
                            <div style={{ marginTop: 10, background: '#fdf6ee', borderRadius: 5, padding: '6px 0', textAlign: 'center' }}>
                                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#EC8C17' }}>
                                    {`≈${getCurrencySymbol()}${nonTermMonthly.toLocaleString()}/month · ${getCurrencySymbol()}${nonTermYearly.toLocaleString()}/year`}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Toggle row */}
            {onToggleVaries !== undefined && (
                <button onClick={onToggleVaries} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', boxSizing: 'border-box',
                    background: 'none', border: 'none', borderTop: '1px solid #f3f3f3',
                    cursor: 'pointer', padding: '10px 14px', margin: 0,
                }}>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#5e5e5e' }}>
                        Different amount during holidays
                    </span>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: variesByTerm ? '#e06470' : '#e0e0e0', transition: 'background 0.2s ease', position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: variesByTerm ? 18 : 2, transition: 'left 0.2s ease' }} />
                    </div>
                </button>
            )}
        </div>
    )
}
