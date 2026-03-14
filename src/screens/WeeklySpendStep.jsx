import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useCallback, useEffect } from 'react'
import { analytics, DASHBOARD_EVENTS } from '../lib/analytics/index.js'

const MAX_SPEND = 500
const STEP = 5
const TICK_GAP = 12 // px between each tick

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val))
}

function RulerPicker({ value, onChange, max, color, onDragEnd }) {
    const containerRef = useRef(null)
    const userScrolling = useRef(false)
    const scrollTimer = useRef(null)
    const totalTicks = max / STEP
    const maxScroll = totalTicks * TICK_GAP

    // Scroll to value on mount and when value changes externally
    useEffect(() => {
        const el = containerRef.current
        if (!el || userScrolling.current) return
        const targetScroll = (value / STEP) * TICK_GAP
        el.scrollLeft = targetScroll
    }, [value])

    const getValueFromScroll = useCallback((scrollLeft) => {
        const clamped = clamp(scrollLeft, 0, maxScroll)
        const raw = (clamped / TICK_GAP) * STEP
        return clamp(Math.round(raw / STEP) * STEP, 0, max)
    }, [max, maxScroll])

    const handleScroll = useCallback(() => {
        const el = containerRef.current
        if (!el) return
        const newVal = getValueFromScroll(el.scrollLeft)
        if (newVal !== value) {
            onChange(String(newVal))
        }
        // Snap after momentum fully settles
        clearTimeout(scrollTimer.current)
        scrollTimer.current = setTimeout(() => {
            userScrolling.current = false
            const el2 = containerRef.current
            if (!el2) return
            const snapVal = getValueFromScroll(el2.scrollLeft)
            const targetScroll = clamp((snapVal / STEP) * TICK_GAP, 0, maxScroll)
            el2.scrollTo({ left: targetScroll, behavior: 'smooth' })
            onDragEnd?.()
        }, 150)
    }, [getValueFromScroll, onChange, value, maxScroll, onDragEnd])

    const handleTouchStart = () => {
        userScrolling.current = true
        clearTimeout(scrollTimer.current)
    }

    const handleTouchEnd = () => {
        // Don't clear userScrolling here — let it stay true until momentum stops (via scroll debounce)
    }

    // Generate tick marks
    const ticks = []
    for (let i = 0; i <= totalTicks; i++) {
        const val = i * STEP
        const isMajor = val % 50 === 0
        const isMid = val % 25 === 0 && !isMajor
        ticks.push(
            <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                width: TICK_GAP, flexShrink: 0,
            }}>
                <div style={{
                    width: 1,
                    height: isMajor ? 28 : isMid ? 18 : 12,
                    background: isMajor ? '#bbb' : isMid ? '#ccc' : '#ddd',
                    borderRadius: 0.5,
                }} />
                {isMajor && (
                    <span style={{
                        fontSize: 9, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                        color: '#999', marginTop: 3, whiteSpace: 'nowrap',
                    }}>
                        {getCurrencySymbol()}{val}
                    </span>
                )}
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            {/* Center indicator line */}
            <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 2.5, height: 30, background: color, borderRadius: 1.5, zIndex: 10, pointerEvents: 'none',
            }} />
            {/* Scrollable ruler */}
            <div
                ref={containerRef}
                data-ruler-scroll
                onScroll={handleScroll}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
                style={{
                    overflowX: 'auto', overflowY: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorX: 'contain',
                    position: 'relative', zIndex: 1,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    paddingTop: 2, paddingBottom: 4,
                }}
            >
                <style>{`
                    [data-ruler-scroll]::-webkit-scrollbar { display: none; }
                `}</style>
                <div
                    style={{
                        display: 'inline-flex', alignItems: 'flex-start',
                        scrollbarWidth: 'none',
                    }}
                    ref={el => {
                        if (el && containerRef.current) {
                            const half = containerRef.current.clientWidth / 2
                            // Subtract half a tick so first/last tick center exactly, with no extra scroll room
                            el.style.paddingLeft = (half - TICK_GAP / 2) + 'px'
                            el.style.paddingRight = (half - TICK_GAP / 2) + 'px'
                        }
                    }}
                >
                    {ticks}
                </div>
            </div>
        </div>
    )
}

