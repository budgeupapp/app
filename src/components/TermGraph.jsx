import { useState, useEffect, useRef, useCallback } from 'react'
import { getGraphStart, getMonthsFromStart, getCurrencySymbol } from '../lib/settings'

/* ---------- CONSTANTS ---------- */

function computeAY() {
    const start = getGraphStart()
    const [y, m, d] = start.split('-').map(Number)
    const ayStart = new Date(y, m - 1, d) // Sep 1, 2025
    const ayEnd = new Date(y + 1, m - 1, d - 1) // Aug 31, 2026
    return { ayStart, ayEnd, ayMs: ayEnd - ayStart }
}

const _ay = computeAY()
export let AY_START = _ay.ayStart
export let AY_END = _ay.ayEnd
export let AY_MS = _ay.ayMs
export let MONTHS = getMonthsFromStart()

export function refreshAY() {
    const ay = computeAY()
    AY_START = ay.ayStart
    AY_END = ay.ayEnd
    AY_MS = ay.ayMs
    MONTHS = getMonthsFromStart()
}

// Convert a Date object to evenly-spaced percentage (each month = 1/12 width)
export const datePctFromDate = (dt) => {
    const startMonth = AY_START.getMonth()
    const startYear = AY_START.getFullYear()
    const monthIdx = (dt.getFullYear() - startYear) * 12 + dt.getMonth() - startMonth
    const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
    const dayFrac = (dt.getDate() - 1) / daysInMonth
    return Math.max(0, Math.min(100, (monthIdx + dayFrac) / 12 * 100))
}

