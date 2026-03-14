import { useState, useRef, useEffect } from 'react'
import { fmt, weeksBetween, daysBetween } from '../components/TermGraph'

/* ---------- DATE ROW
   Invisible input[type=date] covers the whole row — tap anywhere opens the native picker.
   The date value is styled as a teal pill to signal it's editable.
---------- */

function DateRow({ label, value, onChange, last = false }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 12px',
        }}>
            <span style={{
                fontSize: 12,
                color: '#9f9c9c',
                fontFamily: 'Nunito, sans-serif',
            }}>{label}</span>

            {/* Teal date — tap to edit, input only covers the date text */}
            <div style={{ position: 'relative' }}>
                <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#147b75',
                    borderBottom: '1px dotted rgba(20,123,117,0.45)',
                    paddingBottom: 1,
                    fontFamily: 'Nunito, sans-serif',
                    pointerEvents: 'none',
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

function TermAccordion({ term, expanded, onToggle, onUpdate, onDelete, canDelete, noAutoScroll }) {
    const ref = useRef(null)
    const headerRef = useRef(null)
    const contentRef = useRef(null)
    const [contentHeight, setContentHeight] = useState(0)
    const prevExpanded = useRef(expanded)
    const [removingBreak, setRemovingBreak] = useState(null)

    useEffect(() => {
        if (expanded) {
            // Measure content height when expanding
            const measure = () => {
                if (contentRef.current) {
                    setContentHeight(contentRef.current.scrollHeight)
                }
            }
            measure()
            // Re-measure after a frame in case content is still rendering
            requestAnimationFrame(measure)

            // Scroll the accordion header to top of container after expand animation
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

        // Scroll new holiday into view after render
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
        <div ref={ref} style={{ border: '1px solid #f3f3f3', borderRadius: 10, background: '#fff' }}>

            {/* ── Header (2-line) ── */}
            <div ref={headerRef} onClick={onToggle} style={{ padding: '10px 12px', cursor: 'pointer', scrollMarginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        value={term.name}
                        onChange={(e) => onUpdate({ ...term, name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                            e.stopPropagation()
                        }}
                        style={{
                            fontSize: 14, fontWeight: 700, color: '#147b75',
                            fontFamily: 'Nunito, sans-serif',
                            border: 'none', background: 'transparent',
                            outline: 'none', padding: 0,
                            width: Math.max(40, term.name.length * 8),
                            borderBottom: '1px dotted rgba(20,123,117,0.45)',
                        }}
                    />
                    <span style={{
                        fontSize: 9, fontWeight: 600, color: '#9f9c9c',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{weeks} weeks</span>
                    <div style={{ flex: 1 }} />
                    <Chevron open={expanded} />
                </div>
                <div style={{ marginTop: 3 }}>
                    <span style={{
                        fontSize: 9, color: '#444',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{fmt(term.start)} - {fmt(term.end)}</span>
                </div>
            </div>

            <div style={{
                maxHeight: expanded ? contentHeight + 20 : 0,
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease, opacity 0.2s ease',
            }}>
                <div ref={contentRef}>
                    {/* ── Separator below header ── */}
                    <div style={{ height: 1, background: '#f3f3f3' }} />

                    {/* ── Term start / end ── */}
                    <DateRow label="Start" value={term.start} onChange={v => updateDate('start', v)} />
                    <DateRow label="End" value={term.end} onChange={v => updateDate('end', v)} last />
                    <div style={{ height: 6 }} />

                    {/* ── Holidays ── */}
                    {term.breaks.map((brk, i) => {
                        const days = daysBetween(brk.start, brk.end)
                        const isRemoving = removingBreak === i
                        return (
                            <div key={brk.id || i} data-break-id={brk.id} style={{
                                maxHeight: isRemoving ? 0 : 200,
                                opacity: isRemoving ? 0 : 1,
                                overflow: 'hidden',
                                transition: 'max-height 0.3s ease, opacity 0.2s ease',
                            }}>
                                <div style={{
                                    background: (brk.name && /^exams?$/i.test(brk.name.trim()))
                                        ? 'rgba(240,212,212,0.8)'
                                        : (brk.name && /reading/i.test(brk.name))
                                            ? 'rgba(212,228,240,0.8)'
                                            : 'rgba(243,243,243,0.8)',
                                    margin: '5px 10px',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                }}>
                                    {/* Holiday header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 12px 4px 12px', gap: 6,
                                    }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 700, color: '#4b4a4a',
                                            fontFamily: 'Nunito, sans-serif',
                                        }}>{brk.name || 'Holiday'}</span>
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
                                    <div style={{ height: 6 }} />
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
                                border: '1px solid #e0e0e0',
                                borderRadius: 10,
                                fontSize: 12, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#4b4a4a', cursor: 'pointer',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
                            Add Holiday
                        </button>
                    </div>
                    {canDelete && (
                        <div style={{ padding: '0 10px 8px', textAlign: 'center' }}>
                            <span
                                onClick={onDelete}
                                style={{
                                    fontSize: 10, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#e06470', cursor: 'pointer',
                                }}
                            >
                                Delete term
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
    subtitle = "If we've got anything wrong, tap on the date to edit it.",
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

        // Clean up internal marker
        const { _changedField, ...cleanUpdated } = updated

        // Shift breaks when term dates change
        if (changedField === 'start') {
            // Start changed — shift entire term (end + breaks) by the delta
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
            // End changed — keep start fixed, shift breaks that fall after the new end back
            cleanUpdated.breaks = (old.breaks || []).map(b => {
                if (b.end > cleanUpdated.end) {
                    // Clamp break to fit within term
                    const clampedEnd = cleanUpdated.end < b.start ? b.start : cleanUpdated.end
                    return { ...b, end: clampedEnd > cleanUpdated.end ? cleanUpdated.end : clampedEnd, start: b.start > cleanUpdated.end ? cleanUpdated.end : b.start }
                }
                return { ...b }
            }).filter(b => b.start <= cleanUpdated.end)
        }

        const newTerms = terms.map(t => t.id === cleanUpdated.id ? cleanUpdated : { ...t })

        // Push subsequent terms forward, preserving gaps and durations
        for (let i = idx + 1; i < newTerms.length; i++) {
            const prev = newTerms[i - 1]
            const curr = newTerms[i]
            const origGap = Math.round((toMs(terms[i].start) - toMs(terms[i - 1].end)) / DAY)
            const gap = Math.max(1, origGap) // at least 1 day gap
            const expectedStart = shiftDate(prev.end, gap)

            if (expectedStart !== curr.start) {
                const delta = Math.round((toMs(expectedStart) - toMs(curr.start)) / DAY)
                const duration = Math.round((toMs(curr.end) - toMs(curr.start)) / DAY)
                curr.start = expectedStart
                curr.end = shiftDate(curr.start, duration)
                // Shift breaks too
                curr.breaks = (curr.breaks || []).map(b => ({
                    ...b,
                    start: shiftDate(b.start, delta),
                    end: shiftDate(b.end, delta),
                }))
            }
        }

        // Push previous terms backward, preserving gaps and durations
        for (let i = idx - 1; i >= 0; i--) {
            const next = newTerms[i + 1]
            const curr = newTerms[i]
            const origGap = Math.round((toMs(terms[i + 1].start) - toMs(terms[i].end)) / DAY)
            const gap = Math.max(1, origGap)
            const expectedEnd = shiftDate(next.start, -gap)

            if (expectedEnd !== curr.end) {
                const delta = Math.round((toMs(expectedEnd) - toMs(curr.end)) / DAY)
                const duration = Math.round((toMs(curr.end) - toMs(curr.start)) / DAY)
                curr.end = expectedEnd
                curr.start = shiftDate(curr.end, -duration)
                // Shift breaks too
                curr.breaks = (curr.breaks || []).map(b => ({
                    ...b,
                    start: shiftDate(b.start, delta),
                    end: shiftDate(b.end, delta),
                }))
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
        // Phase 1: lock to measured height
        setRemovingTermId(id)
        // Phase 2: collapse on next frame
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
        // Default: 2 weeks after last term ends, 12 weeks long
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

    if (compact) {
        return (
            <div data-term-scroll style={{ display: 'flex', flexDirection: 'column' }}>
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
                        width: '100%', height: 38,
                        background: 'none',
                        border: '1px solid #e0e0e0',
                        borderRadius: 10,
                        fontSize: 13, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#147b75', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 6,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>+</span>
                    Add Term
                </button>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Title */}
            <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    {heading}
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#444', margin: 0, lineHeight: 1.5,
                }}>
                    {subtitle}
                </p>
            </div>

            {/* Scrollable terms */}
            <div data-term-scroll style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 19px 16px',
                display: 'flex',
                flexDirection: 'column',
            }}>
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

                {/* Add term button */}
                <button
                    onClick={addTerm}
                    style={{
                        width: '100%', height: 38,
                        background: 'none',
                        border: '1px solid #e0e0e0',
                        borderRadius: 10,
                        fontSize: 13, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#147b75', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 6,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>+</span>
                    Add Term
                </button>
            </div>
        </div>
    )
}
