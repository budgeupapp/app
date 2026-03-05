/* ---------- CONSTANTS ---------- */

export const AY_START = new Date(2025, 8, 1)
export const AY_END = new Date(2026, 7, 31)
export const AY_MS = AY_END - AY_START

export const MONTHS = [
    { label: 'Sep', date: new Date(2025, 8, 1) },
    { label: 'Oct', date: new Date(2025, 9, 1) },
    { label: 'Nov', date: new Date(2025, 10, 1) },
    { label: 'Dec', date: new Date(2025, 11, 1) },
    { label: 'Jan', date: new Date(2026, 0, 1) },
    { label: 'Feb', date: new Date(2026, 1, 1) },
    { label: 'Mar', date: new Date(2026, 2, 1) },
    { label: 'Apr', date: new Date(2026, 3, 1) },
    { label: 'May', date: new Date(2026, 4, 1) },
    { label: 'Jun', date: new Date(2026, 5, 1) },
    { label: 'Jul', date: new Date(2026, 6, 1) },
    { label: 'Aug', date: new Date(2026, 7, 1) },
]

export const datePct = (d) => {
    const dt = new Date(d + 'T00:00:00')
    return Math.max(0, Math.min(100, (dt - AY_START) / AY_MS * 100))
}

export const fmt = (d) => {
    const dt = new Date(d + 'T00:00:00')
    return `${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })}, ${dt.getFullYear()}`
}

export const weeksBetween = (s, e) => Math.max(0, Math.round(
    (new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / (7 * 24 * 60 * 60 * 1000)
))

export const daysBetween = (s, e) => Math.max(0, Math.round(
    (new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / (24 * 60 * 60 * 1000)
))

// Diagonal hash pattern for breaks
export const HASH_BG = `repeating-linear-gradient(
    -45deg,
    rgba(120,120,120,0.35) 0px,
    rgba(120,120,120,0.35) 1.5px,
    transparent 1.5px,
    transparent 6px
)`

/* ---------- TERM GRAPH ---------- */

export default function TermGraph({ terms, expandedTerm }) {
    const today = new Date()
    const todayPct = Math.max(0, Math.min(100, (today - AY_START) / AY_MS * 100))
    const showToday = today >= AY_START && today <= AY_END

    return (
        <div style={{
            margin: '16px 19px 0',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 0 15px rgba(0,0,0,0.1)',
            padding: '10px 14px 8px',
            flexShrink: 0,
        }}>
            <div style={{ position: 'relative', height: 108 }}>
                {/* Grid lines */}
                {[0, 20, 40, 60, 80].map(pct => (
                    <div key={pct} style={{
                        position: 'absolute', left: 0, right: 0,
                        top: `${pct}%`, borderTop: '0.5px dashed #e4e4e4',
                    }} />
                ))}

                {/* Term blocks */}
                {terms.map((term) => {
                    const sp = datePct(term.start)
                    const ep = datePct(term.end)
                    const wp = ep - sp
                    return (
                        <div key={term.id} style={{
                            position: 'absolute',
                            left: `${sp}%`, width: `${wp}%`,
                            top: 0, bottom: 0,
                            background: 'rgba(227,242,241,0.2)',
                            borderLeft: '0.5px solid #e3f2f1',
                            borderRight: '0.5px solid #e3f2f1',
                            transition: 'left 0.35s ease, width 0.35s ease',
                            overflow: 'hidden',
                        }}>
                            {term.breaks.map((brk, j) => {
                                const bsp = datePct(brk.start)
                                const bep = datePct(brk.end)
                                const bl = ((bsp - sp) / wp) * 100
                                const bw = ((bep - bsp) / wp) * 100
                                return (
                                    <div key={j} style={{
                                        position: 'absolute',
                                        left: `${bl}%`, width: `${bw}%`,
                                        top: 0, bottom: 0,
                                        background: HASH_BG,
                                        transition: 'left 0.35s ease, width 0.35s ease',
                                    }} />
                                )
                            })}
                        </div>
                    )
                })}

                {/* Today line */}
                {showToday && (
                    <div style={{
                        position: 'absolute',
                        left: `${todayPct}%`,
                        top: 0,
                        bottom: 0,
                        width: 0,
                        borderLeft: '1px dashed rgba(236,140,23,0.4)',
                    }} />
                )}

                {/* TODAY pill */}
                {showToday && (
                    <div style={{
                        position: 'absolute', left: `${todayPct}%`, top: '-50 %',
                        transform: 'translateX(-50%)',
                        background: '#EC8C17', color: '#fff',
                        fontSize: 5, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        padding: '2px 5px', borderRadius: 5,
                        whiteSpace: 'nowrap', letterSpacing: 0.5, zIndex: 1,
                    }}>TODAY</div>
                )}

                {/* Term labels */}
                {terms.map((term) => {
                    const sp = datePct(term.start)
                    const ep = datePct(term.end)
                    const mid = (sp + ep) / 2
                    return (
                        <div key={`lbl-${term.id}`} style={{
                            position: 'absolute', left: `${mid}%`, bottom: -10,
                            transform: 'translateX(-50%)',
                            background: '#e3f2f1', color: '#4a928e',
                            fontSize: 8, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            padding: '2px 14px', borderRadius: 20,
                            whiteSpace: 'nowrap',
                            border: expandedTerm === term.id ? '1px solid #7EB6B3' : '0',
                            transition: 'left 0.35s ease',
                        }}>{term.name}</div>
                    )
                })}
            </div>

            {/* Separator */}
            <div style={{ height: 1, background: '#e8e8e8', margin: '2px 0 15px' }} />

            {/* Month labels */}
            <div style={{ position: 'relative', height: 14 }}>
                {MONTHS.map(({ label, date }) => {
                    const pct = (date - AY_START) / AY_MS * 100
                    const isNow = today.getMonth() === date.getMonth() &&
                        today.getFullYear() === date.getFullYear()
                    return (
                        <span key={label} style={{
                            position: 'absolute', left: `${pct}%`,
                            transform: 'translateX(-50%)',
                            fontSize: 7, fontWeight: 500,
                            fontFamily: 'Nunito, sans-serif',
                            color: isNow ? '#147b75' : '#8f8f8f',
                            whiteSpace: 'nowrap',
                        }}>{label}</span>
                    )
                })}
            </div>
        </div >
    )
}