export const datePct = (d) => {
    const dt = new Date(d + 'T00:00:00')
    return datePctFromDate(dt)
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

const Y_AXIS_W = 35

function calcYRange(bal, projMin, projMax) {
    const b = typeof bal === 'number' && !isNaN(bal) ? bal : 0
    const lo = projMin !== undefined ? Math.min(b, projMin) : b
    const hi = projMax !== undefined ? Math.max(b, projMax) : b
    const mag = Math.max(Math.abs(hi), Math.abs(lo), Math.max(hi - lo, 200))

    let step = 50
    if (mag > 100) step = 100
    if (mag > 300) step = 200
    if (mag > 600) step = 500
    if (mag > 1500) step = 1000
    if (mag > 3000) step = 2000
    if (mag > 8000) step = 5000
    if (mag > 15000) step = 10000
    if (mag > 30000) step = 20000
    if (mag > 80000) step = 50000

    const yMax = Math.ceil((hi + 1.5 * step) / step) * step
    const yMin = Math.min(yMax - 4 * step, Math.floor((lo - step) / step) * step)
    const allTicks = []
    for (let v = yMin; v <= yMax; v += step) allTicks.push(v)

    // Thin out ticks to max 4-5 visible labels, keeping 0 centered
    let ticks = allTicks
    let skip = 2
    while (ticks.length > 8) {
        // Find index of 0 (or closest to 0) and filter relative to it
        const zeroIdx = allTicks.indexOf(0)
        if (zeroIdx >= 0) {
            ticks = allTicks.filter((_, i) => (i - zeroIdx) % skip === 0)
        } else {
            ticks = allTicks.filter((_, i) => i % skip === 0)
        }
        skip++
    }
    // Ensure 0 is always included if it's in range
    if (yMin <= 0 && yMax >= 0 && !ticks.includes(0)) {
        ticks.push(0)
        ticks.sort((a, b) => a - b)
    }

    return { yMin, yMax, ticks }
}

function fmtMoney(v) {
    const sym = getCurrencySymbol()
    const abs = Math.abs(v)
    const str = abs >= 1000
        ? `${sym}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
        : `${sym}${abs}`
    return v < 0 ? `-${str}` : str
}

/* ---------- TERM GRAPH ---------- */

export default function TermGraph({ terms, expandedTerm, balance, actualBalance, overdraft, events = [], hiddenEventTypes = [], currentEventType, onEventClick, onBalanceClick, onOverdraftClick, onTermClick, footer, showDotsToggle, onToggleDots, showIncome, onToggleIncome, showExpenses, onToggleExpenses, graphHeight = 108, marginTop = 16, graphHeightRef, forceGreenDots = false, forceDotColor = null, hideDots = false, balanceHistory = [], showBalanceHistory = true, activeEventDot = null }) {
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayPct = datePctFromDate(todayMidnight)
    const showToday = today >= AY_START && today <= AY_END

    const hasBalance = balance !== undefined

    // Animate orange dot + line when balance appears/disappears
    const [balanceAnimated, setBalanceAnimated] = useState(false)
    const [dotAnimated, setDotAnimated] = useState(false)
    const [balanceVisible, setBalanceVisible] = useState(false)
    const prevHasBalance = useRef(false)
    const balanceExitTimer = useRef(null)
    useEffect(() => {
        if (hasBalance && !prevHasBalance.current) {
            // Entering: show elements, dot pops in first, then lines expand out
            if (balanceExitTimer.current) { clearTimeout(balanceExitTimer.current); balanceExitTimer.current = null }
            setBalanceVisible(true)
            requestAnimationFrame(() => {
                setDotAnimated(true)
                setBalanceAnimated(true)
            })
        } else if (!hasBalance && prevHasBalance.current) {
            // Exiting: lines shrink into dot first, then dot shrinks
            setBalanceAnimated(false)
            balanceExitTimer.current = setTimeout(() => {
                setDotAnimated(false)
                balanceExitTimer.current = setTimeout(() => {
                    setBalanceVisible(false)
                    balanceExitTimer.current = null
                }, 450)
            }, 500)
        }
        prevHasBalance.current = hasBalance
        return () => { if (balanceExitTimer.current) clearTimeout(balanceExitTimer.current) }
    }, [hasBalance])

    const balNum = hasBalance
        ? (typeof balance === 'number' ? balance : (parseFloat(String(balance || '0').replace(/,/g, '')) || 0))
        : 0
    // Actual current balance for the today dot (falls back to balNum if not provided)
    const actualBalNum = actualBalance != null
        ? (typeof actualBalance === 'number' ? actualBalance : (parseFloat(String(actualBalance || '0').replace(/,/g, '')) || 0))
        : balNum

    // Split events into past and future (exclude removed from balance line)
    const activeEvents = events.filter(e => !e.removed)
    const pastEvents = hasBalance ? activeEvents
        .filter(e => datePct(e.date) <= todayPct && e.amount > 0)
        .sort((a, b) => datePct(a.date) - datePct(b.date))
        : []
    const futureEvents = hasBalance ? activeEvents
        .filter(e => datePct(e.date) > todayPct && e.amount > 0)
        .sort((a, b) => datePct(a.date) - datePct(b.date))
        : []
    // Removed events (for showing as deleted dots on current card)
    const removedFutureEvents = hasBalance ? events
        .filter(e => e.removed && datePct(e.date) > todayPct && e.amount > 0)
        .sort((a, b) => datePct(a.date) - datePct(b.date))
        : []
    const removedPastEvents = hasBalance ? events
        .filter(e => e.removed && datePct(e.date) <= todayPct && e.amount > 0)
        .sort((a, b) => datePct(a.date) - datePct(b.date))
        : []

    const hasEvents = futureEvents.length > 0
    const hasPastEvents = pastEvents.length > 0

    // Compute projected balance range for y-axis (include past events too)
    let projMin = Math.min(balNum, actualBalNum), projMax = Math.max(balNum, actualBalNum)
    if (hasEvents) {
        let running = balNum
        for (const evt of futureEvents) {
            running += evt.type === 'income' ? evt.amount : -evt.amount
            projMin = Math.min(projMin, running)
            projMax = Math.max(projMax, running)
        }
    }
    // Factor in past event amounts so y-axis fits the historical line too
    if (hasPastEvents) {
        // Walk backwards from balance to find starting balance before past events
        let historicalBal = balNum
        for (let i = pastEvents.length - 1; i >= 0; i--) {
            const evt = pastEvents[i]
            historicalBal -= evt.type === 'income' ? evt.amount : -evt.amount
        }
        // Walk forward tracking all intermediate balances
        let running = historicalBal
        projMin = Math.min(projMin, running)
        projMax = Math.max(projMax, running)
        for (const evt of pastEvents) {
            running += evt.type === 'income' ? evt.amount : -evt.amount
            projMin = Math.min(projMin, running)
            projMax = Math.max(projMax, running)
        }
    }

    // Include overdraft in y-range so the line is visible
    const hasOverdraft = typeof overdraft === 'number' && overdraft > 0
    if (hasOverdraft) {
        projMin = Math.min(projMin, -overdraft)
    }

    // Include balance history in y-range
    if (balanceHistory.length > 0) {
        for (const bh of balanceHistory) {
            const v = Number(bh.balance)
            if (!isNaN(v)) {
                projMin = Math.min(projMin, v)
                projMax = Math.max(projMax, v)
            }
        }
    }

    const anyEvents = hasEvents || hasPastEvents
    const hasHistoryData = balanceHistory.length > 0
    const { yMin, yMax, ticks } = hasBalance
        ? calcYRange(balNum, (anyEvents || hasOverdraft || hasHistoryData) ? projMin : undefined, (anyEvents || hasOverdraft || hasHistoryData) ? projMax : undefined)
        : { yMin: 0, yMax: 100, ticks: [] }
    const toTopPct = (val) => Math.max(2, Math.min(98, 100 - ((val - yMin) / (yMax - yMin)) * 100))
    const balTopPctLive = hasBalance ? toTopPct(actualBalNum) : 0
    const balTopPctRef = useRef(balTopPctLive)
    if (hasBalance) balTopPctRef.current = balTopPctLive
    // During exit animation, freeze position at last known value
    const balTopPct = hasBalance ? balTopPctLive : balTopPctRef.current

    // Animate stepped line when event count changes
    const [eventsRevealed, setEventsRevealed] = useState(false)
    const prevEventCountRef = useRef(0)

    useEffect(() => {
        if (futureEvents.length > 0) {
            if (futureEvents.length !== prevEventCountRef.current) {
                setEventsRevealed(false)
            }
            prevEventCountRef.current = futureEvents.length
            const t = setTimeout(() => setEventsRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setEventsRevealed(false)
        prevEventCountRef.current = 0
    }, [futureEvents.length])

    // Animate past stepped line when past event count changes
    const [pastRevealed, setPastRevealed] = useState(false)
    const prevPastCountRef = useRef(0)

    useEffect(() => {
        if (pastEvents.length > 0) {
            if (pastEvents.length !== prevPastCountRef.current) {
                setPastRevealed(false)
            }
            prevPastCountRef.current = pastEvents.length
            const t = setTimeout(() => setPastRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setPastRevealed(false)
        prevPastCountRef.current = 0
    }, [pastEvents.length])

    // Animate balance history dots growing in with line draw
    const [balHistRevealed, setBalHistRevealed] = useState(false)
    useEffect(() => {
        if (showBalanceHistory && balanceHistory.length > 0) {
            setBalHistRevealed(false)
            const t = setTimeout(() => setBalHistRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setBalHistRevealed(false)
    }, [showBalanceHistory, balanceHistory.length])

    // Build stepped path points and dot positions
    const steppedPath = (() => {
        if (!hasEvents || !hasBalance) return null

        // Separate discrete events from weekly spend (gradient)
        const discreteEvents = futureEvents.filter(e => e.editType !== 'weeklySpend')
        const weeklyEvents = futureEvents.filter(e => e.editType === 'weeklySpend')

        let bal = balNum
        const points = [{ x: todayPct, y: toTopPct(bal) }]
        const dots = []

        // Helper: sum weekly spend between two x positions
        const weeklySpendBetween = (x1, x2) => {
            return weeklyEvents
                .filter(e => { const ex = datePct(e.date); return ex > x1 && ex <= x2 })
                .reduce((sum, e) => sum + e.amount, 0)
        }

        let prevX = todayPct

        for (const evt of discreteEvents) {
            const x = datePct(evt.date)
            // Apply weekly spend as gradient slope to this event's date
            const spent = weeklySpendBetween(prevX, x)
            if (spent > 0) {
                const balAtEvent = bal - spent
                points.push({ x, y: toTopPct(balAtEvent) })
                bal = balAtEvent
            } else {
                points.push({ x, y: toTopPct(bal) })
            }
            // Step for the discrete event
            const yBefore = toTopPct(bal)
            bal += evt.type === 'income' ? evt.amount : -evt.amount
            const yAfter = toTopPct(bal)
            points.push({ x, y: yAfter })
            dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: bal })
            prevX = x
        }

        // Apply remaining weekly spend as gradient to end
        const remainingSpend = weeklySpendBetween(prevX, 100)
        bal -= remainingSpend
        points.push({ x: 100, y: toTopPct(bal) })

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const fillPath = linePath + ` L 100 100 L ${todayPct} 100 Z`

        return { linePath, fillPath, dots, points }
    })()

    // Build past events path (faded, leading up to today)
    const pastPath = (() => {
        if (!hasPastEvents || !hasBalance) return null

        // Separate discrete events from weekly spend (gradient)
        const discretePast = pastEvents.filter(e => e.editType !== 'weeklySpend')
        const weeklyPast = pastEvents.filter(e => e.editType === 'weeklySpend')

        // Walk backwards from current balance to find starting balance before past events
        let startBal = balNum
        for (let i = pastEvents.length - 1; i >= 0; i--) {
            const evt = pastEvents[i]
            startBal -= evt.type === 'income' ? evt.amount : -evt.amount
        }

        let bal = startBal
        // Always start from the beginning of the academic year (September)
        const points = [{ x: 0, y: toTopPct(bal) }]
        const dots = []

        // Helper: sum weekly spend between two x positions
        const weeklySpendBetween = (x1, x2) => {
            return weeklyPast
                .filter(e => { const ex = Math.max(0.5, datePct(e.date)); return ex > x1 && ex <= x2 })
                .reduce((sum, e) => sum + e.amount, 0)
        }

        let prevX = 0

        for (const evt of discretePast) {
            const x = Math.max(0.5, datePct(evt.date))
            // Apply weekly spend as gradient slope to this event's date
            const spent = weeklySpendBetween(prevX, x)
            if (spent > 0) {
                const balAtEvent = bal - spent
                points.push({ x, y: toTopPct(balAtEvent) })
                bal = balAtEvent
            } else {
                points.push({ x, y: toTopPct(bal) })
            }
            // Step at event
            const yBefore = toTopPct(bal)
            bal += evt.type === 'income' ? evt.amount : -evt.amount
            const yAfter = toTopPct(bal)
            points.push({ x, y: yAfter })
            dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: bal })
            prevX = x
        }

        // Apply remaining weekly spend as gradient to today
        const remainingSpend = weeklySpendBetween(prevX, todayPct)
        bal -= remainingSpend
        points.push({ x: todayPct, y: toTopPct(bal) })

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const startX = points[0].x
        const fillPath = linePath + ` L ${todayPct} 100 L ${startX} 100 Z`

        return { linePath, fillPath, dots, points }
    })()

    /* ---------- TAPPED DOT TOOLTIPS ---------- */
    const [tappedHistDot, setTappedHistDot] = useState(null) // { date, balance, x, y }

    // Dismiss balance tooltip on any tap outside
    useEffect(() => {
        if (!tappedHistDot) return
        const dismiss = () => setTappedHistDot(null)
        document.addEventListener('pointerdown', dismiss)
        return () => document.removeEventListener('pointerdown', dismiss)
    }, [tappedHistDot])

    /* ---------- SCRUBBER ---------- */

    const [scrubData, setScrubData] = useState(null)
    const scrubRef = useRef({ active: false, longPressTimer: null, startX: 0, startY: 0 })
    const scrubLineRef = useRef(null)
    const scrubDotRef = useRef(null)
    const scrubTooltipRef = useRef(null)

    // Build combined points array for balance interpolation (y% → balance via inverse of toTopPct)
    // Combine past + future points into sorted lookup
    const balancePoints = (() => {
        const pts = []
        if (pastPath?.points) pts.push(...pastPath.points)
        // Past path ends at todayPct, steppedPath starts at todayPct — skip duplicate
        if (steppedPath?.points) {
            const startIdx = pts.length > 0 && steppedPath.points.length > 0 && Math.abs(steppedPath.points[0].x - todayPct) < 0.1 ? 1 : 0
            for (let i = startIdx; i < steppedPath.points.length; i++) pts.push(steppedPath.points[i])
        }
        // If no paths but have balance, add flat line
        if (pts.length === 0 && hasBalance) {
            pts.push({ x: 0, y: toTopPct(balNum) }, { x: 100, y: toTopPct(balNum) })
        }
        return pts
    })()

    // All event dots combined
    const allDots = [...(pastPath?.dots || []), ...(steppedPath?.dots || [])]

    // Keep refs for scrubber calculations (avoids stale closures in touch handlers)
    const balancePointsRef = useRef(balancePoints)
    balancePointsRef.current = balancePoints
    const allDotsRef = useRef(allDots)
    allDotsRef.current = allDots
    const yRangeRef = useRef({ yMin, yMax })
    yRangeRef.current = { yMin, yMax }
    const balNumRef = useRef(balNum)
    balNumRef.current = balNum
    const balanceHistoryRef = useRef(balanceHistory)
    balanceHistoryRef.current = balanceHistory

    const updateScrubPosition = useCallback((clientX) => {
        const container = graphContainerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const graphLeft = rect.left + Y_AXIS_W
        const graphWidth = rect.width - Y_AXIS_W
        const relX = (clientX - graphLeft) / graphWidth
        const z = zoomRef.current
        const p = panRef.current
        const center = 50 - p
        const viewLeft = center - 50 / z
        const xPct = Math.max(0, Math.min(100, viewLeft + relX * (100 / z)))

        // Interpolate balance at xPct
        const pts = balancePointsRef.current
        const { yMin: ym, yMax: ymx } = yRangeRef.current
        const yToBal = (yP) => ym + (100 - yP) / 100 * (ymx - ym)
        let balance = balNumRef.current
        if (pts.length > 0) {
            if (xPct <= pts[0].x) balance = yToBal(pts[0].y)
            else if (xPct >= pts[pts.length - 1].x) balance = yToBal(pts[pts.length - 1].y)
            else {
                for (let i = 0; i < pts.length - 1; i++) {
                    if (xPct >= pts[i].x && xPct <= pts[i + 1].x) {
                        const seg = pts[i + 1].x - pts[i].x
                        if (seg < 0.001) { balance = yToBal(pts[i + 1].y); break }
                        const t = (xPct - pts[i].x) / seg
                        balance = yToBal(pts[i].y + t * (pts[i + 1].y - pts[i].y))
                        break
                    }
                }
            }
        }

        // Find nearest event dot
        let nearbyDot = null, bestDist = Infinity
        const threshold = 2.5 / (z || 1)
        for (const dot of allDotsRef.current) {
            const d = Math.abs(dot.x - xPct)
            if (d < bestDist && d < threshold) { bestDist = d; nearbyDot = dot }
        }

        // Convert xPct to date
        const monthFloat = (xPct / 100) * 12
        const monthIdx = Math.floor(monthFloat)
        const dayFrac = monthFloat - monthIdx
        const startMonth = AY_START.getMonth()
        const startYear = AY_START.getFullYear()
        const m = startMonth + monthIdx
        const yr = startYear + Math.floor(m / 12)
        const mo = m % 12
        const daysInMonth = new Date(yr, mo + 1, 0).getDate()
        const day = Math.min(daysInMonth, Math.max(1, Math.round(1 + dayFrac * daysInMonth)))
        const date = new Date(yr, mo, day)

        // Direct DOM update for scrub line + dot (60fps)
        const yPct = 100 - ((balance - ym) / (ymx - ym)) * 100
        const clampedY = Math.max(2, Math.min(98, yPct))
        if (scrubLineRef.current) {
            scrubLineRef.current.style.left = `${xPct}%`
            scrubLineRef.current.style.opacity = '1'
        }
        if (scrubDotRef.current) {
            scrubDotRef.current.style.left = `${xPct}%`
            scrubDotRef.current.style.top = `${clampedY}%`
            scrubDotRef.current.style.opacity = '1'
        }

        // Position tooltip in viewport space (fixed positioning)
        if (scrubTooltipRef.current) {
            const tooltipX = Math.max(rect.left + 45, Math.min(rect.right - 45, clientX))
            const tooltipY = rect.top + 10
            scrubTooltipRef.current.style.left = `${tooltipX}px`
            scrubTooltipRef.current.style.top = `${tooltipY}px`
            scrubTooltipRef.current.style.opacity = '1'
        }

        // Find actual balance from history for this date
        let actualBal = null
        const hist = balanceHistoryRef.current
        if (hist.length > 0) {
            const scrubDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            // Find exact match or nearest earlier entry
            let best = null
            for (const bh of hist) {
                if (bh.recorded_date <= scrubDateStr) {
                    if (!best || bh.recorded_date > best.recorded_date) best = bh
                }
            }
            if (best) actualBal = Number(best.balance)
        }

        setScrubData({ xPct, balance, date, nearbyDot, actualBal })
    }, [])

    /* ---------- ZOOM & PAN ---------- */

    const MAX_ZOOM = 36
    const [zoom, setZoom] = useState(1)
    const [panX, setPanX] = useState(0)
    const graphContainerRef = useRef(null)
    const zoomDivRef = useRef(null)
    const xAxisDivRef = useRef(null)
    const animRef = useRef(null)
    const [isAnimatingZoom, setIsAnimatingZoom] = useState(false)
    const [isZoomingOut, setIsZoomingOut] = useState(false)
    const isZoomed = zoom > 1.05

    // Live refs — gesture handlers read/write these, React state syncs on gesture end
    const zoomRef = useRef(1)
    const panRef = useRef(0)
    // Separate ref for label rendering — jumps to target zoom instantly so labels don't flash
    const labelZoomRef = useRef(1)

    const clampPan = (pan, z) => {
        if (z <= 1) return 0
        const maxPan = ((z - 1) / z) * 50
        return Math.max(-maxPan, Math.min(maxPan, pan))
    }

    // Direct DOM update — bypasses React for 60fps during gestures
    const applyTransform = (z, p) => {
        zoomRef.current = z
        panRef.current = p
        const center = 50 - p
        const left = 50 - center * z
        const width = z * 100
        if (zoomDivRef.current) {
            zoomDivRef.current.style.left = `${left}%`
            zoomDivRef.current.style.width = `${width}%`
        }
        if (xAxisDivRef.current) {
            xAxisDivRef.current.style.left = `${left}%`
            xAxisDivRef.current.style.width = `${width}%`
        }
    }

    // Sync refs to React state (triggers re-render for conditional elements)
    const syncToState = () => {
        setZoom(zoomRef.current)
        setPanX(panRef.current)
        // Keep labelZoom in sync unless animateTo has already set it to target
        if (!animRef.current) labelZoomRef.current = zoomRef.current
    }

    // Zoom into a focal point — the focal point stays fixed on screen throughout
    const animateZoomTo = useCallback((focalPct, targetZoom, duration = 450) => {
        if (animRef.current) cancelAnimationFrame(animRef.current)
        const startZoom = zoomRef.current
        const startTime = performance.now()
        setIsAnimatingZoom(true)

        const tick = (now) => {
            const elapsed = now - startTime
            const progress = Math.min(1, elapsed / duration)
            // Smooth ease-out curve
            const ease = 1 - Math.pow(1 - progress, 4)
            const z = startZoom + (targetZoom - startZoom) * ease
            const p = clampPan(50 - focalPct, z)
            applyTransform(z, p)
            if (progress < 1) {
                animRef.current = requestAnimationFrame(tick)
            } else {
                const finalPan = clampPan(50 - focalPct, targetZoom)
                applyTransform(targetZoom, finalPan)
                animRef.current = null
                setIsAnimatingZoom(false)
                syncToState()
            }
        }
        animRef.current = requestAnimationFrame(tick)
    }, [])

    // Smooth animate to target zoom/pan
    const animateTo = useCallback((targetZoom, targetPan, duration = 350) => {
        if (animRef.current) cancelAnimationFrame(animRef.current)
        const startZoom = zoomRef.current
        const startPan = panRef.current
        const startTime = performance.now()
        const zoomingOut = targetZoom < startZoom - 0.1
        setIsAnimatingZoom(true)
        if (zoomingOut) setIsZoomingOut(true)
        // Jump label zoom to target immediately so correct labels render without flash
        labelZoomRef.current = targetZoom
        syncToState()

        const tick = (now) => {
            const elapsed = now - startTime
            const progress = Math.min(1, elapsed / duration)
            const ease = 1 - Math.pow(1 - progress, 3)
            const z = startZoom + (targetZoom - startZoom) * ease
            const p = startPan + (targetPan - startPan) * ease
            applyTransform(z, p)
            if (progress < 1) {
                animRef.current = requestAnimationFrame(tick)
            } else {
                applyTransform(targetZoom, targetPan)
                animRef.current = null
                setIsAnimatingZoom(false)
                if (zoomingOut) setIsZoomingOut(false)
                syncToState()
            }
        }
        animRef.current = requestAnimationFrame(tick)
    }, [])

    // Touch gesture state
    const touchRef = useRef({
        isPinching: false,
        startDist: 0, startZoom: 1, startPanX: 0, startFocalPct: 50,
        startX: 0, startTime: 0,
        lastX: 0, lastTime: 0, velocityX: 0,
        lastTap: 0,
        lastSyncTime: 0,
    })
    const momentumRef = useRef(null)

    const zoomEnabled = events.length > 0
    const zoomEnabledRef = useRef(zoomEnabled)
    zoomEnabledRef.current = zoomEnabled

    const handleTouchStart = useCallback((e) => {
        const s = scrubRef.current
        // Cancel any pending long-press timer
        if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null }
        // Dismiss tapped dot tooltip
        setTappedHistDot(null)

        if (!zoomEnabledRef.current && !hasBalance) return
        const t = touchRef.current

        // Check for double-tap first — handle it cleanly without disrupting animation state
        if (e.touches.length === 1 && zoomEnabledRef.current) {
            const now = Date.now()
            if (now - t.lastTap < 300) {
                t.isDoubleTap = true
                t.lastTap = 0 // reset so a third tap doesn't re-trigger
                // Cancel any momentum but not mid-animation
                if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null }
                if (zoomRef.current > 1.05) {
                    animateTo(1, 0, 400)
                } else {
                    const container = graphContainerRef.current
                    if (container) {
                        const rect = container.getBoundingClientRect()
                        const graphLeft = rect.left + Y_AXIS_W
                        const graphWidth = rect.width - Y_AXIS_W
                        const tapRel = (e.touches[0].clientX - graphLeft) / graphWidth
                        const tapPct = tapRel * 100
                        const targetZoom = 8
                        animateZoomTo(tapPct, targetZoom, 450)
                    }
                }
                e.preventDefault()
                return
            }
            t.lastTap = now
        }

        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
        if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null }

        if (e.touches.length === 2) {
            // Cancel scrub if pinch starts
            if (s.active) { s.active = false; setScrubData(null) }
            t.isPinching = true
            const dx = e.touches[0].clientX - e.touches[1].clientX
            const dy = e.touches[0].clientY - e.touches[1].clientY
            t.startDist = Math.hypot(dx, dy)
            t.startZoom = zoomRef.current
            t.startPanX = panRef.current
            const container = graphContainerRef.current
            if (container) {
                const rect = container.getBoundingClientRect()
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
                const focalXRel = (midX - rect.left) / rect.width
                t.startFocalPct = (50 - panRef.current) + (focalXRel - 0.5) * (100 / t.startZoom)
            }
            e.preventDefault()
        } else if (e.touches.length === 1) {
            t.isPinching = false
            t.isDoubleTap = false
            t.isPanning = false
            t.startX = e.touches[0].clientX
            t.lastX = e.touches[0].clientX
            t.startPanX = panRef.current
            t.startTime = performance.now()
            t.lastTime = performance.now()
            t.velocityX = 0

            // Start long-press timer for scrubber (only when balance exists)
            if (hasBalance) {
                s.startX = e.touches[0].clientX
                s.startY = e.touches[0].clientY
                s.longPressTimer = setTimeout(() => {
                    s.active = true
                    s.longPressTimer = null
                    if (navigator.vibrate) navigator.vibrate(10)
                    updateScrubPosition(s.startX)
                }, 300)
            }
        }
    }, [animateTo, hasBalance, updateScrubPosition])

    const handleTouchMove = useCallback((e) => {
        const t = touchRef.current
        const s = scrubRef.current

        // If scrubber is active, update scrub position and bail
        if (s.active && e.touches.length === 1) {
            e.preventDefault()
            updateScrubPosition(e.touches[0].clientX)
            return
        }

        // Cancel long-press timer if finger moves too far before activation
        if (s.longPressTimer && e.touches.length === 1) {
            const dx = e.touches[0].clientX - s.startX
            const dy = e.touches[0].clientY - s.startY
            if (Math.hypot(dx, dy) > 8) {
                clearTimeout(s.longPressTimer)
                s.longPressTimer = null
            }
        }

        if (t.isDoubleTap) return // block panning during double-tap zoom animation
        if (e.touches.length === 2 && t.isPinching) {
            e.preventDefault()
            const dx = e.touches[0].clientX - e.touches[1].clientX
            const dy = e.touches[0].clientY - e.touches[1].clientY
            const dist = Math.hypot(dx, dy)
            const newZoom = Math.max(1, Math.min(MAX_ZOOM, t.startZoom * (dist / t.startDist)))

            const container = graphContainerRef.current
            if (container) {
                const rect = container.getBoundingClientRect()
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
                const focalXRel = (midX - rect.left) / rect.width
                const newPan = clampPan(
                    50 - t.startFocalPct + (focalXRel - 0.5) * (100 / newZoom),
                    newZoom
                )
                applyTransform(newZoom, newPan)
                // Throttled state sync so x-axis labels update during pinch
                const now = performance.now()
                if (now - t.lastSyncTime > 80) {
                    t.lastSyncTime = now
                    syncToState()
                }
            }
        } else if (e.touches.length === 1 && !t.isPinching && zoomRef.current > 1) {
            const container = graphContainerRef.current
            if (container) {
                const now = performance.now()
                const dx = e.touches[0].clientX - t.startX
                // Dead zone: don't pan until finger moves >5px (allows taps on dots)
                if (Math.abs(dx) < 5 && !t.isPanning) return
                t.isPanning = true
                const pctShift = (dx / container.getBoundingClientRect().width) * 100 / zoomRef.current
                const newPan = clampPan(t.startPanX + pctShift, zoomRef.current)
                applyTransform(zoomRef.current, newPan)

                const dt = now - t.lastTime
                if (dt > 0) {
                    const vx = (e.touches[0].clientX - t.lastX) / dt
                    t.velocityX = vx * 0.6 + t.velocityX * 0.4
                }
                t.lastX = e.touches[0].clientX
                t.lastTime = now
            }
        }
    }, [])

    const handleTouchEnd = useCallback((e) => {
        const t = touchRef.current
        const s = scrubRef.current

        // Clear long-press timer
        if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null }
        // Deactivate scrubber
        if (s.active) {
            s.active = false
            setScrubData(null)
            if (scrubLineRef.current) scrubLineRef.current.style.opacity = '0'
            if (scrubDotRef.current) scrubDotRef.current.style.opacity = '0'
            if (scrubTooltipRef.current) scrubTooltipRef.current.style.opacity = '0'
            return
        }

        if (e.touches.length < 2 && t.isPinching) {
            t.isPinching = false
            if (zoomRef.current < 1.15) {
                animateTo(1, 0, 200)
            } else {
                // Sync labels to final pinch zoom level
                syncToState()
            }
            // If 1 finger remains, transition to pan — set up pan state from current refs
            if (e.touches.length === 1) {
                t.startX = e.touches[0].clientX
                t.lastX = e.touches[0].clientX
                t.startPanX = panRef.current
                t.startTime = performance.now()
                t.lastTime = performance.now()
                t.velocityX = 0
                return
            }
        }
        if (e.touches.length === 0) {
            if (zoomRef.current > 1) {
                const v = t.velocityX
                if (Math.abs(v) > 0.15) {
                    const container = graphContainerRef.current
                    if (!container) { syncToState(); return }
                    const width = container.getBoundingClientRect().width
                    let velocity = v
                    const friction = 0.95
                    const step = () => {
                        velocity *= friction
                        if (Math.abs(velocity) < 0.01) {
                            momentumRef.current = null
                            syncToState()
                            return
                        }
                        const pctShift = (velocity * 16) / width * 100 / zoomRef.current
                        const newPan = clampPan(panRef.current + pctShift, zoomRef.current)
                        applyTransform(zoomRef.current, newPan)
                        momentumRef.current = requestAnimationFrame(step)
                    }
                    momentumRef.current = requestAnimationFrame(step)
                } else {
                    syncToState()
                }
            } else {
                syncToState()
            }
        }
    }, [animateTo])

    useEffect(() => {
        const el = graphContainerRef.current
        if (!el) return
        el.addEventListener('touchstart', handleTouchStart, { passive: false })
        el.addEventListener('touchmove', handleTouchMove, { passive: false })
        el.addEventListener('touchend', handleTouchEnd)
        return () => {
            el.removeEventListener('touchstart', handleTouchStart)
            el.removeEventListener('touchmove', handleTouchMove)
            el.removeEventListener('touchend', handleTouchEnd)
        }
    }, [handleTouchStart, handleTouchMove, handleTouchEnd])

    useEffect(() => {
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current)
            if (momentumRef.current) cancelAnimationFrame(momentumRef.current)
        }
    }, [])

    // Reset zoom when events disappear (e.g. switching to term dates or bank balance view)
    useEffect(() => {
        if (!zoomEnabled && zoomRef.current > 1) {
            animateTo(1, 0, 300)
        }
    }, [zoomEnabled])

    // Width-based zoom: read from refs so React re-renders never cause position jumps
    const centerPct = 50 - panRef.current
    const innerLeft = 50 - centerPct * zoomRef.current
    const innerWidth = zoomRef.current * 100

    return (
        <div style={{
            margin: `${marginTop}px 19px 0`,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 0 15px rgba(0,0,0,0.1)',
            padding: '10px 14px 4px 4px',
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
            userSelect: 'none',
            WebkitUserSelect: 'none',
        }}>
            {/* Income / Expenses toggle buttons */}
            {(onToggleIncome || onToggleExpenses) && (
                <div style={{
                    position: 'absolute', top: 12, right: 8, zIndex: 10,
                    display: 'flex', gap: 5,
                }}>
                    {onToggleIncome && (
                        <button
                            onClick={onToggleIncome}
                            style={{
                                background: showIncome ? 'rgba(20,123,117,0.12)' : '#fff',
                                border: showIncome ? '1.5px solid #147b75' : '1.5px solid #ddd',
                                borderRadius: 14, cursor: 'pointer',
                                padding: '3px 8px 3px 6px', display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={showIncome ? '#147b75' : '#bbb'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                {showIncome ? (
                                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                                ) : (
                                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                                )}
                            </svg>
                            <span style={{
                                fontSize: 9, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                color: showIncome ? '#147b75' : '#999',
                            }}>Income</span>
                        </button>
                    )}
                    {onToggleExpenses && (
                        <button
                            onClick={onToggleExpenses}
                            style={{
                                background: showExpenses ? 'rgba(224,100,112,0.12)' : '#fff',
                                border: showExpenses ? '1.5px solid #e06470' : '1.5px solid #ddd',
                                borderRadius: 14, cursor: 'pointer',
                                padding: '3px 8px 3px 6px', display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={showExpenses ? '#e06470' : '#bbb'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                {showExpenses ? (
                                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                                ) : (
                                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                                )}
                            </svg>
                            <span style={{
                                fontSize: 9, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                color: showExpenses ? '#e06470' : '#999',
                            }}>Expenses</span>
                        </button>
                    )}
                </div>
            )}

            <div ref={(el) => { graphContainerRef.current = el; if (graphHeightRef) graphHeightRef.current = el }} style={{ display: 'flex', height: graphHeight, overflowX: 'clip', overflowY: 'visible', willChange: 'height' }}>
                {/* Y-axis — always reserves space so graph width is consistent */}
                <div style={{ width: Y_AXIS_W, position: 'relative', flexShrink: 0 }}>
                    {balanceVisible && ticks.map((tick, i) => (
                        <div key={tick} style={{
                            position: 'absolute',
                            right: 8,
                            top: `${toTopPct(tick)}%`,
                            transform: 'translateY(-50%)',
                            fontSize: 7,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#9f9c9c',
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                            opacity: balanceAnimated ? 1 : 0,
                            transition: 'top 0.5s ease, opacity 0.4s ease',
                        }}>
                            {fmtMoney(tick)}
                        </div>
                    ))}
                </div>

                {/* Graph area — clip X so lines/fill don't bleed into y-axis */}
                <div onClick={() => setTappedHistDot(null)} style={{ flex: 1, position: 'relative', overflowX: 'clip', overflowY: 'visible' }}>
                    <div ref={zoomDivRef} style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${innerLeft}%`,
                        width: `${innerWidth}%`,
                        willChange: zoom > 1 ? 'left, width' : undefined,
                    }}>
                        {/* Grid lines + zero line + overdraft line — all in one SVG for consistent strokeWidth */}
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}>
                            {ticks.map(tick => {
                                if (tick === 0 && hasBalance && yMin < 0 && yMax > 0) return null
                                const pct = toTopPct(tick)
                                return (
                                    <line key={tick} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`}
                                        stroke="#e4e4e4" strokeWidth="0.5" strokeDasharray="3 3"
                                        vectorEffect="non-scaling-stroke" />
                                )
                            })}
                            {/* Zero line — same strokeWidth as balance line */}
                            {hasBalance && yMin < 0 && yMax > 0 && (
                                <line x1="0" y1={`${toTopPct(0)}%`} x2="100%" y2={`${toTopPct(0)}%`}
                                    stroke={hasOverdraft ? 'rgba(160,160,160,0.55)' : 'rgba(224,100,112,0.7)'}
                                    strokeWidth="1.5" strokeDasharray="4 3"
                                    vectorEffect="non-scaling-stroke" />
                            )}
                            {/* Overdraft limit line */}
                            {hasBalance && hasOverdraft && (
                                <line x1="0" y1={`${toTopPct(-overdraft)}%`} x2="100%" y2={`${toTopPct(-overdraft)}%`}
                                    stroke="rgba(224,100,112,0.65)" strokeWidth="1.5" strokeDasharray="4 3"
                                    vectorEffect="non-scaling-stroke" />
                            )}
                        </svg>

                        {/* Overdraft label */}
                        {hasBalance && hasOverdraft && (() => {
                            const odPct = toTopPct(-overdraft)
                            return (
                                <>
                                    <div
                                        onClick={onOverdraftClick ? (e) => {
                                            e.stopPropagation()
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            onOverdraftClick({ clickX: rect.left + rect.width / 2, clickY: rect.bottom })
                                        } : undefined}
                                        style={{
                                            position: 'absolute',
                                            right: 4,
                                            top: `${odPct}%`,
                                            transform: 'translateY(-50%)',
                                            display: 'flex', alignItems: 'center', gap: 3,
                                            background: '#fde8ea',
                                            borderRadius: 4,
                                            padding: '1px 4px',
                                            pointerEvents: onOverdraftClick ? 'auto' : 'none',
                                            cursor: onOverdraftClick ? 'pointer' : 'default',
                                            zIndex: 2,
                                        }}>
                                        <span style={{
                                            fontSize: 6,
                                            fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: 'rgba(224,100,112,0.8)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            Overdraft −{getCurrencySymbol()}{overdraft.toLocaleString()}
                                        </span>
                                    </div>
                                </>
                            )
                        })()}

                        {/* Term blocks */}
                        {terms.map((term) => {
                            const sp = datePct(term.start)
                            const ep = datePct(term.end)
                            const wp = ep - sp
                            const isExpanded = expandedTerm === term.id
                            return (
                                <div key={term.id}
                                    onClick={(e) => { e.stopPropagation(); onTermClick?.(term.id) }}
                                    style={{
                                        position: 'absolute',
                                        left: `${sp}%`, width: `${wp}%`,
                                        top: 0, bottom: -2,
                                        background: isExpanded ? 'rgba(227,242,241,0.45)' : 'rgba(227,242,241,0.2)',
                                        borderLeft: '0.5px solid #e3f2f1',
                                        borderRight: '0.5px solid #e3f2f1',
                                        transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease, background 0.3s ease',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
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

                        {/* Balance line extending left from today to start (only when no past events) */}
                        {balanceVisible && showToday && !pastPath && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: 0, right: `${100 - todayPct}%`,
                                    top: `${balTopPct}%`, bottom: 0,
                                    background: 'linear-gradient(to bottom, rgba(20,123,117,0.05), rgba(20,123,117,0))',
                                    pointerEvents: 'none',
                                    transformOrigin: 'right',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    opacity: balanceAnimated ? 1 : 0,
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, opacity 0.3s ease 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1), opacity 0.3s ease',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    left: 0, right: `${100 - todayPct}%`,
                                    top: `${balTopPct}%`,
                                    height: 0,
                                    borderTop: `1.5px solid rgba(20,123,117,0.25)`,
                                    pointerEvents: 'none',
                                    transformOrigin: 'right',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                                }} />
                            </>
                        )}

                        {/* Past events: dots */}
                        {balanceVisible && !hideDots && pastPath && (
                            <>
                                {pastPath.dots.filter(dot => !dot.event.noDot).map((dot, i) => {
                                    const isIncome = dot.event.type === 'income'
                                    const isHidden = hiddenEventTypes.includes(dot.event.editType)
                                    const isCurrent = !currentEventType || dot.event.editType === currentEventType
                                    const isDimmed = currentEventType && !isCurrent
                                    const delay = 0.25 + i * 0.12
                                    const forcedColor = forceDotColor === 'green' ? '#147b75' : forceDotColor === 'red' ? '#e06470' : (forceGreenDots ? '#147b75' : null)
                                    const bg = forcedColor
                                        ? forcedColor
                                        : isDimmed
                                            ? (isIncome ? '#d4eae9' : '#f8dde0')
                                            : (currentEventType && isCurrent)
                                                ? (isIncome ? '#147b75' : '#e06470')
                                                : (isIncome ? '#a8d5d3' : '#f2c4c8')
                                    const isActive = activeEventDot && activeEventDot.date === dot.event.date && activeEventDot.editType === dot.event.editType
                                    return (
                                        <div
                                            key={`past-${i}`}
                                            onClick={(e) => { e.stopPropagation(); onEventClick?.({ ...dot.event, balanceAfter: dot.balanceAfter }, e) }}
                                            style={{
                                                position: 'absolute',
                                                left: `clamp(5px, ${dot.x}%, calc(100% - 5px))`,
                                                top: `${dot.yAfter}%`,
                                                transform: (pastRevealed || isZoomed) && !isHidden
                                                    ? `translate(-50%, -50%)`
                                                    : `translate(-50%, -50%) scale(0)`,
                                                opacity: (pastRevealed || isZoomed) && !isHidden ? 1 : 0,
                                                padding: 10,
                                                cursor: 'pointer',
                                                zIndex: isActive ? 20 : (isCurrent ? 8 : 4),
                                                transition: isZoomed
                                                    ? 'transform 0.15s ease'
                                                    : pastRevealed
                                                        ? 'transform 0.15s ease, opacity 0.2s ease, background 0.2s ease'
                                                        : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                            }}
                                        >
                                            <div style={{
                                                width: isActive ? 14 : (isDimmed ? 8 : 10), height: isActive ? 14 : (isDimmed ? 8 : 10),
                                                borderRadius: '50%',
                                                background: bg,
                                                border: isActive ? '2px solid white' : (isCurrent ? '1px solid white' : '0.75px solid white'),
                                                boxShadow: isActive
                                                    ? `0 0 8px ${isIncome ? 'rgba(20,123,117,0.7)' : 'rgba(224,100,112,0.7)'}`
                                                    : 'none',
                                                transition: 'width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease, border 0.15s ease',
                                            }} />
                                        </div>
                                    )
                                })}
                            </>
                        )}

                        {/* (Stepped path SVGs rendered outside zoom div below) */}

                        {/* Balance-mode: flat projection (no events) */}
                        {balanceVisible && showToday && !steppedPath && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: `${todayPct}%`, right: 0,
                                    top: `${balTopPct}%`, bottom: 0,
                                    background: 'linear-gradient(to bottom, rgba(20,123,117,0.08), rgba(20,123,117,0))',
                                    pointerEvents: 'none',
                                    transformOrigin: 'left',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    opacity: balanceAnimated ? 1 : 0,
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, opacity 0.3s ease 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1), opacity 0.3s ease',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    left: `${todayPct}%`, right: 0,
                                    top: `${balTopPct}%`,
                                    height: 0,
                                    borderTop: `1.5px solid #147b75`,
                                    pointerEvents: 'none',
                                    transformOrigin: 'left',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                                }} />
                            </>
                        )}

                        {/* Event dots (clickable) — pop in sequentially after line draws */}
                        {balanceVisible && !hideDots && showToday && steppedPath && steppedPath.dots.filter(dot => !dot.event.noDot).map((dot, i) => {
                            const isIncome = dot.event.type === 'income'
                            const isHidden = hiddenEventTypes.includes(dot.event.editType)
                            const isCurrent = !currentEventType || dot.event.editType === currentEventType
                            const forcedColor2 = forceDotColor === 'green' ? '#147b75' : forceDotColor === 'red' ? '#e06470' : (forceGreenDots ? '#147b75' : null)
                            const color = forcedColor2
                                ? forcedColor2
                                : isCurrent
                                    ? (isIncome ? '#147b75' : '#e06470')
                                    : (isIncome ? '#a8d5d3' : '#f2c4c8')
                            const delay = 0.25 + i * 0.12
                            const isActive = activeEventDot && activeEventDot.date === dot.event.date && activeEventDot.editType === dot.event.editType
                            return (
                                <div
                                    key={i}
                                    onClick={(e) => { if (!isHidden) { e.stopPropagation(); onEventClick?.({ ...dot.event, balanceAfter: dot.balanceAfter }, e) } }}
                                    style={{
                                        position: 'absolute',
                                        left: `clamp(5px, ${dot.x}%, calc(100% - 5px))`,
                                        top: `${dot.yAfter}%`,
                                        transform: (eventsRevealed || isZoomed) && !isHidden
                                            ? `translate(-50%, -50%)`
                                            : `translate(-50%, -50%) scale(0)`,
                                        opacity: (eventsRevealed || isZoomed) && !isHidden ? 1 : 0,
                                        padding: 10,
                                        cursor: 'pointer',
                                        pointerEvents: 'auto',
                                        zIndex: isActive ? 20 : (isCurrent ? 8 : 5),
                                        transition: isZoomed
                                            ? 'transform 0.15s ease'
                                            : eventsRevealed
                                                ? 'transform 0.15s ease, opacity 0.2s ease'
                                                : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                    }}
                                >
                                    <div style={{
                                        width: isActive ? 14 : (isCurrent ? 10 : 8), height: isActive ? 14 : (isCurrent ? 10 : 8),
                                        borderRadius: '50%',
                                        background: color,
                                        border: isActive ? '2px solid white' : (isCurrent ? '1px solid white' : '0.75px solid white'),
                                        boxShadow: isActive
                                            ? `0 0 8px ${isIncome ? 'rgba(20,123,117,0.7)' : 'rgba(224,100,112,0.7)'}`
                                            : 'none',
                                        transition: 'width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease, border 0.15s ease',
                                    }} />
                                </div>
                            )
                        })}

                        {/* Removed event dots — only show on the related card */}
                        {balanceVisible && showToday && currentEventType && (() => {
                            // Combine all active events sorted by date to compute balance at any point
                            const allSorted = [...pastEvents, ...futureEvents].sort((a, b) => datePct(a.date) - datePct(b.date))
                            // Walk backwards from balNum through past events to find start balance
                            let startBal = balNum
                            for (let i = pastEvents.length - 1; i >= 0; i--) {
                                const e = pastEvents[i]
                                startBal -= e.type === 'income' ? e.amount : -e.amount
                            }

                            return [...removedFutureEvents, ...removedPastEvents]
                                .filter(evt => evt.editType === currentEventType)
                                .map((evt, i) => {
                                    const x = datePct(evt.date)
                                    const evtPct = x
                                    // Find balance at this date by walking active events
                                    let bal = startBal
                                    for (const ae of allSorted) {
                                        if (datePct(ae.date) > evtPct) break
                                        bal += ae.type === 'income' ? ae.amount : -ae.amount
                                    }
                                    const isIncome = evt.type === 'income'
                                    const dotColor = isIncome ? '#a8d5d3' : '#f0a8ae'
                                    return (
                                        <div
                                            key={`removed-${i}`}
                                            onClick={(e) => { e.stopPropagation(); onEventClick?.({ ...evt, balanceAfter: null }, e) }}
                                            style={{
                                                position: 'absolute',
                                                left: `clamp(5px, ${x}%, calc(100% - 5px))`,
                                                top: `${toTopPct(bal)}%`,
                                                transform: 'translate(-50%, -50%)',
                                                padding: 10,
                                                cursor: 'pointer',
                                                pointerEvents: 'auto',
                                                zIndex: 6,
                                            }}
                                        >
                                            <svg width="11" height="11" viewBox="0 0 11 11" style={{ overflow: 'visible', display: 'block' }}>
                                                <circle cx="5.5" cy="5.5" r="4" fill={dotColor} stroke={dotColor} strokeWidth="1.5" strokeDasharray="2 2" />
                                            </svg>
                                        </div>
                                    )
                                })
                        })()}

                        {/* Colored vertical step lines at events — fade in with dots */}
                        {balanceVisible && !hideDots && showToday && steppedPath && steppedPath.dots
                            .filter(dot => !dot.event.noDot && !hiddenEventTypes.includes(dot.event.editType))
                            .map((dot, i) => {
                                const isIncome = dot.event.type === 'income'
                                const color = isIncome ? '#147b75' : '#e06470'
                                const topY = Math.min(dot.yBefore, dot.yAfter)
                                const height = Math.abs(dot.yAfter - dot.yBefore)
                                const delay = 0.25 + i * 0.12
                                return (
                                    <div
                                        key={`step-${i}`}
                                        style={{
                                            position: 'absolute',
                                            left: `clamp(0px, ${dot.x}%, 100%)`,
                                            top: `${topY}%`,
                                            height: `${height}%`,
                                            width: 0,
                                            borderLeft: `1.5px dashed ${color}`,
                                            transform: undefined,
                                            pointerEvents: 'none',
                                            zIndex: 3,
                                            opacity: (eventsRevealed || isZoomed) ? 0.6 : 0,
                                            transition: `opacity 0.3s ease ${delay}s`,
                                        }}
                                    />
                                )
                            })}

                        {/* Today vertical dashed line */}
                        {showToday && (
                            <div style={{
                                position: 'absolute',
                                left: `${todayPct}%`,
                                top: 0, bottom: 0,
                                width: 0,
                                borderLeft: '1px dashed rgba(236,140,23,0.4)',
                                transform: `translateX(-0.5px)`,
                            }} />
                        )}

                        {/* TODAY pill */}
                        {showToday && (
                            <div style={{
                                position: 'absolute', left: `${todayPct}%`, top: -5,
                                transform: `translateX(-50%)`,
                                background: '#EC8C17', color: '#fff',
                                fontSize: 5, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                padding: '2px 5px', borderRadius: 5,
                                whiteSpace: 'nowrap', letterSpacing: 0.5, zIndex: 2,
                            }}>TODAY</div>
                        )}

                        {/* Balance-mode: orange dot at balance position */}
                        {balanceVisible && showToday && (() => {
                            const isOneOff = currentEventType === 'oneOffIncome' || currentEventType === 'oneOffExpense'
                            const hasCurrentAtToday = isOneOff && currentEventType && pastEvents.some(e => e.editType === currentEventType && Math.abs(datePct(e.date) - todayPct) < 0.5)
                            const todayDate = new Date()
                            const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`
                            const isTodayTapped = tappedHistDot?.date === '__today__'
                            return (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if (isTodayTapped) {
                                            setTappedHistDot(null)
                                        } else {
                                            setTappedHistDot({ date: '__today__', balance: actualBalNum, x: todayPct, y: balTopPct })
                                        }
                                        onBalanceClick?.(e)
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: `${todayPct}%`,
                                        top: `${balTopPct}%`,
                                        transform: dotAnimated
                                            ? `translate(-50%, -50%) scale(${isTodayTapped ? 1.15 : 1})`
                                            : 'translate(-50%, -50%) scale(0)',
                                        width: isTodayTapped ? 15 : 13, height: isTodayTapped ? 15 : 13,
                                        borderRadius: '50%',
                                        background: '#EC8C17',
                                        border: '2px solid white',
                                        boxShadow: isTodayTapped
                                            ? '0 0 8px 3px rgba(236,140,23,0.5)'
                                            : '0 0 4px 2px rgba(236,140,23,0.2)',
                                        cursor: 'pointer',
                                        zIndex: hasCurrentAtToday ? 3 : 12,
                                        pointerEvents: hasCurrentAtToday ? 'none' : 'auto',
                                        transition: zoom > 1
                                            ? 'top 0.5s ease, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease'
                                            : dotAnimated
                                                ? 'transform 0.5s ease, top 0.5s ease, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease'
                                                : 'transform 0.4s cubic-bezier(.22,1,.36,1)',
                                    }}
                                />
                            )
                        })()}

                        {/* Term labels at bottom — fade when zoomed, hide if clipped */}
                        {terms.map((term) => {
                            const sp = datePct(term.start)
                            const ep = datePct(term.end)
                            const mid = (sp + ep) / 2
                            // Estimate label width as ~50px; container is ~100% so convert
                            // Hide label if centering it at mid% would clip the left edge
                            const containerW = graphContainerRef.current?.offsetWidth || 320
                            const labelHalfW = 28 // ~half of pill width in px
                            const midPx = (mid / 100) * containerW
                            if (midPx < labelHalfW || midPx > containerW - labelHalfW) return null
                            return (
                                <div
                                    key={`lbl-${term.id}`}
                                    onClick={(e) => { e.stopPropagation(); if (!isZoomed) onTermClick?.(term.id) }}
                                    style={{
                                        position: 'absolute', left: `${mid}%`, bottom: -10,
                                        transform: 'translateX(-50%)',
                                        background: '#e3f2f1', color: '#4a928e',
                                        fontSize: 8, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        padding: '2px 14px', borderRadius: 20,
                                        whiteSpace: 'nowrap',
                                        cursor: isZoomed ? 'default' : 'pointer',
                                        border: expandedTerm === term.id ? '1px solid #7EB6B3' : '0',
                                        opacity: isZoomed ? 0 : 1,
                                        pointerEvents: isZoomed ? 'none' : 'auto',
                                        transition: hasBalance
                                            ? 'opacity 0.3s ease'
                                            : 'left 0.35s ease, opacity 0.3s ease',
                                    }}
                                >{term.name}</div>
                            )
                        })}

                        {/* Past events: stepped line + fill (inside zoom div — no CSS scale so strokes stay clean) */}
                        {balanceVisible && pastPath && (
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                style={{
                                    position: 'absolute', inset: 0,
                                    width: '100%', height: '100%',
                                    overflow: 'visible',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                }}
                            >
                                <defs>
                                    <linearGradient id="pastStepGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="rgba(20,123,117,0.05)" />
                                        <stop offset="100%" stopColor="rgba(20,123,117,0)" />
                                    </linearGradient>
                                </defs>
                                <path
                                    d={pastPath.fillPath}
                                    fill="url(#pastStepGrad)"
                                    opacity={(pastRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease 0.4s' }}
                                />
                                <path
                                    d={pastPath.linePath}
                                    fill="none"
                                    stroke="rgba(20,123,117,0.45)"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                    opacity={(pastRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease' }}
                                />
                            </svg>
                        )}

                        {/* Future events: stepped line + fill */}
                        {balanceVisible && showToday && steppedPath && (
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                style={{
                                    position: 'absolute', inset: 0,
                                    width: '100%', height: '100%',
                                    overflow: 'visible',
                                    pointerEvents: 'none',
                                    zIndex: 2,
                                }}
                            >
                                <defs>
                                    <linearGradient id="stepGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="rgba(20,123,117,0.08)" />
                                        <stop offset="100%" stopColor="rgba(20,123,117,0)" />
                                    </linearGradient>
                                </defs>
                                <path
                                    d={steppedPath.fillPath}
                                    fill="url(#stepGrad)"
                                    opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease 0.4s' }}
                                />
                                <path
                                    d={steppedPath.linePath}
                                    fill="none"
                                    stroke="#147b75"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                    opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease' }}
                                />
                            </svg>
                        )}
                        {/* Balance history: dashed orange line + dots */}
                        {balanceHistory.length > 0 && (() => {
                            // Sort by date, dedupe per date (keep latest), filter to valid range
                            const byDate = new Map()
                            for (const bh of balanceHistory) {
                                if (!byDate.has(bh.recorded_date)) byDate.set(bh.recorded_date, bh)
                            }
                            const sorted = [...byDate.values()]
                                .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
                            // Exclude today — the dedicated today dot already covers it
                            const todayDate = new Date()
                            const todayIso = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`
                            const allHistPoints = sorted
                                .filter(bh => bh.recorded_date !== todayIso)
                                .map(bh => ({
                                    x: datePct(bh.recorded_date),
                                    y: toTopPct(Number(bh.balance)),
                                    balance: Number(bh.balance),
                                    date: bh.recorded_date,
                                })).filter(p => p.x > 0.5 && p.x < 99.5)
                            if (allHistPoints.length === 0) return null
                            // Always use all points for the line, plus today's balance to connect
                            const linePoints = [...allHistPoints, { x: todayPct, y: balTopPctLive }]
                            const pathD = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                            // Show dots: always include latest (last point), then every 5 days going backwards
                            const dayStep = zoom >= 4 ? 1 : zoom >= 2 ? 7 : 14
                            const dotPoints = dayStep === 1 ? allHistPoints : (() => {
                                const last = allHistPoints[allHistPoints.length - 1]
                                const pts = [last]
                                let lastDate = last.date
                                for (let i = allHistPoints.length - 2; i >= 0; i--) {
                                    const daysDiff = Math.round((new Date(lastDate) - new Date(allHistPoints[i].date)) / 86400000)
                                    if (daysDiff >= dayStep) {
                                        pts.push(allHistPoints[i])
                                        lastDate = allHistPoints[i].date
                                    }
                                }
                                return pts.reverse()
                            })()
                            // Cumulative path lengths for syncing dot delays with line draw
                            const segLens = [0]
                            for (let i = 1; i < linePoints.length; i++) {
                                const prev = linePoints[i - 1]
                                const dx = linePoints[i].x - prev.x, dy = linePoints[i].y - prev.y
                                segLens.push(segLens[i - 1] + Math.sqrt(dx * dx + dy * dy))
                            }
                            const rawPathLen = segLens[segLens.length - 1]
                            const pathLen = rawPathLen * 20
                            const DRAW_DUR = 0.6 // seconds, matches line transition
                            const maskId = `bh-mask-${allHistPoints.length}`
                            return (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    pointerEvents: showBalanceHistory ? 'auto' : 'none',
                                }}>
                                    {allHistPoints.length > 1 && (
                                        <svg
                                            viewBox="0 0 100 100"
                                            preserveAspectRatio="none"
                                            style={{
                                                position: 'absolute', inset: 0,
                                                width: '100%', height: '100%',
                                                overflow: 'visible',
                                                pointerEvents: 'none',
                                                zIndex: 10,
                                            }}
                                        >
                                            <path
                                                d={pathD}
                                                fill="none"
                                                stroke="#EC8C17"
                                                strokeWidth="2"
                                                strokeDasharray="5 4"
                                                strokeLinejoin="round"
                                                vectorEffect="non-scaling-stroke"
                                                style={{
                                                    clipPath: balHistRevealed ? 'inset(0 0% 0 0)' : 'inset(0 0 0 100%)',
                                                    WebkitClipPath: balHistRevealed ? 'inset(0 0% 0 0)' : 'inset(0 0 0 100%)',
                                                    transition: 'clip-path 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), -webkit-clip-path 0.6s cubic-bezier(0.22, 0.61, 0.36, 1)',
                                                }}
                                            />
                                        </svg>
                                    )}
                                    {dotPoints.map((p, i) => {
                                        const isActive = tappedHistDot?.date === p.date
                                        // Find this dot's position along the path to sync with line draw
                                        const dotIdx = linePoints.findIndex(lp => lp.date === p.date)
                                        const pct = dotIdx >= 0 && rawPathLen > 0 ? segLens[dotIdx] / rawPathLen : (i / dotPoints.length)
                                        const delay = balHistRevealed ? (1 - pct) * DRAW_DUR : 0
                                        return (
                                            <div
                                                key={`bh-${p.date}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setTappedHistDot(isActive ? null : p)
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${p.x}%`,
                                                    top: `${p.y}%`,
                                                    transform: balHistRevealed
                                                        ? 'translate(-50%, -50%) scale(1)'
                                                        : 'translate(-50%, -50%) scale(0)',
                                                    width: isActive ? 14 : 10, height: isActive ? 14 : 10,
                                                    borderRadius: '50%',
                                                    background: '#EC8C17',
                                                    border: `2px solid ${isActive ? '#fff' : 'white'}`,
                                                    boxShadow: isActive ? '0 0 8px rgba(236,140,23,0.7)' : '0 1px 4px rgba(236,140,23,0.5)',
                                                    pointerEvents: showBalanceHistory ? 'auto' : 'none',
                                                    cursor: 'pointer',
                                                    zIndex: isActive ? 20 : 11,
                                                    transition: `transform 0.3s cubic-bezier(.34,1.56,.64,1) ${delay}s, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease`,
                                                }}
                                            />
                                        )
                                    })}
                                </div>
                            )
                        })()}

                        {/* Tapped balance dot tooltip (works for history dots and today dot) */}
                        {tappedHistDot && (() => {
                            const isToday = tappedHistDot.date === '__today__'
                            const dateLabel = isToday ? 'Today' : (() => {
                                const dt = new Date(tappedHistDot.date + 'T00:00:00')
                                return `${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })}`
                            })()
                            const sym = getCurrencySymbol()
                            const showBelow = tappedHistDot.y < 25
                            return (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: `${tappedHistDot.x}%`,
                                        top: `${tappedHistDot.y}%`,
                                        transform: showBelow ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 9px))',
                                        background: '#fff',
                                        borderRadius: 8,
                                        padding: '5px 8px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                        zIndex: 30,
                                        pointerEvents: 'none',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <span style={{
                                        fontSize: 8, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif', color: '#999',
                                        display: 'block',
                                        marginBottom: 1,
                                    }}>
                                        Balance · {dateLabel}
                                    </span>
                                    <span style={{
                                        fontSize: 7, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif', color: '#EC8C17',
                                        display: 'block',
                                    }}>
                                        {sym}{Math.round(tappedHistDot.balance).toLocaleString()}
                                    </span>
                                </div>
                            )
                        })()}

                        {/* Scrubber vertical line + dot (inside zoom div so it zooms correctly) */}
                        <div ref={scrubLineRef} style={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: 0,
                            borderLeft: '1.5px solid rgba(80,80,80,0.5)',
                            pointerEvents: 'none',
                            zIndex: 25,
                            opacity: 0,
                            transition: 'opacity 0.15s ease',
                        }} />
                        <div ref={scrubDotRef} style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            transform: 'translate(-50%, -50%)',
                            width: 12, height: 12,
                            borderRadius: '50%',
                            background: '#147b75',
                            border: '2px solid white',
                            boxShadow: '0 0 6px rgba(0,0,0,0.15)',
                            pointerEvents: 'none',
                            zIndex: 26,
                            opacity: 0,
                            transition: 'opacity 0.15s ease',
                        }} />
                    </div>

                </div>

            </div>

            {/* Spacer between graph and x-axis labels */}
            <div style={{ height: 0, margin: '0 0 14px', marginLeft: Y_AXIS_W }} />

            {/* X-axis date labels — adapt to zoom level */}
            <div style={{
                position: 'relative', height: 14, marginTop: 6, marginLeft: Y_AXIS_W,
                overflow: 'hidden',
            }}>
                {/* During zoom-out animation, render month labels in a fixed (non-zoomed) container
                    so they don't fly in from the edges as the zoomed container shrinks */}
                {isZoomingOut ? (
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%',
                    }}>
                        {MONTHS
                            .filter((_, idx) => idx % 2 === 0)
                            .map(({ label, date }, i) => {
                                const idx = i * 2
                                const pct = (idx + 0.5) / 12 * 100
                                const isNow = today.getMonth() === date.getMonth() &&
                                    today.getFullYear() === date.getFullYear()
                                return (
                                    <span key={label} style={{
                                        position: 'absolute',
                                        left: `${pct}%`,
                                        transform: 'translateX(-50%)',
                                        fontSize: 8, fontWeight: 500,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: isNow ? '#147b75' : '#8f8f8f',
                                        whiteSpace: 'nowrap',
                                    }}>{label}</span>
                                )
                            })}
                    </div>
                ) : (
                    <div ref={xAxisDivRef} style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${innerLeft}%`,
                        width: `${innerWidth}%`,
                    }}>
                        {(() => {
                            // Generate date ticks that adapt to zoom level
                            const curZoom = labelZoomRef.current
                            const viewWidthDays = (100 / curZoom) / 100 * 365

                            // Work out which portion of the container's 0-100% range is visible
                            const curPan = panRef.current
                            const curCenter = 50 - curPan
                            const halfView = 50 / curZoom
                            const visibleMin = Math.max(0, curCenter - halfView - 3)
                            const visibleMax = Math.min(100, curCenter + halfView + 3)

                            if (viewWidthDays > 90) {
                                // Month labels — evenly spaced, skip every other when >6 months visible
                                const step = viewWidthDays > 200 ? 2 : 1
                                return MONTHS
                                    .map(({ label, date }, idx) => ({ label, date, idx }))
                                    .filter(({ idx }) => idx % step === 0)
                                    .map(({ label, date, idx }) => {
                                        const pct = (idx + 0.5) / 12 * 100
                                        if (pct < visibleMin || pct > visibleMax) return null
                                        const isNow = today.getMonth() === date.getMonth() &&
                                            today.getFullYear() === date.getFullYear()
                                        return (
                                            <span key={label} style={{
                                                position: 'absolute',
                                                left: `${pct}%`,
                                                transform: 'translateX(-50%)',
                                                fontSize: 8, fontWeight: 500,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: isNow ? '#147b75' : '#8f8f8f',
                                                whiteSpace: 'nowrap',
                                            }}>{label}</span>
                                        )
                                    })
                            }

                            // Day ticks — only within visible range
                            let dayInterval
                            if (viewWidthDays > 45) dayInterval = 14
                            else if (viewWidthDays > 30) dayInterval = 7
                            else if (viewWidthDays > 14) dayInterval = 3
                            else if (viewWidthDays > 7) dayInterval = 2
                            else dayInterval = 1

                            const ticks = []
                            const d = new Date(AY_START)
                            if (dayInterval === 7 || dayInterval === 14) {
                                const dow = d.getDay()
                                d.setDate(d.getDate() + ((8 - dow) % 7))
                            }
                            while (d <= AY_END) {
                                const pct = datePctFromDate(d)
                                if (pct >= visibleMin && pct <= visibleMax) {
                                    const label = `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
                                    const isToday = d.getDate() === today.getDate() &&
                                        d.getMonth() === today.getMonth() &&
                                        d.getFullYear() === today.getFullYear()
                                    ticks.push(
                                        <span key={`d${pct.toFixed(2)}`} style={{
                                            position: 'absolute', left: `${pct}%`,
                                            transform: 'translateX(-50%)',
                                            fontSize: 8, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: isToday ? '#EC8C17' : '#8f8f8f',
                                            whiteSpace: 'nowrap',
                                        }}>{label}</span>
                                    )
                                }
                                d.setDate(d.getDate() + dayInterval)
                            }
                            return ticks
                        })()}
                    </div>
                )}
            </div>

            {/* Zoom-out button — overlaps month labels, right-aligned with graph, no layout impact */}
            <div style={{ position: 'relative', height: 0 }}>
                {isZoomed && (
                    <button
                        onClick={() => animateTo(1, 0, 300)}
                        style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 4,
                            width: 26, height: 26,
                            borderRadius: 5,
                            border: '1px solid #e8e8e8',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 5,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                    </button>
                )}
            </div>

            {footer}

            {/* Scrubber tooltip — fixed position so it's not clipped by overflow:hidden ancestors */}
            <div ref={scrubTooltipRef} style={{
                position: 'fixed',
                top: 0,
                left: 0,
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 9999,
                opacity: 0,
                transition: 'opacity 0.15s ease',
            }}>
                {scrubData && (
                    <div style={{
                        background: '#fff',
                        borderRadius: 10,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                        padding: '6px 10px',
                        minWidth: 90,
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: 8,
                            fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#999',
                            marginBottom: 2,
                        }}>
                            {scrubData.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: scrubData.balance >= 0 ? '#147b75' : '#e06470',
                        }}>
                            {scrubData.balance < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(scrubData.balance)).toLocaleString()}
                        </div>
                        {scrubData.actualBal != null && (
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#EC8C17',
                                marginTop: 1,
                            }}>
                                Actual: {scrubData.actualBal < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(scrubData.actualBal)).toLocaleString()}
                            </div>
                        )}
                        {scrubData.date && terms?.length > 0 && (() => {
                            const d = scrubData.date
                            const inTerm = terms.some(t => d >= new Date(t.start + 'T00:00:00') && d <= new Date(t.end + 'T00:00:00'))
                            const inBreak = terms.some(t => (t.breaks || []).some(b => d >= new Date(b.start + 'T00:00:00') && d <= new Date(b.end + 'T00:00:00')))
                            return !inTerm || inBreak
                        })() && (
                                <div style={{
                                    marginTop: 2, fontSize: 8, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif', color: '#999',
                                }}>Holiday</div>
                            )}
                        {scrubData.nearbyDot && (
                            <div style={{
                                marginTop: 3,
                                paddingTop: 3,
                                borderTop: '1px solid #f0f0f0',
                                fontSize: 8,
                                fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: scrubData.nearbyDot.event.type === 'income' ? '#147b75' : '#e06470',
                            }}>
                                {scrubData.nearbyDot.event.type === 'income' ? '+' : '-'}{getCurrencySymbol()}{Math.round(scrubData.nearbyDot.event.amount).toLocaleString()}
                                {scrubData.nearbyDot.event.label && (
                                    <span style={{ color: '#666', fontWeight: 500 }}> {scrubData.nearbyDot.event.label}</span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
