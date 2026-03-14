import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect } from 'react'
import { fmt } from '../components/TermGraph'

function formatDisplay(raw) { if (!raw) return ''; const [whole, ...rest] = raw.split('.'); const f = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return rest.length ? `${f}.${rest.join('.')}` : f }
function cleanNum(val) { let v = val.replace(/[^0-9.]/g, ''); const p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join(''); if (parseFloat(v) > 500000) v = '500000'; return v }

const PERIOD_OPTIONS = [
    { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' }, { id: 'termly', label: 'Per Term' }, { id: 'yearly', label: 'Yearly' },
]
const FREQ_PILL_OPTIONS = [
    { id: 'weekly', label: 'Weekly' }, { id: 'fortnightly', label: 'Fortnightly' }, { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' }, { id: 'termly', label: 'Per Term' }, { id: 'yearly', label: 'Yearly' },
]
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']

function DropdownArrow({ color = '#e06470' }) {
    return (<svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M1 1L5 5L9 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>)
}
function Chevron({ open }) {
    return (<svg width="18" height="15" viewBox="0 0 18 15" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}><path d="M4 5.5L9 10.5L14 5.5" stroke="#9f9c9c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>)
}
function DateRow({ label, value, onChange, onDateTap, scrollRef }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 12, color: '#9f9c9c', fontFamily: 'Nunito, sans-serif' }}>{label}</span>
            <div style={{ position: 'relative' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e06470', borderBottom: '1px dotted rgba(224,100,112,0.45)', paddingBottom: 1, fontFamily: 'Nunito, sans-serif', pointerEvents: 'none' }}>{value ? fmt(value) : 'Select date'}</span>
                <input type="date" value={value || ''}
                    onFocus={() => { onDateTap?.(true); const c = scrollRef?.current; if (c) { const p = c.scrollTop; requestAnimationFrame(() => { c.scrollTop = p }) } }}
                    onBlur={() => onDateTap?.(false)} onChange={(e) => e.target.value && onChange(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 16 }} />
            </div>
        </div>
    )
}

export default function SavingsInvestmentsStep({
    savingsInvAmount, updateSavingsInvAmount,
    savingsInvAmountPeriod, updateSavingsInvAmountPeriod,
    savingsInvFrequency, updateSavingsInvFrequency,
    savingsInvNextDate, updateSavingsInvNextDate,
    terms,
    savingsInvTermDates, updateSavingsInvTermDates,
    savingsInvQuarterlyDates, updateSavingsInvQuarterlyDates,
    savingsInvVariesByTerm, updateSavingsInvVariesByTerm,
    savingsInvNonTermAmount, updateSavingsInvNonTermAmount,
    compact = false,
    heading = 'Savings & Investments',
    subtitle = "Money you're putting away for the future.",
}) {
    const amountPeriod = savingsInvAmountPeriod || 'monthly'
    const freq = amountPeriod === 'yearly' ? (savingsInvFrequency || 'monthly') : amountPeriod

    const [rawAmount, setRawAmount] = useState(() => { const n = parseFloat(String(savingsInvAmount || '').replace(/,/g, '')); return n ? String(n) : '' })
    useEffect(() => { const n = parseFloat(String(savingsInvAmount || '').replace(/,/g, '')); setRawAmount(n ? String(n) : '') }, [savingsInvAmount])

    const [rawNonTermAmount, setRawNonTermAmount] = useState(() => { const n = parseFloat(String(savingsInvNonTermAmount || '').replace(/,/g, '')); return n ? String(n) : '' })
    useEffect(() => { const n = parseFloat(String(savingsInvNonTermAmount || '').replace(/,/g, '')); setRawNonTermAmount(n ? String(n) : '') }, [savingsInvNonTermAmount])

    const [datesExpanded, setDatesExpanded] = useState(!!savingsInvNextDate)
    const [inputFocused, setInputFocused] = useState(false)
    const scrollRef = useRef(null), blurTimerRef = useRef(null), datesBoxRef = useRef(null), nextDateBoxRef = useRef(null)
    const dateActiveRef = useRef(false), freqTapRef = useRef(false)

    const scrollBoxIntoView = (ref) => {
        setTimeout(() => {
            const container = scrollRef.current; const box = ref.current
            if (!container || !box) return
            container.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 2), behavior: 'smooth' })
        }, 320)
    }

    const questionRef = useRef(null)
    const touchStartRef = useRef(null)

    const handleInputTouchStart = (e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const handleInputTouchEnd = (e) => {
        if (!touchStartRef.current) return
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y
        touchStartRef.current = null
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
        if (!compact) return
        const input = e.target
        input.focus({ preventScroll: true })
        const label = questionRef.current
        if (!label) return
        let scrollParent = label.parentElement
        while (scrollParent) {
            const style = window.getComputedStyle(scrollParent)
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scrollParent.scrollHeight > scrollParent.clientHeight) break
            scrollParent = scrollParent.parentElement
        }
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect()
            const labelRect = label.getBoundingClientRect()
            const offset = labelRect.top - parentRect.top + scrollParent.scrollTop
            const stickyHeader = scrollParent.querySelector('[data-sticky-header]')
            const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
            scrollParent.scrollTo({ top: Math.max(0, offset - headerH - 8), behavior: 'smooth' })
        }
    }

    const scrollInputToTop = (e) => {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
        setInputFocused(true); if (compact) return
        const c = scrollRef.current; if (c) { const pos = c.scrollTop; requestAnimationFrame(() => { c.scrollTop = pos }) }
    }
    const handleInputBlur = () => {
        blurTimerRef.current = setTimeout(() => {
            if (dateActiveRef.current || freqTapRef.current) { setInputFocused(false); freqTapRef.current = false; return }
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => { if (!dateActiveRef.current) setInputFocused(false) }, 500)
        }, 50)
    }
    const handleAmountChange = (e) => { const v = cleanNum(e.target.value); setRawAmount(v); updateSavingsInvAmount(v) }
    const handleNonTermAmountChange = (e) => { const v = cleanNum(e.target.value); setRawNonTermAmount(v); updateSavingsInvNonTermAmount(v) }

    const handleAmountPeriodChange = (newPeriod) => {
        updateSavingsInvAmountPeriod(newPeriod)
        if (newPeriod !== 'yearly') {
            updateSavingsInvFrequency(newPeriod)
        } else {
            if (!savingsInvFrequency || savingsInvFrequency === amountPeriod) updateSavingsInvFrequency('monthly')
        }
    }

    const handleFrequencyChange = (newFreq) => {
        freqTapRef.current = true
        updateSavingsInvFrequency(newFreq)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && (
                <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                    <h2 style={{ fontSize: 25, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px', lineHeight: 1.3 }}>{heading}</h2>
                    <p style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 16px', lineHeight: 1.5 }}>{subtitle}</p>
                </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: compact ? '0 24px 8px' : '0 24px 16px', display: 'flex', flexDirection: 'column' }} ref={scrollRef}>

                {(() => {
                    const showDual = amountPeriod !== 'yearly' && savingsInvVariesByTerm && (freq === 'weekly' || freq === 'monthly')
                    return (
                        <>
                            <p ref={questionRef} style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>How much do you put away?</p>
                            <div style={{ display: 'flex', marginBottom: showDual ? 16 : 20, transition: 'margin-bottom 0.3s ease' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', border: '1px solid #e8e8e8', borderRight: 'none',
                                        borderRadius: `10px 0 0 ${showDual ? '0' : '10px'}`,
                                        borderBottom: showDual ? '1px dashed #e8e8e8' : '1px solid #e8e8e8',
                                        padding: '0 14px', height: 40, boxSizing: 'border-box', gap: 6,
                                        transition: 'border-radius 0.3s ease',
                                    }}>
                                        <span style={{
                                            fontSize: 11, fontWeight: 600, color: '#9f9c9c', fontFamily: 'Nunito, sans-serif',
                                            whiteSpace: 'nowrap', flexShrink: 0, overflow: 'hidden',
                                            width: showDual ? 52 : 0, opacity: showDual ? 1 : 0,
                                            transition: 'width 0.3s ease, opacity 0.2s ease',
                                        }}>Term time</span>
                                        <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>{getCurrencySymbol()}</span>
                                        <input type="text" inputMode="decimal" placeholder="0.00"
                                            value={formatDisplay(rawAmount)} onChange={handleAmountChange}
                                            onTouchStart={handleInputTouchStart} onTouchEnd={handleInputTouchEnd} onFocus={scrollInputToTop} onBlur={handleInputBlur}
                                            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#000', outline: 'none', padding: 0, height: '100%', minWidth: 0 }}
                                        />
                                    </div>
                                    <div style={{
                                        maxHeight: showDual ? 40 : 0, opacity: showDual ? 1 : 0, overflow: 'hidden',
                                        transition: 'max-height 0.3s ease, opacity 0.2s ease',
                                    }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', border: '1px solid #e8e8e8', borderRight: 'none', borderTop: 'none',
                                            borderRadius: '0 0 0 10px', padding: '0 14px', height: 40, boxSizing: 'border-box', gap: 6,
                                        }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#9f9c9c', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', width: 52, flexShrink: 0 }}>Holidays</span>
                                            <span style={{ fontSize: 16, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif' }}>{getCurrencySymbol()}</span>
                                            <input type="text" inputMode="decimal" placeholder="0.00"
                                                value={formatDisplay(rawNonTermAmount)} onChange={handleNonTermAmountChange}
                                                onTouchStart={handleInputTouchStart} onTouchEnd={handleInputTouchEnd} onFocus={scrollInputToTop} onBlur={handleInputBlur}
                                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#000', outline: 'none', padding: 0, height: '100%', minWidth: 0 }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                    <select value={amountPeriod} onChange={(e) => handleAmountPeriodChange(e.target.value)}
                                        style={{ height: showDual ? 80 : 40, boxSizing: 'border-box', border: '1px solid #e8e8e8', borderRadius: '0 10px 10px 0', padding: '0 26px 0 10px', fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470', background: 'rgba(224,100,112,0.06)', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', outline: 'none', transition: 'height 0.3s ease' }}>
                                        {PERIOD_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                    </select>
                                    <DropdownArrow />
                                </div>
                            </div>
                        </>
                    )
                })()}

                {amountPeriod !== 'yearly' && (freq === 'weekly' || freq === 'monthly') && (
                    <button onClick={() => updateSavingsInvVariesByTerm(!savingsInvVariesByTerm)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', margin: 0 }}>
                        <div style={{ width: 36, height: 20, borderRadius: 10, background: savingsInvVariesByTerm ? '#e06470' : '#e0e0e0', transition: 'background 0.2s ease', position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: savingsInvVariesByTerm ? 18 : 2, transition: 'left 0.2s ease' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#444' }}>Different amount during holidays</span>
                    </button>
                )}

                {amountPeriod === 'yearly' ? (
                    <div ref={datesBoxRef} style={{ background: 'rgba(224,100,112,0.1)', borderRadius: 10, padding: '10px 12px' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>How often do you save?</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {FREQ_PILL_OPTIONS.map(o => (
                                <button key={o.id} onClick={() => handleFrequencyChange(o.id)}
                                    style={{
                                        padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                                        fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                        background: freq === o.id ? '#e06470' : 'rgba(224,100,112,0.12)',
                                        color: freq === o.id ? '#fff' : '#e06470',
                                        transition: 'all 0.15s ease',
                                    }}>
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        {(freq === 'weekly' || freq === 'monthly') && (
                            <>
                                <button onClick={() => updateSavingsInvVariesByTerm(!savingsInvVariesByTerm)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px', margin: 0 }}>
                                    <div style={{ width: 36, height: 20, borderRadius: 10, background: savingsInvVariesByTerm ? '#e06470' : 'rgba(224,100,112,0.25)', transition: 'background 0.2s ease', position: 'relative', flexShrink: 0 }}>
                                        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: savingsInvVariesByTerm ? 18 : 2, transition: 'left 0.2s ease' }} />
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#444' }}>Only during term time</span>
                                </button>
                                <div ref={nextDateBoxRef} onClick={() => { const next = !datesExpanded; setDatesExpanded(next); if (next) scrollBoxIntoView(nextDateBoxRef) }}
                                    style={{ cursor: 'pointer', paddingTop: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>I know my next payment date</p>
                                            <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '2px 0 0' }}>Optional – helps us forecast more accurately</p>
                                        </div>
                                        <Chevron open={datesExpanded} />
                                    </div>
                                    <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: datesExpanded ? 200 : 0, opacity: datesExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
                                        <div style={{ marginTop: 10 }}>
                                            <DateRow label="Next payment" value={savingsInvNextDate} onChange={updateSavingsInvNextDate} onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {freq === 'termly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>Payment dates</p>
                                    {savingsInvTermDates && Object.keys(savingsInvTermDates).length > 0 && (
                                        <button onClick={() => updateSavingsInvTermDates({})} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 8px' }}>Defaults to your term start dates — tap to change</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {(terms || []).map(term => (
                                        <DateRow key={term.id} label={term.name} value={savingsInvTermDates?.[term.id] || term.start}
                                            onChange={(val) => updateSavingsInvTermDates({ ...savingsInvTermDates, [term.id]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                    ))}
                                </div>
                            </>
                        )}

                        {freq === 'quarterly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>Payment dates</p>
                                    {savingsInvQuarterlyDates && Object.values(savingsInvQuarterlyDates).some((v, i) => v !== QUARTER_DEFAULTS[i]) && (
                                        <button onClick={() => { const defaults = {}; QUARTER_DEFAULTS.forEach((d, i) => { defaults[i] = d }); updateSavingsInvQuarterlyDates(defaults) }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 8px' }}>When is each quarterly payment due?</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {QUARTER_LABELS.map((label, i) => (
                                        <DateRow key={i} label={label} value={savingsInvQuarterlyDates?.[i] || QUARTER_DEFAULTS[i]}
                                            onChange={(val) => updateSavingsInvQuarterlyDates({ ...savingsInvQuarterlyDates, [i]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                    ))}
                                </div>
                            </>
                        )}

                        {freq === 'yearly' && (
                            <DateRow label="Payment date" value={savingsInvNextDate || '2025-09-01'} onChange={updateSavingsInvNextDate}
                                onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                        )}
                    </div>
                ) : (
                    <div ref={datesBoxRef}
                        onClick={() => {
                            if (freq === 'termly' || freq === 'quarterly') return
                            const next = !datesExpanded; setDatesExpanded(next)
                            if (next) setTimeout(() => {
                                const container = scrollRef.current; const box = datesBoxRef.current
                                if (!container || !box) return
                                container.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 2), behavior: 'smooth' })
                            }, 320)
                        }}
                        style={{ background: 'rgba(224,100,112,0.1)', borderRadius: 10, padding: '10px 12px', cursor: (freq === 'termly' || freq === 'quarterly') ? 'default' : 'pointer' }}>

                        {(freq === 'weekly' || freq === 'monthly') && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>I know my next payment date</p>
                                        <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '2px 0 0' }}>Optional – helps us forecast your budget more accurately</p>
                                    </div>
                                    <Chevron open={datesExpanded} />
                                </div>
                                <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: datesExpanded ? 200 : 0, opacity: datesExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.2s ease' }}>
                                    <div style={{ marginTop: 10 }}>
                                        <DateRow label="Next payment" value={savingsInvNextDate} onChange={updateSavingsInvNextDate} onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                    </div>
                                </div>
                            </>
                        )}

                        {freq === 'termly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>Payment dates</p>
                                    {savingsInvTermDates && Object.keys(savingsInvTermDates).length > 0 && (
                                        <button onClick={(e) => { e.stopPropagation(); updateSavingsInvTermDates({}) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 8px' }}>Defaults to your term start dates — tap to change</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {(terms || []).map(term => (
                                        <DateRow key={term.id} label={term.name} value={savingsInvTermDates?.[term.id] || term.start}
                                            onChange={(val) => updateSavingsInvTermDates({ ...savingsInvTermDates, [term.id]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                    ))}
                                </div>
                            </>
                        )}

                        {freq === 'quarterly' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#000', margin: 0 }}>Payment dates</p>
                                    {savingsInvQuarterlyDates && Object.values(savingsInvQuarterlyDates).some((v, i) => v !== QUARTER_DEFAULTS[i]) && (
                                        <button onClick={(e) => { e.stopPropagation(); const defaults = {}; QUARTER_DEFAULTS.forEach((d, i) => { defaults[i] = d }); updateSavingsInvQuarterlyDates(defaults) }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 8px' }}>When is each quarterly payment due?</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {QUARTER_LABELS.map((label, i) => (
                                        <DateRow key={i} label={label} value={savingsInvQuarterlyDates?.[i] || QUARTER_DEFAULTS[i]}
                                            onChange={(val) => updateSavingsInvQuarterlyDates({ ...savingsInvQuarterlyDates, [i]: val })}
                                            onDateTap={(active) => { dateActiveRef.current = active }} scrollRef={scrollRef} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {inputFocused && !compact && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
