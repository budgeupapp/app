import { useState, useRef, useEffect } from 'react'
import { fmt, weeksBetween, daysBetween } from '../components/TermGraph'

/* ---------- BREAK NAME FIELD ---------- */

function BreakNameField({ value, placeholder, onChange }) {
    const ref = useRef(null)
    return (
        <input
            ref={ref}
            type="text"
            value={value}
            placeholder={placeholder}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => {
                // Prevent iOS from scrolling to top
                if (ref.current) ref.current.focus({ preventScroll: true })
            }}
            onChange={(e) => onChange(e.target.value)}
            style={{
                fontSize: 13, fontWeight: 700, color: '#444',
                fontFamily: 'Nunito, sans-serif',
                border: 'none', background: 'transparent',
                outline: 'none', padding: 0,
                width: Math.max(60, (value || placeholder).length * 8),
            }}
        />
    )
}

/* ---------- DATE ROW ---------- */

function hexToRgba(hex, alpha) {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

function DateRow({ label, value, onChange, color = '#147b75' }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
        }}>
            <span style={{
                fontSize: 13,
                color: '#888',
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 600,
            }}>{label}</span>

            <div style={{ position: 'relative' }}>
                <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color,
                    fontFamily: 'Nunito, sans-serif',
                    pointerEvents: 'none',
                    background: hexToRgba(color, 0.08),
                    padding: '3px 10px',
                    borderRadius: 8,
                    display: 'inline-block',
                }}>{fmt(value)}</span>
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
                        fontSize: 16,
                    }}
                />
            </div>
        </div>
    )
}

/* ---------- CHEVRON ---------- */

function Chevron({ open }) {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s cubic-bezier(.25,1,.5,1)',
            flexShrink: 0,
        }}>
            <path d="M7 4.5L12 9L7 13.5" stroke="#aaa"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ---------- TERM ACCORDION ---------- */

