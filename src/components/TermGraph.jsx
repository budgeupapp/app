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
  #E8E8E8 0px,
  #E8E8E8 1px,
  transparent 1px,
  transparent 2.5px
)`

/* ---------- BALANCE HELPERS ---------- */

const Y_AXIS_W = 26

function calcYRange(bal) {
    const b = typeof bal === 'number' && !isNaN(bal) ? bal : 0
    const mag = Math.max(Math.abs(b), 200)

    let step = 50
    if (mag > 100) step = 100
    if (mag > 300) step = 200
    if (mag > 600) step = 500
    if (mag > 1500) step = 1000
    if (mag > 3000) step = 2000
    if (mag > 8000) step = 5000

    const rawYMax = b + 1.5 * step
    const yMax = Math.ceil(rawYMax / step) * step
    const yMin = yMax - 4 * step
    const ticks = [0, 1, 2, 3, 4].map(i => yMin + i * step)

    return { yMin, yMax, ticks }
}

function fmtMoney(v) {
    const abs = Math.abs(v)
    const str = abs >= 1000
        ? `£${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
        : `£${abs}`
    return v < 0 ? `-${str}` : str
}

/* ---------- TERM GRAPH ---------- */

export default function TermGraph({ terms, expandedTerm, balance }) {
    const today = new Date()
    const todayPct = Math.max(0, Math.min(100, (today - AY_START) / AY_MS * 100))
    const showToday = today >= AY_START && today <= AY_END

    const hasBalance = balance !== undefined

    const balNum = hasBalance
        ? (typeof balance === 'number' ? balance : (parseFloat(String(balance || '0').replace(/,/g, '')) || 0))
        : 0
    const { yMin, yMax, ticks } = hasBalance ? calcYRange(balNum) : { yMin: 0, yMax: 100, ticks: [] }
    const toTopPct = (val) => Math.max(2, Math.min(98, 100 - ((val - yMin) / (yMax - yMin)) * 100))
    const balTopPct = hasBalance ? toTopPct(balNum) : 0

    return (
        <div style={{
            margin: '16px 19px 0',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 0 15px rgba(0,0,0,0.1)',
            padding: '10px 14px 8px 8px',
            flexShrink: 0,
        }}>
            <div style={{ display: 'flex', height: 108 }}>
                {/* Y-axis — always reserves space so graph width is consistent */}
                <div style={{ width: Y_AXIS_W, position: 'relative', flexShrink: 0 }}>
                    {hasBalance && ticks.map((tick, i) => (
                        <div key={i} style={{
                            position: 'absolute',
                            right: 4,
                            top: `${toTopPct(tick)}%`,
                            transform: 'translateY(-50%)',
                            fontSize: 6,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#9f9c9c',
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                        }}>
                            {fmtMoney(tick)}
                        </div>
                    ))}
                </div>

                {/* Graph area */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {/* Grid lines */}
                    {
                        [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(pct => (
                            <div key={pct} style={{
                                position: 'absolute', left: 0, right: 0,
                                top: `${pct}%`, borderTop: '0.5px dashed #e4e4e4',
                            }} />
                        ))
                    }

                    {/* Term blocks */}
                    {terms.map((term) => {
                        const sp = datePct(term.start)
                        const ep = datePct(term.end)
                        const wp = ep - sp
                        return (
                            <div key={term.id} style={{
                                position: 'absolute',
                                left: `${sp}%`, width: `${wp}%`,
                                top: 0, bottom: -2,
                                background: 'rgba(227,242,241,0.2)',
                                borderLeft: '0.5px solid #e3f2f1',
                                borderRight: '0.5px solid #e3f2f1',
                                transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease',
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
                                            transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease',
                                        }} />
                                    )
                                })}
                            </div>
                        )
                    })}

                    {/* Balance-mode: gradient fill + teal projection line */}
                    {hasBalance && showToday && (
                        <>
                            <div style={{
                                position: 'absolute',
                                left: `${todayPct}%`, right: 0,
                                top: `${balTopPct}%`, bottom: 0,
                                background: 'linear-gradient(to bottom, rgba(20,123,117,0.08), rgba(20,123,117,0))',
                                pointerEvents: 'none',
                            }} />
                            <div style={{
                                position: 'absolute',
                                left: `${todayPct}%`, right: 0,
                                top: `${balTopPct}%`,
                                height: 0,
                                borderTop: '1.5px solid rgba(20,123,117,0.5)',
                                pointerEvents: 'none',
                            }} />
                        </>
                    )}

                    {/* Today vertical dashed line */}
                    {showToday && (
                        <div style={{
                            position: 'absolute',
                            left: `${todayPct}%`,
                            top: 0, bottom: 0,
                            width: 0,
                            borderLeft: '1px dashed rgba(236,140,23,0.4)',
                        }} />
                    )}

                    {/* TODAY pill */}
                    {showToday && (
                        <div style={{
                            position: 'absolute', left: `${todayPct}%`, top: -5,
                            transform: 'translateX(-50%)',
                            background: '#EC8C17', color: '#fff',
                            fontSize: 5, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            padding: '2px 5px', borderRadius: 5,
                            whiteSpace: 'nowrap', letterSpacing: 0.5, zIndex: 2,
                        }}>TODAY</div>
                    )}

                    {/* Balance-mode: orange dot at balance position */}
                    {hasBalance && showToday && (
                        <div style={{
                            position: 'absolute',
                            left: `${todayPct}%`,
                            top: `${balTopPct}%`,
                            transform: 'translate(-50%, -50%)',
                            width: 10, height: 10,
                            borderRadius: '50%',
                            background: '#EC8C17',
                            border: '1px solid white',
                            boxShadow: '0 0 4px 2px rgba(236,140,23,0.2)',
                            zIndex: 3,
                        }} />
                    )}

                    {/* Term labels at bottom */}
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
                                transition: hasBalance ? undefined : 'left 0.35s ease',
                            }}>{term.name}</div>
                        )
                    })}
                </div>
            </div>

            {/* Separator */}
            <div style={{ height: 0.2, background: '#e8e8e8', margin: '2px 0 15px' }} />

            {/* Month labels */}
            <div style={{ position: 'relative', height: 14, marginLeft: Y_AXIS_W }}>
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
        </div>
    )
}