export default function WeeklySpendStep({
    weeklySpend,
    updateWeeklySpend,
    weeklySpendNonTerm,
    updateWeeklySpendNonTerm,
    weeklySpendVariesByTerm,
    updateWeeklySpendVariesByTerm,
    compact = false,
    heading = 'Weekly Spend',
    subtitle = "Food, transport, going out \u2014 just a rough weekly average.",
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
                padding: compact ? '0' : '0 24px 24px',
                minHeight: 0,
            }}>
                <SpendRulerCard
                    label={compact ? undefined : "Average Weekly Spending"}
                    value={termVal}
                    onChange={updateWeeklySpend}
                    max={MAX_SPEND}
                    color="#147b75"
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

function SpendRulerCard({ label, value, onChange, max, color, variesByTerm, onToggleVaries, nonTermVal, onChangeNonTerm, onDragEnd }) {
    const monthly = Math.round(value * (52 / 12))
    const yearly = value * 52
    const nonTermMonthly = Math.round((nonTermVal || 0) * (52 / 12))
    const nonTermYearly = (nonTermVal || 0) * 52

    return (
        <div>
            {label && (
                <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: '0 0 12px' }}>{label}</p>
            )}

            {/* Amount display */}
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: 2 }}>
                <span style={{
                    fontSize: 32, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a', letterSpacing: -1,
                }}>
                    {getCurrencySymbol()}{value}
                </span>
                <span style={{
                    fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                    color: '#999', marginLeft: 2,
                }}>/wk</span>
                {variesByTerm && (
                    <span style={{
                        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        color: '#147b75', background: 'rgba(20,123,117,0.1)',
                        padding: '3px 10px', borderRadius: 20,
                    }}>Term time</span>
                )}
            </div>

            {/* Monthly/yearly summary */}
            <div style={{
                display: 'flex', justifyContent: 'center', gap: 8,
                marginBottom: 6,
            }}>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                    ≈{getCurrencySymbol()}{monthly.toLocaleString()}/mo
                </span>
                <span style={{ fontSize: 11, color: '#ddd' }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                    {getCurrencySymbol()}{yearly.toLocaleString()}/yr
                </span>
            </div>

            {/* Ruler picker */}
            <div style={{
                borderRadius: 12, padding: '6px 0 4px',
                marginBottom: 8,
            }}>
                <RulerPicker value={value} onChange={onChange} max={max} color={color} onDragEnd={onDragEnd} />
            </div>

            {/* Holiday variation section */}
            {onChangeNonTerm !== undefined && (
                <div style={{
                    maxHeight: variesByTerm ? 250 : 0,
                    opacity: variesByTerm ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease, opacity 0.2s ease',
                }}>
                    <div style={{ paddingTop: 12, borderTop: '1px solid #f0f0f0', marginTop: 8 }}>
                        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 2 }}>
                            <span style={{
                                fontSize: 28, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                color: '#1a1a1a', letterSpacing: -1,
                            }}>
                                {getCurrencySymbol()}{nonTermVal || 0}
                            </span>
                            <span style={{
                                fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                color: '#999', marginLeft: 2,
                            }}>/wk</span>
                            <span style={{
                                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                                fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#7c6bbf', background: 'rgba(124,107,191,0.1)',
                                padding: '3px 10px', borderRadius: 20,
                            }}>Holidays</span>
                        </div>
                        <div style={{
                            display: 'flex', justifyContent: 'center', gap: 8,
                            marginBottom: 6,
                        }}>
                            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                ≈{getCurrencySymbol()}{nonTermMonthly.toLocaleString()}/mo
                            </span>
                            <span style={{ fontSize: 11, color: '#ddd' }}>·</span>
                            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                {getCurrencySymbol()}{nonTermYearly.toLocaleString()}/yr
                            </span>
                        </div>
                        <div style={{
                            borderRadius: 12, padding: '6px 0 4px',
                            marginBottom: 8,
                        }}>
                            <RulerPicker value={nonTermVal || 0} onChange={onChangeNonTerm} max={max} color="#7c6bbf" onDragEnd={onDragEnd} />
                        </div>
                    </div>
                </div>
            )}

            {/* Toggle row */}
            {onToggleVaries !== undefined && (
                <button onClick={onToggleVaries} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', boxSizing: 'border-box',
                    background: 'none', border: 'none', borderTop: '1px solid #f0f0f0',
                    cursor: 'pointer', padding: '12px 0', margin: '8px 0 0',
                }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#666' }}>
                        Different amount during holidays
                    </span>
                    <div style={{ width: 40, height: 22, borderRadius: 11, background: variesByTerm ? '#147b75' : '#e0e0e0', transition: 'background 0.2s ease', position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: variesByTerm ? 20 : 2, transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
                    </div>
                </button>
            )}
        </div>
    )
}