function TermAccordion({ term, expanded, onToggle, onUpdate, onDelete, canDelete, noAutoScroll }) {
    const ref = useRef(null)
    const headerRef = useRef(null)
    const contentRef = useRef(null)
    const [contentHeight, setContentHeight] = useState(0)
    const prevExpanded = useRef(expanded)
    const [removingBreak, setRemovingBreak] = useState(null)

    // Re-measure content when breaks change
    useEffect(() => {
        if (expanded && contentRef.current) {
            requestAnimationFrame(() => setContentHeight(contentRef.current.scrollHeight))
        }
    }, [expanded, term.breaks.length])

    useEffect(() => {
        if (expanded) {
            const measure = () => {
                if (contentRef.current) {
                    setContentHeight(contentRef.current.scrollHeight)
                }
            }
            measure()
            requestAnimationFrame(measure)

            if (!noAutoScroll && !prevExpanded.current && headerRef.current) {
                setTimeout(() => {
                    if (headerRef.current) {
                        headerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                }, 350)
            }
        }
    }, [expanded, term.breaks.length, removingBreak])

    useEffect(() => {
        prevExpanded.current = expanded
    }, [expanded])

    const weeks = weeksBetween(term.start, term.end)

    const updateDate = (field, v) => {
        const updated = { ...term, [field]: v, _changedField: field }
        if (updated.end < updated.start) {
            if (field === 'start') updated.end = v
            else updated.start = v
        }
        onUpdate(updated)
    }

    const updateBreak = (i, field, v) => {
        const breaks = [...term.breaks]
        const brk = { ...breaks[i], [field]: v }
        if (brk.end < brk.start) {
            if (field === 'start') brk.end = v
            else brk.start = v
        }
        breaks[i] = brk
        onUpdate({ ...term, breaks })
    }

    const addBreak = () => {
        const termStart = new Date(term.start + 'T00:00:00').getTime()
        const termEnd = new Date(term.end + 'T00:00:00').getTime()
        const DAY = 24 * 60 * 60 * 1000
        const existingBreaks = term.breaks
        const n = existingBreaks.length
        const newId = `b_${Date.now()}`

        let s, e
        if (n === 0) {
            const mid = (termStart + termEnd) / 2
            s = new Date(mid).toISOString().slice(0, 10)
            e = new Date(mid + 7 * DAY).toISOString().slice(0, 10)
            onUpdate({ ...term, breaks: [{ id: newId, start: s, end: e }] })
        } else {
            const sorted = [...existingBreaks].sort((a, b) => a.start.localeCompare(b.start))
            const edges = [termStart, ...sorted.flatMap(b => [
                new Date(b.start + 'T00:00:00').getTime(),
                new Date(b.end + 'T00:00:00').getTime()
            ]), termEnd]
            let bestGapStart = termStart
            let bestGapEnd = termEnd
            let bestGapSize = 0
            for (let i = 0; i < edges.length - 1; i += 2) {
                const gapStart = edges[i]
                const gapEnd = edges[i + 1]
                if (gapEnd - gapStart > bestGapSize) {
                    bestGapSize = gapEnd - gapStart
                    bestGapStart = gapStart
                    bestGapEnd = gapEnd
                }
            }
            const mid = (bestGapStart + bestGapEnd) / 2
            s = new Date(mid).toISOString().slice(0, 10)
            e = new Date(mid + 7 * DAY).toISOString().slice(0, 10)
            onUpdate({ ...term, breaks: [...existingBreaks, { id: newId, start: s, end: e }] })
        }

        if (!noAutoScroll) {
            setTimeout(() => {
                const el = document.querySelector(`[data-break-id="${newId}"]`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 150)
        }
    }

    const removeBreak = (i) => {
        setRemovingBreak(i)
        setTimeout(() => {
            setRemovingBreak(null)
            onUpdate({ ...term, breaks: term.breaks.filter((_, idx) => idx !== i) })
        }, 300)
    }

    return (
        <div ref={ref} style={{
            borderRadius: 14,
            background: '#fff',
            overflow: 'hidden',
            boxShadow: expanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.04)',
            transition: 'box-shadow 0.3s ease',
        }}>
            {/* Header */}
            <div ref={headerRef} onClick={onToggle} style={{
                padding: '14px 16px',
                cursor: 'pointer',
                scrollMarginTop: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                {/* Color dot */}
                <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#147b75', flexShrink: 0,
                    opacity: 0.7,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            value={term.name}
                            onChange={(e) => onUpdate({ ...term, name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.stopPropagation()}
                            style={{
                                fontSize: 15, fontWeight: 700, color: '#222',
                                fontFamily: 'Nunito, sans-serif',
                                border: 'none', background: 'transparent',
                                outline: 'none', padding: 0,
                                width: Math.max(50, term.name.length * 9),
                            }}
                        />
                        <span style={{
                            fontSize: 11, fontWeight: 600, color: '#aaa',
                            fontFamily: 'Nunito, sans-serif',
                            whiteSpace: 'nowrap',
                        }}>{weeks}w</span>
                    </div>
                    <span style={{
                        fontSize: 12, color: '#999',
                        fontFamily: 'Nunito, sans-serif',
                        marginTop: 2, display: 'block',
                    }}>{fmt(term.start)} – {fmt(term.end)}</span>
                </div>
                <Chevron open={expanded} />
            </div>

            {/* Expandable content */}
            <div style={{
                maxHeight: expanded ? contentHeight + 80 : 0,
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.35s cubic-bezier(.25,1,.5,1), opacity 0.25s ease',
            }}>
                <div ref={contentRef}>
                    <div style={{ height: 1, background: '#f0f0f0', margin: '0 16px' }} />

                    {/* Term dates */}
                    <div style={{ padding: '8px 16px' }}>
                        <DateRow label="Starts" value={term.start} onChange={v => updateDate('start', v)} />
                        <DateRow label="Ends" value={term.end} onChange={v => updateDate('end', v)} />
                    </div>

                    {/* Holidays */}
                    {term.breaks.map((brk, i) => {
                        const days = daysBetween(brk.start, brk.end)
                        const isRemoving = removingBreak === i
                        const isExam = brk.name && /exam/i.test(brk.name.trim())
                        const isReading = brk.name && /reading/i.test(brk.name)
                        const breakColor = isExam ? '#e06470' : isReading ? '#5b8fd9' : '#888'
                        const breakBg = isExam ? 'rgba(224,100,112,0.06)' : isReading ? 'rgba(91,143,217,0.06)' : '#fafafa'

                        return (
                            <div key={brk.id || i} data-break-id={brk.id} style={{
                                maxHeight: isRemoving ? 0 : 200,
                                opacity: isRemoving ? 0 : 1,
                                overflow: 'hidden',
                                transition: 'max-height 0.3s ease, opacity 0.2s ease',
                            }}>
                                <div style={{
                                    background: breakBg,
                                    margin: '4px 12px',
                                    borderRadius: 12,
                                    padding: '10px 14px',
                                    border: `1px solid ${breakColor}15`,
                                }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        marginBottom: 6,
                                    }}>
                                        <div style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: breakColor, opacity: 0.5, flexShrink: 0,
                                        }} />
                                        <BreakNameField
                                            value={brk.name || ''}
                                            placeholder="Holiday"
                                            onChange={(v) => {
                                                const newBreaks = [...term.breaks]
                                                newBreaks[i] = { ...newBreaks[i], name: v }
                                                onUpdate({ ...term, breaks: newBreaks })
                                            }}
                                        />
                                        <span style={{
                                            fontSize: 11, fontWeight: 600, color: '#aaa',
                                            fontFamily: 'Nunito, sans-serif',
                                            whiteSpace: 'nowrap', flex: 1, textAlign: 'right',
                                        }}>{days}d</span>
                                    </div>
                                    <DateRow label="From" value={brk.start} onChange={v => updateBreak(i, 'start', v)} color={breakColor} />
                                    <DateRow label="To" value={brk.end} onChange={v => updateBreak(i, 'end', v)} color={breakColor} />
                                    <button
                                        onClick={() => removeBreak(i)}
                                        style={{
                                            background: 'none', border: 'none',
                                            cursor: 'pointer', padding: '6px 0 0',
                                            fontSize: 12, fontWeight: 600, color: '#aaa',
                                            fontFamily: 'Nunito, sans-serif',
                                            width: '100%', textAlign: 'center',
                                        }}
                                    >
                                        Delete {brk.name || 'holiday'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}

                    {/* Add holiday button */}
                    <div style={{ padding: '8px 12px' }}>
                        <button
                            onClick={addBreak}
                            style={{
                                width: '100%', height: 36,
                                background: 'transparent',
                                border: '1.5px dashed #ddd',
                                borderRadius: 10,
                                fontSize: 13, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#999', cursor: 'pointer',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 4,
                                transition: 'border-color 0.2s ease, color 0.2s ease',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Add Holiday
                        </button>
                    </div>

                    {canDelete && (
                        <div style={{ padding: '2px 12px 10px', textAlign: 'center' }}>
                            <span
                                onClick={onDelete}
                                style={{
                                    fontSize: 12, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#e06470', cursor: 'pointer',
                                    opacity: 0.7,
                                }}
                            >
                                Remove term
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ---------- MAIN ---------- */

export default function TermDatesStep({
    termData, updateTermDates,
    expandedTerm, onExpandedTermChange,
    compact = false,
    noAutoScroll = false,
    heading = 'University Term Dates',
    subtitle = "If we've got anything wrong, tap on a date to edit it.",
}) {
    const updateTerm = (updated) => {
        const DAY = 24 * 60 * 60 * 1000
        const toMs = (d) => new Date(d + 'T00:00:00').getTime()
        const toStr = (ms) => new Date(ms).toISOString().slice(0, 10)
        const shiftDate = (dateStr, days) => toStr(toMs(dateStr) + days * DAY)

        const terms = [...termData.terms]
        const idx = terms.findIndex(t => t.id === updated.id)
        const old = terms[idx]
        const changedField = updated._changedField || null

        const { _changedField, ...cleanUpdated } = updated

        if (changedField === 'start') {
            const delta = Math.round((toMs(cleanUpdated.start) - toMs(old.start)) / DAY)
            if (delta !== 0) {
                cleanUpdated.end = shiftDate(old.end, delta)
                cleanUpdated.breaks = (old.breaks || []).map(b => ({
                    ...b,
                    start: shiftDate(b.start, delta),
                    end: shiftDate(b.end, delta),
                }))
            }
        } else if (changedField === 'end') {
            cleanUpdated.breaks = (old.breaks || []).map(b => {
                if (b.end > cleanUpdated.end) {
                    const clampedEnd = cleanUpdated.end < b.start ? b.start : cleanUpdated.end
                    return { ...b, end: clampedEnd > cleanUpdated.end ? cleanUpdated.end : clampedEnd, start: b.start > cleanUpdated.end ? cleanUpdated.end : b.start }
                }
                return { ...b }
            }).filter(b => b.start <= cleanUpdated.end)
        }

        const newTerms = terms.map(t => t.id === cleanUpdated.id ? cleanUpdated : { ...t })

        for (let i = idx + 1; i < newTerms.length; i++) {
            const prev = newTerms[i - 1]
            const curr = newTerms[i]
            if (toMs(prev.end) >= toMs(curr.start)) {
                const newStart = shiftDate(prev.end, 1)
                const delta = Math.round((toMs(newStart) - toMs(curr.start)) / DAY)
                const duration = Math.round((toMs(curr.end) - toMs(curr.start)) / DAY)
                curr.start = newStart
                curr.end = shiftDate(curr.start, duration)
                curr.breaks = (curr.breaks || []).map(b => ({
                    ...b,
                    start: shiftDate(b.start, delta),
                    end: shiftDate(b.end, delta),
                }))
            } else {
                break
            }
        }

        for (let i = idx - 1; i >= 0; i--) {
            const next = newTerms[i + 1]
            const curr = newTerms[i]
            if (toMs(curr.end) >= toMs(next.start)) {
                const newEnd = shiftDate(next.start, -1)
                const delta = Math.round((toMs(newEnd) - toMs(curr.end)) / DAY)
                const duration = Math.round((toMs(curr.end) - toMs(curr.start)) / DAY)
                curr.end = newEnd
                curr.start = shiftDate(curr.end, -duration)
                curr.breaks = (curr.breaks || []).map(b => ({
                    ...b,
                    start: shiftDate(b.start, delta),
                    end: shiftDate(b.end, delta),
                }))
            } else {
                break
            }
        }

        updateTermDates({ ...termData, terms: newTerms })
    }

    const [removingTermId, setRemovingTermId] = useState(null)
    const [collapsingTermId, setCollapsingTermId] = useState(null)
    const termHeights = useRef({})

    const deleteTerm = (id) => {
        const el = document.querySelector(`[data-term-id="${id}"]`)
        if (el) termHeights.current[id] = el.offsetHeight
        if (expandedTerm === id) onExpandedTermChange?.(null)
        setRemovingTermId(id)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setCollapsingTermId(id)
                setTimeout(() => {
                    setRemovingTermId(null)
                    setCollapsingTermId(null)
                    delete termHeights.current[id]
                    const filtered = termData.terms.filter(t => t.id !== id)
                    updateTermDates({ ...termData, terms: filtered })
                }, 350)
            })
        })
    }

    const addTerm = () => {
        const existing = termData?.terms || []
        const num = existing.length + 1
        const lastEnd = existing.length > 0
            ? new Date(existing[existing.length - 1].end + 'T00:00:00')
            : new Date(2026, 0, 1)
        const start = new Date(lastEnd.getTime() + 14 * 24 * 60 * 60 * 1000)
        const end = new Date(start.getTime() + 84 * 24 * 60 * 60 * 1000)
        const newTerm = {
            id: `term_${Date.now()}`,
            name: `Term ${num}`,
            start: start.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10),
            breaks: [],
        }
        updateTermDates({ ...termData, terms: [...existing, newTerm] })
        onExpandedTermChange?.(newTerm.id)
    }

    const terms = termData?.terms || []

    const termList = (scrollable) => (
        <>
            {terms.map(term => {
                const isRemoving = removingTermId === term.id
                return (
                    <div key={term.id} data-term-id={term.id} style={{
                        marginBottom: collapsingTermId === term.id ? 0 : 10,
                        ...(collapsingTermId === term.id ? {
                            maxHeight: 0,
                            opacity: 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.35s ease, opacity 0.25s ease, margin-bottom 0.35s ease',
                        } : isRemoving ? {
                            maxHeight: termHeights.current[term.id],
                            overflow: 'hidden',
                            transition: 'max-height 0.35s ease, opacity 0.25s ease, margin-bottom 0.35s ease',
                        } : {}),
                    }}>
                        <TermAccordion
                            term={term}
                            expanded={expandedTerm === term.id}
                            onToggle={() => onExpandedTermChange?.(
                                expandedTerm === term.id ? null : term.id
                            )}
                            onUpdate={updateTerm}
                            onDelete={() => deleteTerm(term.id)}
                            canDelete={terms.length > 1}
                            noAutoScroll={noAutoScroll}
                        />
                    </div>
                )
            })}
            <button
                onClick={addTerm}
                style={{
                    width: '100%', height: 40,
                    background: 'transparent',
                    border: '1.5px dashed #ddd',
                    borderRadius: 14,
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#147b75', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6,
                    flexShrink: 0,
                    transition: 'border-color 0.2s ease',
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
                Add Term
            </button>
        </>
    )

    if (compact) {
        return (
            <div data-term-scroll style={{ display: 'flex', flexDirection: 'column' }}>
                {termList(false)}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 6px', lineHeight: 1.3,
                }}>
                    {heading}
                </h2>
                <p style={{
                    fontSize: 14, fontFamily: 'Nunito, sans-serif',
                    color: '#888', margin: 0, lineHeight: 1.5,
                }}>
                    {subtitle}
                </p>
            </div>

            <div data-term-scroll style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 16px 16px',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {termList(true)}
            </div>
        </div>
    )
}
