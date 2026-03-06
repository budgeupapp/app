import { useState, useRef, useEffect } from 'react'
import { fmt, weeksBetween, daysBetween } from '../components/TermGraph'

/* ---------- DATE ROW
   Invisible input[type=date] covers the whole row — tap anywhere opens the native picker.
   The date value is styled as a teal pill to signal it's editable.
---------- */

function DateRow({ label, value, onChange, last = false }) {
    return (
        <>
            <div style={{ position: 'relative' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 12px',
                    pointerEvents: 'none',
                }}>
                    <span style={{
                        fontSize: 12,
                        color: '#9f9c9c',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{label}</span>

                    {/* Teal pill — clearly signals tap-to-edit */}
                    <div style={{
                        borderRadius: 8,
                        padding: '4px 2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}>
                        <span style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#147b75',
                            borderBottom: '1px dotted rgba(20,123,117,0.45)',
                            paddingBottom: 1,
                            fontFamily: 'Nunito, sans-serif',
                        }}>{fmt(value)}</span>
                    </div>
                </div>
                {/* Invisible input covers entire row */}
                <input
                    type="date"
                    value={value}
                    onChange={(e) => e.target.value && onChange(e.target.value)}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0,
                        width: '100%',
                        height: '100%',
                        cursor: 'pointer',
                        fontSize: 16, // prevent iOS zoom
                    }}
                />
            </div>
        </>
    )
}

/* ---------- CHEVRON ---------- */

function Chevron({ open }) {
    return (
        <svg width="18" height="15" viewBox="0 0 18 15" fill="none" style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
        }}>
            <path d="M4 5.5L9 10.5L14 5.5" stroke="#9f9c9c"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ---------- TERM ACCORDION ---------- */

function TermAccordion({ term, expanded, onToggle, onUpdate }) {
    const ref = useRef(null)
    const prevExpanded = useRef(expanded)
    useEffect(() => {
        if (expanded && !prevExpanded.current) {
            // small delay so the accordion content renders before scrolling
            setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        }
        prevExpanded.current = expanded
    }, [expanded])

    const weeks = weeksBetween(term.start, term.end)

    const updateDate = (field, v) => {
        const updated = { ...term, [field]: v }
        // If end is before start, move the other date to match
        if (updated.end < updated.start) {
            if (field === 'start') updated.end = v
            else updated.start = v
        }
        onUpdate(updated)
    }

    const updateBreak = (i, field, v) => {
        const breaks = [...term.breaks]
        const brk = { ...breaks[i], [field]: v }
        // If end is before start, move the other date to match
        if (brk.end < brk.start) {
            if (field === 'start') brk.end = v
            else brk.start = v
        }
        breaks[i] = brk
        onUpdate({ ...term, breaks })
    }

    const addBreak = () => {
        const mid = (new Date(term.start + 'T00:00:00').getTime() +
            new Date(term.end + 'T00:00:00').getTime()) / 2
        const s = new Date(mid).toISOString().slice(0, 10)
        const e = new Date(mid + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        onUpdate({ ...term, breaks: [...term.breaks, { id: `b_${Date.now()}`, start: s, end: e }] })
    }

    const removeBreak = (i) => {
        onUpdate({ ...term, breaks: term.breaks.filter((_, idx) => idx !== i) })
    }

    return (
        <div ref={ref} style={{ border: '1px solid #f3f3f3', borderRadius: 10, background: '#fff' }}>

            {/* ── Header (2-line) ── */}
            <div onClick={onToggle} style={{ padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        fontSize: 14, fontWeight: 700, color: '#147b75',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{term.name}</span>
                    <span style={{
                        fontSize: 9, fontWeight: 600, color: '#9f9c9c',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{weeks} weeks</span>
                    <div style={{ flex: 1 }} />
                    <Chevron open={expanded} />
                </div>
                <div style={{ marginTop: 3 }}>
                    <span style={{
                        fontSize: 9, color: '#5e5e5e',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{fmt(term.start)} - {fmt(term.end)}</span>
                </div>
            </div>

            {expanded && (
                <>
                    {/* ── Separator below header ── */}
                    <div style={{ height: 1, background: '#f3f3f3' }} />

                    {/* ── Term start / end ── */}
                    <DateRow label="Start" value={term.start} onChange={v => updateDate('start', v)} />
                    <DateRow label="End" value={term.end} onChange={v => updateDate('end', v)} last />

                    {/* ── Breaks ── */}
                    {term.breaks.map((brk, i) => {
                        const days = daysBetween(brk.start, brk.end)
                        return (
                            <div key={brk.id || i}>
                                <div style={{
                                    background: 'rgba(243,243,243,0.8)',
                                    margin: '5px 10px',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                }}>
                                    {/* Break header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 12px 4px 12px', gap: 6,
                                    }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 700, color: '#4b4a4a',
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>Break</span>
                                        <span style={{
                                            fontSize: 9, fontWeight: 600, color: '#9f9c9c',
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>{days} days off</span>
                                        <div style={{ flex: 1 }} />
                                        <button
                                            onClick={() => removeBreak(i)}
                                            style={{
                                                background: 'none', border: 'none',
                                                cursor: 'pointer', fontSize: 18,
                                                color: '#9f9c9c', lineHeight: 1, padding: 0,
                                            }}
                                        >×</button>
                                    </div>
                                    <DateRow label="Start" value={brk.start} onChange={v => updateBreak(i, 'start', v)} />
                                    <DateRow label="End" value={brk.end} onChange={v => updateBreak(i, 'end', v)} last />
                                </div>
                            </div>
                        )
                    })}

                    {/* ── Add break ── */}
                    <div style={{ padding: '8px 10px' }}>
                        <button
                            onClick={addBreak}
                            style={{
                                width: '100%', height: 32,
                                background: 'none',
                                border: '1px dashed #4b4a4a',
                                borderRadius: 10,
                                fontSize: 12, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#4b4a4a', cursor: 'pointer',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
                            Add Break
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

/* ---------- MAIN ---------- */

export default function TermDatesStep({
    termData, updateTermDates,
    expandedTerm, onExpandedTermChange,
}) {
    const updateTerm = (updated) => {
        const terms = termData.terms.map(t => t.id === updated.id ? updated : t)
        updateTermDates({ ...termData, terms })
    }

    const terms = termData?.terms || []

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Title */}
            <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    University term dates
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: 0, lineHeight: 1.5,
                }}>
                    If we've got anything wrong, tap on the date to edit it.
                </p>
            </div>

            {/* Scrollable terms */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 19px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
                {terms.map(term => (
                    <TermAccordion
                        key={term.id}
                        term={term}
                        expanded={expandedTerm === term.id}
                        onToggle={() => onExpandedTermChange?.(
                            expandedTerm === term.id ? null : term.id
                        )}
                        onUpdate={updateTerm}
                    />
                ))}
            </div>
        </div>
    )
}
