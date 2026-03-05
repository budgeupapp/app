import { useState } from 'react'
import TermGraph, { fmt, weeksBetween, daysBetween } from '../components/TermGraph'

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
                    padding: '9px 16px',
                    pointerEvents: 'none',
                }}>
                    <span style={{
                        fontSize: 12,
                        color: '#9f9c9c',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{label}</span>

                    {/* Teal pill — clearly signals tap-to-edit */}
                    <div style={{
                        background: '#e8f4f3',
                        borderRadius: 8,
                        padding: '4px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}>
                        <span style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#147b75',
                            fontFamily: 'Nunito, sans-serif',
                        }}>{fmt(value)}</span>
                        {/* Pencil icon */}
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path
                                d="M6.5 1.5L8.5 3.5L3 9H1V7L6.5 1.5Z"
                                stroke="#147b75"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
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
            {!last && <div style={{ height: 1, background: '#f3f3f3', marginLeft: 16 }} />}
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
    const weeks = weeksBetween(term.start, term.end)

    const updateDate = (field, v) => onUpdate({ ...term, [field]: v })

    const updateBreak = (i, field, v) => {
        const breaks = [...term.breaks]
        breaks[i] = { ...breaks[i], [field]: v }
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
        <div style={{ border: '1px solid #f3f3f3', borderRadius: 10, background: '#fff' }}>

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
                                <div style={{ height: 1, background: '#f3f3f3' }} />
                                <div style={{
                                    background: 'rgba(243,243,243,0.8)',
                                    margin: '8px 10px',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                }}>
                                    {/* Break header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 16px 6px', gap: 6,
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
                    <div style={{ height: 1, background: '#f3f3f3' }} />
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

export default function TermDatesStep({ termData, updateTermDates, onNext, onBack, revealed = false }) {
    const [expandedTerm, setExpandedTerm] = useState(termData?.terms?.[0]?.id ?? null)

    const updateTerm = (updated) => {
        const terms = termData.terms.map(t => t.id === updated.id ? updated : t)
        updateTermDates({ ...termData, terms })
    }

    const terms = termData?.terms || []

    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', flexDirection: 'column',
            background: '#fff',
        }}>
            {/* Graph card */}
            <TermGraph terms={terms} expandedTerm={expandedTerm} />

            {/* Form card */}
            <div style={{
                margin: '12px 19px 12px',
                flex: 1,
                background: '#fff',
                borderRadius: 20,
                boxShadow: '0 0 15px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minHeight: 0,
                opacity: revealed ? 1 : 0,
                transition: 'opacity 2s ease'
            }}>
                {/* Title — fixed inside card */}
                <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                    <h2 style={{
                        fontSize: 25, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                    }}>
                        Uni term dates
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
                            onToggle={() => setExpandedTerm(
                                expandedTerm === term.id ? null : term.id
                            )}
                            onUpdate={updateTerm}
                        />
                    ))}
                </div>

                {/* Bottom buttons — fixed inside card */}
                <div style={{
                    flexShrink: 0,
                    padding: '10px 19px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderTop: '1px solid #f3f3f3',
                }}>
                    <button
                        onClick={onBack}
                        style={{
                            width: 50, height: 50, borderRadius: 50,
                            border: 'none', background: '#f0f0f0',
                            cursor: 'pointer', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M12 15L7 10L12 5" stroke="#4b4a4a"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button
                        onClick={onNext}
                        style={{
                            flex: 1, height: 50,
                            background: '#147b75', color: '#fff',
                            border: 'none', borderRadius: 50,
                            fontSize: 18, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            cursor: 'pointer', letterSpacing: 0,
                        }}
                    >
                        Confirm Term Dates
                    </button>
                </div>
            </div>
        </div>
    )
}
