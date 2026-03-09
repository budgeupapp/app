import { useState, useRef, useCallback } from 'react'

const MAX_SPEND = 400
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
                    Weekly spend
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                }}>
                    Estimate your average weekly spending, including unpredictable expenses not already covered. You can always edit this later.
                </p>
            </div>
            )}

            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 0 24px' : '0 24px 24px',
                minHeight: 0,
            }}>
                {/* Main spend card */}
                <SpendSliderCard
                    label={weeklySpendVariesByTerm ? 'During Term' : 'Average Weekly Spending'}
                    sublabel="Adjust to see how your forecast changes in real time."
                    description="Groceries, going out, transport etc."
                    value={termVal}
                    onChange={updateWeeklySpend}
                    max={MAX_SPEND}
                    color="#147b75"
                />

                {/* Non-term spend card */}
                {weeklySpendVariesByTerm && (
                    <div style={{ marginTop: 12 }}>
                        <SpendSliderCard
                            label="Outside Term"
                            sublabel="Your average weekly spend during holidays."
                            description="Groceries, going out, transport etc."
                            value={nonTermVal}
                            onChange={updateWeeklySpendNonTerm}
                            max={MAX_SPEND}
                            color="#EC8C17"
                        />
                    </div>
                )}

                {/* Varies by term toggle */}
                <button
                    onClick={() => updateWeeklySpendVariesByTerm(!weeklySpendVariesByTerm)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '16px 0 0', margin: 0,
                    }}
                >
                    <div style={{
                        width: 36, height: 20, borderRadius: 10,
                        background: weeklySpendVariesByTerm ? '#147b75' : '#e0e0e0',
                        transition: 'background 0.2s ease',
                        position: 'relative', flexShrink: 0,
                    }}>
                        <div style={{
                            width: 16, height: 16, borderRadius: 8,
                            background: '#fff',
                            position: 'absolute', top: 2,
                            left: weeklySpendVariesByTerm ? 18 : 2,
                            transition: 'left 0.2s ease',
                        }} />
                    </div>
                    <span style={{
                        fontSize: 13, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#5e5e5e',
                    }}>
                        Different amount outside term
                    </span>
                </button>
            </div>
        </div>
    )
}

function SpendSliderCard({ label, sublabel, description, value, onChange, max, color }) {
    const trackRef = useRef(null)
    const [dragging, setDragging] = useState(false)
    const pct = (value / max) * 100

    const monthly = Math.round(value * (52 / 12))
    const yearly = value * 52

    const updateFromX = useCallback((clientX) => {
        const track = trackRef.current
        if (!track) return
        const rect = track.getBoundingClientRect()
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
        const raw = ratio * max
        const snapped = Math.round(raw / SLIDER_STEP) * SLIDER_STEP
        onChange(String(snapped))
    }, [max, onChange])

    const handlePointerDown = (e) => {
        e.preventDefault()
        setDragging(true)
        updateFromX(e.clientX)
        const onMove = (ev) => updateFromX(ev.clientX)
        const onUp = () => {
            setDragging(false)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    return (
        <div style={{
            border: '1px solid #f3f3f3', borderRadius: 10,
            padding: '14px',
        }}>
            {/* Header */}
            <p style={{
                fontSize: 15, fontWeight: 700,
                fontFamily: 'Nunito, sans-serif',
                color: '#000', margin: 0,
            }}>
                {label}
            </p>
            <p style={{
                fontSize: 10, fontWeight: 400,
                fontFamily: 'Nunito, sans-serif',
                color: '#9f9c9c', margin: '2px 0 12px',
            }}>
                {sublabel}
            </p>

            {/* Description + Value */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                    fontSize: 11, fontWeight: 400,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e',
                }}>
                    {description}
                </span>
                <span style={{
                    fontSize: 12, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000',
                }}>
                    £{value}
                </span>
            </div>

            {/* Slider track */}
            <div
                ref={trackRef}
                onPointerDown={handlePointerDown}
                style={{
                    position: 'relative', height: 20,
                    cursor: 'pointer',
                    touchAction: 'none',
                    display: 'flex', alignItems: 'center',
                }}
            >
                {/* Background track */}
                <div style={{
                    position: 'absolute', left: 0, right: 0,
                    height: 4, borderRadius: 2,
                    background: '#f0f0f0',
                }} />
                {/* Filled track */}
                <div style={{
                    position: 'absolute', left: 0,
                    width: `${pct}%`,
                    height: 4, borderRadius: 2,
                    background: color,
                    transition: dragging ? 'none' : 'width 0.1s ease',
                }} />
                {/* Thumb */}
                <div style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    transform: 'translateX(-50%)',
                    width: 14, height: 14, borderRadius: 7,
                    background: '#fff',
                    border: `2.5px solid ${color}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    transition: dragging ? 'none' : 'left 0.1s ease',
                }} />
            </div>

            {/* Min / Max labels */}
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: 2,
            }}>
                <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>£0</span>
                <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', color: '#9f9c9c' }}>£{max}</span>
            </div>

            {/* Summary */}
            <div style={{
                marginTop: 10,
                background: '#f3f8f8', borderRadius: 5,
                padding: '6px 0',
                textAlign: 'center',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    fontFamily: 'Nunito, sans-serif',
                    color: color,
                }}>
                    ≈£{monthly.toLocaleString()}/month · £{yearly.toLocaleString()}/year
                </span>
            </div>
        </div>
    )
}
