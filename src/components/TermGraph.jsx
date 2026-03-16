import { useState, useEffect, useRef, useCallback } from 'react'
import { getGraphStart, getMonthsFromStart, getCurrencySymbol } from '../lib/settings'

/* ---------- CONSTANTS ---------- */

function computeAY() {
    const start = getGraphStart()
    const [y, m, d] = start.split('-').map(Number)
    const ayStart = new Date(y, m - 1, d)
    // Always end Aug 31: same year if start is Sep+, next year otherwise
    const endYear = m >= 9 ? y + 1 : y
    const ayEnd = new Date(endYear, 7, 31) // Aug 31
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

// Convert percentage back to a Date
export const pctToDate = (pct) => {
    const total = AY_END.getTime() - AY_START.getTime()
    const ms = (pct / 100) * total
    return new Date(AY_START.getTime() + ms)
}

// Convert a Date object to percentage across the graph (AY_START = 0%, AY_END = 100%)
export const datePctFromDate = (dt) => {
    const ms = dt.getTime() - AY_START.getTime()
    const total = AY_END.getTime() - AY_START.getTime()
    return Math.max(0, Math.min(100, (ms / total) * 100))
}

export const datePct = (d) => {
    const dt = new Date(d + 'T12:00:00')
    return datePctFromDate(dt)
}

// End-of-day: for inclusive end dates (the block should cover the full last day)
export const datePctEnd = (d) => {
    const dt = new Date(d + 'T12:00:00')
    dt.setDate(dt.getDate() + 1)
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

// Vertical gradient for breaks (warm grey)
export const HASH_BG = `linear-gradient(to bottom, rgba(160,160,160,0) 0%, rgba(160,160,160,0.07) 35%, rgba(160,160,160,0.07) 65%, rgba(160,160,160,0) 100%)`

// Vertical gradient for exam breaks (soft rose)
export const HASH_BG_EXAM = `linear-gradient(to bottom, rgba(210,100,100,0) 0%, rgba(210,100,100,0.08) 35%, rgba(210,100,100,0.08) 65%, rgba(210,100,100,0) 100%)`

// Vertical gradient for reading weeks (soft blue)
export const HASH_BG_READING = `linear-gradient(to bottom, rgba(100,140,200,0) 0%, rgba(100,140,200,0.08) 35%, rgba(100,140,200,0.08) 65%, rgba(100,140,200,0) 100%)`

/* ---------- BALANCE HELPERS ---------- */

const Y_AXIS_W = 35

function calcYRange(bal, projMin, projMax) {
    const b = typeof bal === 'number' && !isNaN(bal) ? bal : 0
    const lo = projMin !== undefined ? Math.min(b, projMin) : b
    const hi = projMax !== undefined ? Math.max(b, projMax) : b
    // Use the range (hi - lo) as primary sizing metric for more stable scaling
    const range0 = Math.max(hi - lo, 200)
    const mag = Math.max(range0, Math.abs(hi), Math.abs(lo))

    // Use wider thresholds with overlap to reduce step jumping
    let step = 50
    if (mag > 120) step = 100
    if (mag > 400) step = 200
    if (mag > 800) step = 500
    if (mag > 2000) step = 1000
    if (mag > 4000) step = 2000
    if (mag > 10000) step = 5000
    if (mag > 20000) step = 10000
    if (mag > 40000) step = 20000
    if (mag > 100000) step = 50000

    // Add generous padding so small value changes don't shift the range
    const pad = step * 0.5
    const yMax = Math.ceil((hi + pad) / step) * step
    // Ensure 0 is always visible with some space below
    const loWithZero = Math.min(lo, 0)
    const yMin = Math.min(yMax - 2 * step, Math.floor((loWithZero - pad * 0.3) / step) * step)

    // Generate exactly 6 evenly-spaced ticks across the range
    const TARGET_TICKS = 6
    const range = yMax - yMin
    const rawStep = range / (TARGET_TICKS - 1)
    // Round step to a nice number
    const mag10 = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const niceSteps = [1, 2, 2.5, 5, 10]
    let niceStep = mag10
    for (const ns of niceSteps) {
        if (ns * mag10 >= rawStep) { niceStep = ns * mag10; break }
    }
    let ticks = []
    const tickStart = Math.ceil(yMin / niceStep) * niceStep
    for (let v = tickStart; v <= yMax + niceStep * 0.01; v += niceStep) {
        ticks.push(Math.round(v * 100) / 100)
    }
    // Ensure 0 is always included if it's in range
    if (yMin <= 0 && yMax >= 0 && !ticks.includes(0)) {
        ticks.push(0)
        ticks.sort((a, b) => a - b)
    }
    // Cap at 7 ticks — keep evenly spaced subset if too many
    if (ticks.length > 7) {
        const keep = [ticks[0]]
        const step = (ticks.length - 1) / 5
        for (let i = 1; i < 5; i++) keep.push(ticks[Math.round(i * step)])
        keep.push(ticks[ticks.length - 1])
        ticks = keep
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

export default function TermGraph({ terms, expandedTerm, balance, actualBalance, balanceStartDate, overdraft, events = [], hiddenEventTypes = [], balanceHiddenTypes = [], currentEventType, onEventClick, onBalanceClick, onOverdraftClick, onTermClick, footer, showDotsToggle, onToggleDots, showIncome, onToggleIncome, showExpenses, onToggleExpenses, graphHeight = 108, marginTop = 16, graphHeightRef, forceGreenDots = false, forceDotColor = null, hideDots = false, balanceHistory = [], showBalanceHistory = true, activeEventDot = null, onZeroDate, onOverdraftBreachDate, showHolidays = true, onZoomChange, zoomOutRef }) {
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayNoon = new Date(todayMidnight.getTime() + 12 * 60 * 60 * 1000)
    const todayPct = datePctFromDate(todayNoon)
    const showToday = today >= AY_START && today <= AY_END

    // If no balance recorded today, move the orange marker to the last known recording
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const hasTodayReading = balanceHistory.some(bh => bh.recorded_date === todayIso)
    const lastReading = !hasTodayReading && balanceHistory.length > 0
        ? balanceHistory.reduce((latest, bh) => bh.recorded_date > latest.recorded_date ? bh : latest, balanceHistory[0])
        : null
    const markerPct = lastReading ? datePct(lastReading.recorded_date) : todayPct
    const markerLabel = (() => {
        if (hasTodayReading || !lastReading) return 'TODAY'
        const rd = new Date(lastReading.recorded_date + 'T12:00:00')
        const diffDays = Math.round((todayMidnight - rd) / 86400000)
        if (diffDays === 1) return 'YESTERDAY'
        const day = rd.getDate()
        const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][rd.getMonth()]
        return `${day} ${mon}`
    })()
    const markerDate = lastReading ? lastReading.recorded_date : todayIso

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

    // Split events into past and future (exclude removed and eye-toggled hidden from balance line)
    const activeEvents = events.filter(e => !e.removed && !balanceHiddenTypes.includes(e.editType))
    // All events show on the future line — past events are clamped to today's position
    // since they're already reflected in the actual balance
    const pastEvents = []
    const futureEvents = hasBalance ? activeEvents
        .filter(e => e.amount > 0)
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

    // Compute projected balance range for y-axis
    // balNum is the balance at TODAY — reverse past events to find balance at graph start,
    // then walk forward through all events to find min/max
    let projMin = Math.min(balNum, actualBalNum), projMax = Math.max(balNum, actualBalNum)
    if (hasEvents) {
        const balStartX = balanceStartDate ? Math.max(0.5, datePct(balanceStartDate)) : todayPct
        const isOneOff = e => e.editType === 'oneOffIncome' || e.editType === 'oneOffExpense'
        const sortedEvents = [...activeEvents].filter(e => e.amount > 0).sort((a, b) => datePct(a.date) - datePct(b.date))
        const postSignupEvents = sortedEvents.filter(e => datePct(e.date) >= balStartX)
        const pastPostSignup = postSignupEvents.filter(e => datePct(e.date) < todayPct && e.editType !== 'weeklySpend')
        const weeklyEvents = postSignupEvents.filter(e => e.editType === 'weeklySpend')
        const pastWeeklySpend = weeklyEvents
            .filter(e => datePct(e.date) > balStartX && datePct(e.date) < todayPct)
            .reduce((sum, e) => sum + e.amount, 0)

        // Reverse-walk from balNum at today to find balance at balStartX
        let balAtStart = balNum
        for (let i = pastPostSignup.length - 1; i >= 0; i--) {
            const evt = pastPostSignup[i]
            balAtStart -= evt.type === 'income' ? evt.amount : -evt.amount
        }
        balAtStart += pastWeeklySpend

        // Forward walk from balAtStart through all post-signup events
        let running = balAtStart
        projMin = Math.min(projMin, running)
        projMax = Math.max(projMax, running)
        for (const evt of postSignupEvents) {
            if (evt.editType === 'weeklySpend') {
                running -= evt.amount
            } else {
                running += evt.type === 'income' ? evt.amount : -evt.amount
            }
            projMin = Math.min(projMin, running)
            projMax = Math.max(projMax, running)
        }

        // Backward walk from balAtStart through pre-signup ONE-OFF items
        let backRunning = balAtStart
        const preOneOffs = sortedEvents.filter(e => isOneOff(e) && datePct(e.date) < balStartX)
        for (let i = preOneOffs.length - 1; i >= 0; i--) {
            const evt = preOneOffs[i]
            backRunning -= evt.type === 'income' ? evt.amount : -evt.amount
            projMin = Math.min(projMin, backRunning)
            projMax = Math.max(projMax, backRunning)
        }

        // Retroactive past balance range: reverse ALL events before markerPct from balNum
        const allPastEvts = sortedEvents.filter(e => datePct(e.date) < markerPct)
        let pastBal = balNum
        for (let i = allPastEvts.length - 1; i >= 0; i--) {
            const evt = allPastEvts[i]
            if (evt.editType === 'weeklySpend') {
                pastBal += evt.amount // reverse weekly (was subtracted)
            } else {
                pastBal -= evt.type === 'income' ? evt.amount : -evt.amount
            }
            projMin = Math.min(projMin, pastBal)
            projMax = Math.max(projMax, pastBal)
        }
    }
    if (hasBalance) {
        projMin = Math.min(projMin, balNum)
        projMax = Math.max(projMax, balNum)
    }

    // Include overdraft in y-range so the line is visible
    const hasOverdraft = typeof overdraft === 'number' && overdraft > 0
    if (hasOverdraft) {
        projMin = Math.min(projMin, -overdraft)
    }

    // Include balance history in y-range (only entries on or after graph start)
    const graphStartStr = getGraphStart()
    if (balanceHistory.length > 0) {
        for (const bh of balanceHistory) {
            if (bh.recorded_date < graphStartStr) continue
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
    const fromTopPct = (pct) => yMin + (100 - pct) / 100 * (yMax - yMin)
    const balTopPctLive = hasBalance ? toTopPct(actualBalNum) : 0
    const balTopPctRef = useRef(balTopPctLive)
    if (hasBalance) balTopPctRef.current = balTopPctLive
    // During exit animation, freeze position at last known value
    const balTopPct = hasBalance ? balTopPctLive : balTopPctRef.current
    // Green line position: based on projection balance (balNum), not actual balance
    const greenTopPct = hasBalance ? toTopPct(balNum) : balTopPct

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
    const pastEventCount = hasBalance ? activeEvents.filter(e => e.amount > 0 && datePct(e.date) < markerPct).length : 0
    const prevPastCountRef = useRef(0)

    useEffect(() => {
        if (hasBalance) {
            if (pastEventCount !== prevPastCountRef.current) {
                setPastRevealed(false)
            }
            prevPastCountRef.current = pastEventCount
            const t = setTimeout(() => setPastRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setPastRevealed(false)
        prevPastCountRef.current = 0
    }, [pastEventCount, hasBalance])

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

        const discreteEvents = futureEvents.filter(e => e.editType !== 'weeklySpend')
        const allWeeklyEvents = futureEvents.filter(e => e.editType === 'weeklySpend')
        const balStartX = balanceStartDate ? Math.max(0.5, datePct(balanceStartDate)) : todayPct

        // Split events: before signup date vs on/after
        // Only manually-added one-off items can be backdated before signup;
        // auto-generated recurring events (loans, bursary, family, weekly spend, rent, bills, etc.)
        // before signup are already reflected in the user's entered balance — ignore them.
        const isOneOff = e => e.editType === 'oneOffIncome' || e.editType === 'oneOffExpense'
        const preSignup = discreteEvents.filter(e => datePct(e.date) < balStartX && isOneOff(e))
        const postSignup = discreteEvents.filter(e => datePct(e.date) >= balStartX)
        const postWeekly = allWeeklyEvents.filter(e => datePct(e.date) >= balStartX)

        const points = []
        const dots = []

        // Helper: sum weekly spend between two x positions (post-signup only)
        const weeklySpendBetween = (x1, x2) => {
            return postWeekly
                .filter(e => { const ex = datePct(e.date); return ex > x1 && ex <= x2 })
                .reduce((sum, e) => sum + e.amount, 0)
        }

        // --- Compute balance at balStartX by reverse-walking from balNum at todayPct ---
        // balNum is the user's current balance (entered today), so we reverse all events
        // between balStartX and todayPct to find what the balance was at balStartX
        const pastPostSignup = postSignup.filter(e => datePct(e.date) < todayPct)
        const pastWeeklySpend = weeklySpendBetween(balStartX, todayPct - 0.001)
        let balAtStart = balNum
        // Reverse past post-signup events (undo them to find starting balance)
        for (let i = pastPostSignup.length - 1; i >= 0; i--) {
            const evt = pastPostSignup[i]
            balAtStart -= evt.type === 'income' ? evt.amount : -evt.amount
        }
        // Reverse weekly spend (add it back since it was subtracted)
        balAtStart += pastWeeklySpend

        // --- Walk BACKWARDS from balAtStart for pre-signup ONE-OFF items only ---
        if (preSignup.length > 0) {
            const sorted = [...preSignup].sort((a, b) => datePct(a.date) - datePct(b.date))
            let backBal = balAtStart
            const backEntries = []
            for (let i = sorted.length - 1; i >= 0; i--) {
                const evt = sorted[i]
                const afterBal = backBal
                backBal -= evt.type === 'income' ? evt.amount : -evt.amount
                backEntries.unshift({ evt, balBefore: backBal, balAfter: afterBal })
            }

            let bal = backEntries[0].balBefore
            const startX = Math.max(0.5, datePct(backEntries[0].evt.date))
            points.push({ x: startX, y: toTopPct(bal) })

            for (const entry of backEntries) {
                const x = Math.max(0.5, datePct(entry.evt.date))
                points.push({ x, y: toTopPct(bal) })
                const yBefore = toTopPct(bal)
                bal = entry.balAfter
                const yAfter = toTopPct(bal)
                points.push({ x, y: yAfter })
                dots.push({ x, yBefore, yAfter, event: entry.evt, balanceAfter: bal })
            }
            points.push({ x: balStartX, y: toTopPct(balAtStart) })
        } else {
            points.push({ x: balStartX, y: toTopPct(balAtStart) })
        }

        // --- Walk FORWARDS from balAtStart at signup date for post-signup events ---
        let bal = balAtStart
        let prevX = balStartX
        // Track (x, balance) for zero/overdraft crossing detection
        const balPoints = [{ x: balStartX, bal: balAtStart }]

        let insertedMarker = false
        let insertedToday = false
        for (const evt of postSignup) {
            const x = Math.max(0.5, datePct(evt.date))
            // Insert a point at markerPct (orange dot) for a clean past/future split
            if (!insertedMarker && markerPct !== todayPct && x >= markerPct && prevX < markerPct) {
                const spent = weeklySpendBetween(prevX, markerPct)
                if (spent > 0) { bal -= spent }
                points.push({ x: markerPct, y: toTopPct(bal) })
                balPoints.push({ x: markerPct, bal })
                insertedMarker = true
                prevX = markerPct
            }
            // Insert a point at todayPct before the first future event for a clean past/future split
            if (!insertedToday && x >= todayPct && prevX < todayPct) {
                const spent = weeklySpendBetween(prevX, todayPct)
                if (spent > 0) { bal -= spent }
                points.push({ x: todayPct, y: toTopPct(bal) })
                balPoints.push({ x: todayPct, bal })
                insertedToday = true
                prevX = todayPct
            }
            // Apply weekly spend as gradient slope between events
            const spent = weeklySpendBetween(prevX, x)
            if (spent > 0) {
                bal -= spent
                points.push({ x, y: toTopPct(bal) })
                balPoints.push({ x, bal })
            }
            // Horizontal line to this event's x
            points.push({ x, y: toTopPct(bal) })
            balPoints.push({ x, bal })
            // Step for the discrete event
            const yBefore = toTopPct(bal)
            bal += evt.type === 'income' ? evt.amount : -evt.amount
            const yAfter = toTopPct(bal)
            points.push({ x, y: yAfter })
            balPoints.push({ x, bal })
            dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: bal })
            prevX = x
        }

        // Ensure line reaches marker
        if (!insertedMarker && markerPct !== todayPct && prevX < markerPct) {
            const spent = weeklySpendBetween(prevX, markerPct)
            if (spent > 0) { bal -= spent }
            points.push({ x: markerPct, y: toTopPct(bal) })
            balPoints.push({ x: markerPct, bal })
            prevX = markerPct
        }

        // Ensure line reaches today
        if (prevX < todayPct) {
            const spent = weeklySpendBetween(prevX, todayPct)
            if (spent > 0) { bal -= spent }
            points.push({ x: todayPct, y: toTopPct(bal) })
            balPoints.push({ x: todayPct, bal })
            prevX = todayPct
        }

        // Apply remaining weekly spend as gradient to end
        const remainingSpend = weeklySpendBetween(prevX, 100)
        bal -= remainingSpend
        points.push({ x: 100, y: toTopPct(bal) })
        balPoints.push({ x: 100, bal })

        // Extend line left to markerPct if it starts after the orange dot
        if (points.length > 0 && points[0].x > markerPct) {
            points.unshift({ x: markerPct, y: points[0].y })
            balPoints.unshift({ x: markerPct, bal: balPoints[0]?.bal ?? balAtStart })
        }

        const startX = points[0].x

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const fillPath = linePath + ` L 100 100 L ${startX} 100 Z`

        // Split into past and future line paths at markerPct (orange dot) for different colors
        const splitX = markerPct
        const splitIdx = points.findIndex(p => p.x >= splitX)
        let pastLinePath = null
        let pastFillPath = null
        let futureLinePath = null
        let futureFillPath = null

        if (startX < splitX && splitIdx > 0) {
            const pastPts = points.slice(0, splitIdx + 1)
            pastLinePath = pastPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
            pastFillPath = pastLinePath + ` L ${pastPts[pastPts.length - 1].x} 100 L ${startX} 100 Z`

            const futurePts = points.slice(splitIdx)
            futureLinePath = futurePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
            futureFillPath = futureLinePath + ` L 100 100 L ${futurePts[0].x} 100 Z`
        } else {
            futureLinePath = linePath
            futureFillPath = fillPath
        }

        // Detect zero and overdraft crossings from balPoints
        let zeroCrossX = null
        let odCrossX = null
        const od = overdraft || 0
        for (let i = 1; i < balPoints.length; i++) {
            const prev = balPoints[i - 1]
            const cur = balPoints[i]
            if (zeroCrossX === null && cur.bal <= 0 && prev.bal > 0) {
                // Interpolate x position of zero crossing
                if (cur.x !== prev.x && cur.bal !== prev.bal) {
                    const ratio = prev.bal / (prev.bal - cur.bal)
                    zeroCrossX = prev.x + ratio * (cur.x - prev.x)
                } else {
                    zeroCrossX = cur.x
                }
            } else if (zeroCrossX === null && cur.bal <= 0) {
                zeroCrossX = cur.x
            }
            if (od > 0 && odCrossX === null && cur.bal < -od && prev.bal >= -od) {
                if (cur.x !== prev.x && cur.bal !== prev.bal) {
                    const target = -od
                    const ratio = (prev.bal - target) / (prev.bal - cur.bal)
                    odCrossX = prev.x + ratio * (cur.x - prev.x)
                } else {
                    odCrossX = cur.x
                }
            } else if (od > 0 && odCrossX === null && cur.bal < -od) {
                odCrossX = cur.x
            }
        }

        const toLocalDate = (d) => {
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
        }
        const zeroDateStr = zeroCrossX !== null ? toLocalDate(pctToDate(zeroCrossX)) : null
        const odDateStr = odCrossX !== null ? toLocalDate(pctToDate(odCrossX)) : null

        return { linePath, fillPath, dots, points, balPoints, pastLinePath, pastFillPath, futureLinePath, futureFillPath, zeroDate: zeroDateStr, overdraftBreachDate: odDateStr }
    })()

    // Fire zero/overdraft date callbacks
    const prevZeroDateRef = useRef(null)
    const prevOdDateRef = useRef(null)
    useEffect(() => {
        const zd = steppedPath?.zeroDate ?? null
        const od = steppedPath?.overdraftBreachDate ?? null
        if (zd !== prevZeroDateRef.current) {
            prevZeroDateRef.current = zd
            onZeroDate?.(zd)
        }
        if (od !== prevOdDateRef.current) {
            prevOdDateRef.current = od
            onOverdraftBreachDate?.(od)
        }
    }, [steppedPath?.zeroDate, steppedPath?.overdraftBreachDate])

    // Build past events path — retroactive balance from orange dot backwards
    const pastPathRef = useRef(null)
    const pastPath = (() => {
        if (!hasBalance) return pastPathRef.current // keep last path during exit animation

        // Get all non-weekly-spend events before markerPct
        const pastDiscrete = activeEvents
            .filter(e => e.amount > 0 && e.editType !== 'weeklySpend' && datePct(e.date) < markerPct)
            .sort((a, b) => datePct(a.date) - datePct(b.date))
        // Get weekly spend events before markerPct
        const pastWeekly = activeEvents
            .filter(e => e.amount > 0 && e.editType === 'weeklySpend' && datePct(e.date) < markerPct)
            .sort((a, b) => datePct(a.date) - datePct(b.date))

        if (pastDiscrete.length === 0 && pastWeekly.length === 0) {
            // No past events — flat line at balance
            const y = toTopPct(balNum)
            const points = [{ x: 0, y }, { x: markerPct, y }]
            const linePath = `M 0 ${y} L ${markerPct} ${y}`
            const fillPath = linePath + ` L ${markerPct} 100 L 0 100 Z`
            return { linePath, fillPath, dots: [], points }
        }

        // Weekly spend between two x positions
        const weeklyBetween = (x1, x2) => pastWeekly
            .filter(e => { const ex = datePct(e.date); return ex > x1 && ex <= x2 })
            .reduce((sum, e) => sum + e.amount, 0)

        // Reverse-walk from balNum at markerPct to find balance at each past event
        const entries = []
        let bal = balNum
        // Walk backwards to build (event, balBefore, balAfter) pairs
        for (let i = pastDiscrete.length - 1; i >= 0; i--) {
            const evt = pastDiscrete[i]
            const x = datePct(evt.date)
            const nextX = i < pastDiscrete.length - 1 ? datePct(pastDiscrete[i + 1].date) : markerPct
            // Add back weekly spend between this event and the next
            const ws = weeklyBetween(x, nextX)
            bal += ws // reverse weekly (was subtracted, add back)
            const balAfter = bal
            // Reverse the discrete event
            bal -= evt.type === 'income' ? evt.amount : -evt.amount
            entries.unshift({ evt, balBefore: bal, balAfter, x })
        }
        // Add back weekly spend before first event
        if (entries.length > 0) {
            const ws = weeklyBetween(0, entries[0].x)
            bal += ws
        }
        const balAtGraphStart = bal

        // Now walk forward from graph start to build stepped path
        const points = []
        const dots = []
        let running = balAtGraphStart
        let prevX = 0
        points.push({ x: 0, y: toTopPct(running) })

        for (const entry of entries) {
            // Apply weekly spend between prevX and this event
            const ws = weeklyBetween(prevX, entry.x)
            if (ws > 0) {
                running -= ws
                points.push({ x: entry.x, y: toTopPct(running) })
            }
            // Horizontal to event x
            points.push({ x: entry.x, y: toTopPct(running) })
            const yBefore = toTopPct(running)
            running += entry.evt.type === 'income' ? entry.evt.amount : -entry.evt.amount
            const yAfter = toTopPct(running)
            points.push({ x: entry.x, y: yAfter })
            dots.push({ x: entry.x, yBefore, yAfter, event: entry.evt, balanceAfter: running })
            prevX = entry.x
        }
        // Apply remaining weekly spend to markerPct
        const ws = weeklyBetween(prevX, markerPct)
        if (ws > 0) running -= ws
        points.push({ x: markerPct, y: toTopPct(running) })

        const startX = points[0].x
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const fillPath = linePath + ` L ${markerPct} 100 L ${startX} 100 Z`
        return { linePath, fillPath, dots, points }
    })()
    if (pastPath && hasBalance) pastPathRef.current = pastPath

    // No cross-fade on graph line — instant update

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
    const scrubRef = useRef({ active: false, startX: 0, startY: 0 })
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

        // Find all event dots near the scrub position
        const threshold = 2.5 / (z || 1)
        const nearbyDots = []
        for (const dot of allDotsRef.current) {
            const d = Math.abs(dot.x - xPct)
            if (d < threshold) nearbyDots.push(dot)
        }
        // Keep single nearbyDot for backward compat (closest one)
        const nearbyDot = nearbyDots.length > 0
            ? nearbyDots.reduce((best, d) => Math.abs(d.x - xPct) < Math.abs(best.x - xPct) ? d : best)
            : null

        // Convert xPct to date (linear between AY_START and AY_END)
        const totalMs = AY_END.getTime() - AY_START.getTime()
        const ms = (xPct / 100) * totalMs
        const date = new Date(AY_START.getTime() + ms)

        // Direct DOM update for scrub line + dot (60fps)
        const yPct = 100 - ((balance - ym) / (ymx - ym)) * 100
        const clampedY = Math.max(2, Math.min(98, yPct))
        if (scrubLineRef.current) {
            scrubLineRef.current.style.display = ''
            scrubLineRef.current.style.left = `${xPct}%`
        }
        if (scrubDotRef.current) {
            scrubDotRef.current.style.display = ''
            scrubDotRef.current.style.left = `${xPct}%`
            scrubDotRef.current.style.top = `${clampedY}%`
        }
        // Position tooltip in viewport space (fixed positioning)
        if (scrubTooltipRef.current) {
            scrubTooltipRef.current.style.display = ''
            const tooltipX = Math.max(rect.left + 45, Math.min(rect.right - 45, clientX))
            const tooltipY = rect.top + 10
            scrubTooltipRef.current.style.left = `${tooltipX}px`
            scrubTooltipRef.current.style.top = `${tooltipY}px`
            scrubTooltipRef.current.style.opacity = '1'
        }

        // Find actual balance from history for this date (only for today or past)
        let actualBal = null
        if (date <= todayMidnight) {
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
        }

        setScrubData({ xPct, balance, date, nearbyDot, nearbyDots, actualBal })
    }, [])

    /* ---------- ZOOM & PAN ---------- */

    const MAX_ZOOM = 36
    const savedZoom = (() => { try { return parseFloat(sessionStorage.getItem('budgeup_graph_zoom')) || 1 } catch { return 1 } })()
    const savedPan = (() => { try { return parseFloat(sessionStorage.getItem('budgeup_graph_pan')) || 0 } catch { return 0 } })()
    const [zoom, setZoom] = useState(savedZoom)
    const [panX, setPanX] = useState(savedPan)
    const graphContainerRef = useRef(null)
    const zoomDivRef = useRef(null)
    const graphAreaRef = useRef(null)
    const xAxisDivRef = useRef(null)
    const animRef = useRef(null)
    const [isAnimatingZoom, setIsAnimatingZoom] = useState(false)
    const [isZoomingOut, setIsZoomingOut] = useState(false)
    const isZoomed = zoom > 1.05
    useEffect(() => {
        onZoomChange?.(isZoomed)
    }, [isZoomed, onZoomChange])

    // Live refs — gesture handlers read/write these, React state syncs on gesture end
    const zoomRef = useRef(savedZoom)
    const panRef = useRef(savedPan)
    // Separate ref for label rendering — jumps to target zoom instantly so labels don't flash
    const labelZoomRef = useRef(savedZoom)

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
        const clip = z > 1.05 ? 'clip' : 'visible'
        if (zoomDivRef.current) {
            zoomDivRef.current.style.left = `${left}%`
            zoomDivRef.current.style.width = `${width}%`
            zoomDivRef.current.style.overflowX = clip
        }
        if (graphAreaRef.current) {
            graphAreaRef.current.style.overflowX = clip
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
        sessionStorage.setItem('budgeup_graph_zoom', String(zoomRef.current))
        sessionStorage.setItem('budgeup_graph_pan', String(panRef.current))
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

    // Expose zoom-out action to parent
    useEffect(() => {
        if (zoomOutRef) zoomOutRef.current = () => animateTo(1, 0, 300)
    }, [zoomOutRef, animateTo])

    const handleTouchStart = useCallback((e) => {
        const s = scrubRef.current
        // Dismiss tapped dot tooltip
        setTappedHistDot(null)
        // Ensure scrubber visuals are hidden on new touch
        if (scrubLineRef.current) scrubLineRef.current.style.display = 'none'
        if (scrubDotRef.current) scrubDotRef.current.style.display = 'none'
        if (scrubTooltipRef.current) { scrubTooltipRef.current.style.opacity = '0'; scrubTooltipRef.current.style.display = 'none' }

        if (!zoomEnabledRef.current && !hasBalance) return
        const t = touchRef.current



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

            // Record start position for scrubber activation on move
            if (hasBalance) {
                s.startX = e.touches[0].clientX
                s.startY = e.touches[0].clientY
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

        // Activate scrubber on horizontal slide when balance exists
        if (!s.active && hasBalance && e.touches.length === 1) {
            const dx = Math.abs(e.touches[0].clientX - s.startX)
            const dy = Math.abs(e.touches[0].clientY - s.startY)
            if (dx > 6 && dx > dy) {
                s.active = true
                if (navigator.vibrate) navigator.vibrate(10)
                e.preventDefault()
                updateScrubPosition(e.touches[0].clientX)
                return
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
                e.preventDefault() // prevent parent scroll while panning zoomed graph
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

        // Deactivate scrubber
        if (s.active) {
            s.active = false
            setScrubData(null)
            if (scrubLineRef.current) scrubLineRef.current.style.display = 'none'
            if (scrubDotRef.current) scrubDotRef.current.style.display = 'none'
            if (scrubTooltipRef.current) { scrubTooltipRef.current.style.opacity = '0'; scrubTooltipRef.current.style.display = 'none' }
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

    // Save zoom/pan to sessionStorage on unmount so it persists across tab switches
    useEffect(() => {
        return () => {
            sessionStorage.setItem('budgeup_graph_zoom', String(zoomRef.current))
            sessionStorage.setItem('budgeup_graph_pan', String(panRef.current))
        }
    }, [])

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
        <div data-allow-zoom style={{
            margin: `${marginTop}px 0 0`,
            background: 'transparent',
            borderRadius: 0,
            boxShadow: 'none',
            padding: '10px 14px 0px 4px',
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


            <div ref={(el) => { graphContainerRef.current = el; if (graphHeightRef) graphHeightRef.current = el }} style={{ display: 'flex', position: 'relative', height: graphHeight, overflowX: 'clip', overflowY: 'visible', willChange: 'height' }}>
                {/* Y-axis — always reserves space so graph width is consistent */}
                <div style={{ width: Y_AXIS_W, position: 'relative', flexShrink: 0 }}>
                    {balanceVisible && ticks.map((tick, i) => {
                        // Hide top y-axis label if today pill overlaps the y-axis area
                        const isTopTick = i === ticks.length - 1
                        const todayOverlapsYAxis = showToday && todayPct < 5
                        return (
                            <div key={tick} style={{
                                position: 'absolute',
                                right: 8,
                                top: `${toTopPct(tick)}%`,
                                transform: 'translateY(-50%)',
                                fontSize: 9,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#9f9c9c',
                                whiteSpace: 'nowrap',
                                fontWeight: 500,
                                opacity: (balanceAnimated && !(isTopTick && todayOverlapsYAxis)) ? 1 : 0,
                                transition: 'top 0.5s ease, opacity 0.4s ease',
                            }}>
                                {fmtMoney(tick)}
                            </div>
                        )
                    })}
                </div>

                {/* Graph area — clip X so zoomed content doesn't bleed into y-axis */}
                <div ref={graphAreaRef} onClick={() => setTappedHistDot(null)} style={{ flex: 1, position: 'relative', overflowX: isZoomed ? 'clip' : 'visible', overflowY: 'visible' }}>
                    <div ref={zoomDivRef} style={{
                        overflowX: isZoomed ? 'clip' : 'visible', overflowY: 'visible',
                        position: 'absolute',
                        top: 0, bottom: -1,
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
                                    stroke="rgba(160,160,160,0.55)"
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
                            const ep = datePctEnd(term.end)
                            const wp = ep - sp
                            const isExpanded = expandedTerm === term.id
                            const topTickPct = ticks.length > 0 ? toTopPct(ticks[ticks.length - 1]) : 0
                            return (
                                <div key={term.id}
                                    onClick={(e) => { e.stopPropagation(); onTermClick?.(term.id) }}
                                    style={{
                                        position: 'absolute',
                                        left: `${sp}%`, width: `${wp}%`,
                                        top: 0, bottom: -2,
                                        background: isExpanded
                                            ? 'linear-gradient(to bottom, rgba(20,123,117,0) 0%, rgba(20,123,117,0.06) 40%, rgba(20,123,117,0.06) 60%, rgba(20,123,117,0) 100%)'
                                            : 'linear-gradient(to bottom, rgba(20,123,117,0) 0%, rgba(20,123,117,0.035) 40%, rgba(20,123,117,0.035) 60%, rgba(20,123,117,0) 100%)',
                                        border: 'none',
                                        transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease, background 0.3s ease',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                    }}>
                                    {showHolidays && term.breaks.map((brk, j) => {
                                        const bsp = datePct(brk.start)
                                        const bep = datePctEnd(brk.end)
                                        const bl = ((bsp - sp) / wp) * 100
                                        const bw = ((bep - bsp) / wp) * 100
                                        const isExam = brk.name && /^exams?$/i.test(brk.name.trim())
                                        const isReading = brk.name && /reading/i.test(brk.name)
                                        return (
                                            <div key={j} style={{
                                                position: 'absolute',
                                                left: `${bl}%`, width: `${bw}%`,
                                                top: 0, bottom: 0,
                                                background: isExam ? HASH_BG_EXAM : isReading ? HASH_BG_READING : HASH_BG,
                                                transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease',
                                            }} />
                                        )
                                    })}
                                </div>
                            )
                        })}

                        {/* (Past line now rendered via pastPath SVG below) */}

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
                                            key={`past-${dot.event.editType}-${dot.event.date}-${dot.event.amount}`}
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
                                                    ? 'transform 0.15s ease, top 0.4s ease, left 0.4s ease'
                                                    : pastRevealed
                                                        ? 'transform 0.15s ease, opacity 0.2s ease, background 0.2s ease, top 0.4s ease, left 0.4s ease'
                                                        : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                            }}
                                        >
                                            <div style={{
                                                width: isActive ? 14 : (isDimmed ? 8 : 10), height: isActive ? 14 : (isDimmed ? 8 : 10),
                                                borderRadius: '50%',
                                                background: dot.event.flex ? 'transparent' : bg,
                                                border: dot.event.flex
                                                    ? `2px solid ${bg}`
                                                    : isActive ? '2px solid white' : (isCurrent ? '1px solid white' : '0.75px solid white'),
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

                        {/* Balance-mode: flat projection (no events) — dark green */}
                        {balanceVisible && showToday && !steppedPath && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: `${markerPct}%`, right: 0,
                                    top: `${greenTopPct}%`, bottom: 0,
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
                                    left: `${markerPct}%`, right: 0,
                                    top: `${greenTopPct}%`,
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
                            const isPast = dot.x < markerPct
                            const forcedColor2 = forceDotColor === 'green' ? '#147b75' : forceDotColor === 'red' ? '#e06470' : (forceGreenDots ? '#147b75' : null)
                            const color = forcedColor2
                                ? forcedColor2
                                : isPast
                                    ? (isIncome ? '#a8d5d3' : '#f2c4c8')
                                    : isCurrent
                                        ? (isIncome ? '#147b75' : '#e06470')
                                        : (isIncome ? '#a8d5d3' : '#f2c4c8')
                            const delay = 0.25 + i * 0.12
                            const isActive = activeEventDot && activeEventDot.date === dot.event.date && activeEventDot.editType === dot.event.editType
                            return (
                                <div
                                    key={`${dot.event.editType}-${dot.event.date}-${dot.event.amount}`}
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
                                            ? 'transform 0.15s ease, top 0.4s ease, left 0.4s ease'
                                            : eventsRevealed
                                                ? 'transform 0.15s ease, opacity 0.2s ease, top 0.4s ease, left 0.4s ease'
                                                : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                    }}
                                >
                                    <div style={{
                                        width: isActive ? 14 : (isCurrent ? 10 : 8), height: isActive ? 14 : (isCurrent ? 10 : 8),
                                        borderRadius: '50%',
                                        background: dot.event.flex ? 'transparent' : color,
                                        border: dot.event.flex
                                            ? `2px solid ${color}`
                                            : isActive ? '2px solid white' : (isCurrent ? '1px solid white' : '0.75px solid white'),
                                        boxShadow: isActive
                                            ? `0 0 8px ${isIncome ? 'rgba(20,123,117,0.7)' : 'rgba(224,100,112,0.7)'}`
                                            : dot.event.hasOverride && currentEventType && dot.event.editType === currentEventType
                                                ? `0 0 0 1px #fff, 0 0 0 2.5px #EC8C17`
                                                : 'none',
                                        transition: 'width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease, border 0.15s ease',
                                    }} />
                                </div>
                            )
                        })}

                        {/* Removed event dots — only show on the related card */}
                        {balanceVisible && showToday && currentEventType && (() => {
                            // Interpolate balance on the line using actual balance values
                            const bp = steppedPath?.balPoints || []
                            const getLineBal = (xPct) => {
                                if (!bp.length) return balNum
                                if (xPct <= bp[0].x) return bp[0].bal
                                for (let j = 1; j < bp.length; j++) {
                                    if (xPct <= bp[j].x) {
                                        // Stepped line: use previous segment's balance
                                        return bp[j - 1].bal
                                    }
                                }
                                return bp[bp.length - 1].bal
                            }

                            return [...removedFutureEvents, ...removedPastEvents]
                                .filter(evt => evt.editType === currentEventType)
                                .map((evt, i) => {
                                    const x = datePct(evt.date)
                                    const lineBal = getLineBal(x)
                                    const yPct = toTopPct(lineBal)
                                    const isIncome = evt.type === 'income'
                                    const dotColor = '#c4c4c4'
                                    const isActive = activeEventDot && activeEventDot.date === evt.date && activeEventDot.editType === evt.editType
                                    const size = isActive ? 16 : 13
                                    const r = isActive ? 6 : 4.5
                                    return (
                                        <div
                                            key={`removed-${i}`}
                                            onClick={(e) => { e.stopPropagation(); onEventClick?.({ ...evt, balanceAfter: null }, e) }}
                                            style={{
                                                position: 'absolute',
                                                left: `clamp(5px, ${x}%, calc(100% - 5px))`,
                                                top: `${yPct}%`,
                                                transform: 'translate(-50%, -50%)',
                                                padding: 10,
                                                cursor: 'pointer',
                                                pointerEvents: 'auto',
                                                zIndex: isActive ? 20 : 6,
                                            }}
                                        >
                                            <div style={{
                                                width: size, height: size,
                                                borderRadius: '50%',
                                                background: 'white',
                                                border: `${isActive ? 2.2 : 1.8}px dashed ${dotColor}`,
                                                boxShadow: isActive ? `0 0 6px ${dotColor}80` : 'none',
                                                transition: 'width 0.15s ease, height 0.15s ease, border-width 0.15s ease, box-shadow 0.15s ease',
                                            }} />
                                        </div>
                                    )
                                })
                        })()}

                        {/* Colored vertical step lines at events — fade in with dots */}
                        {balanceVisible && !hideDots && showToday && steppedPath && steppedPath.dots
                            .filter(dot => !dot.event.noDot && !hiddenEventTypes.includes(dot.event.editType))
                            .map((dot, i) => {
                                const isPast = dot.x < todayPct
                                const color = isPast ? 'rgba(20,123,117,0.45)' : '#147b75'
                                const topY = Math.min(dot.yBefore, dot.yAfter)
                                const height = Math.abs(dot.yAfter - dot.yBefore)
                                const delay = 0.25 + i * 0.12
                                return (
                                    <div
                                        key={`step-${dot.event.editType}-${dot.event.date}-${dot.event.amount}`}
                                        style={{
                                            position: 'absolute',
                                            left: `clamp(0px, ${dot.x}%, 100%)`,
                                            top: `calc(${topY}% + 3px)`,
                                            height: `calc(${height}% - 6px)`,
                                            width: 0,
                                            borderLeft: `1.5px dashed ${color}`,
                                            transform: undefined,
                                            pointerEvents: 'none',
                                            zIndex: 3,
                                            opacity: (eventsRevealed || isZoomed) ? 0.6 : 0,
                                            transition: `opacity 0.3s ease ${delay}s, top 0.4s ease, height 0.4s ease, left 0.4s ease`,
                                        }}
                                    />
                                )
                            })}

                        {/* Marker vertical dashed line — centered under pill, stops at x-axis */}
                        {showToday && (
                            <div style={{
                                position: 'absolute',
                                left: `${markerPct}%`,
                                top: 0, bottom: 2,
                                width: 0,
                                borderLeft: '1px dashed rgba(236,140,23,0.4)',
                                transform: `translateX(-0.5px)`,
                            }} />
                        )}

                        {/* Marker pill — TODAY / YESTERDAY / date */}
                        {showToday && (
                            <div style={{
                                position: 'absolute', left: `${markerPct}%`, top: -5,
                                transform: `translateX(-50%)`,
                                background: '#EC8C17', color: '#fff',
                                fontSize: 7, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                padding: '2.5px 6px', borderRadius: 6,
                                whiteSpace: 'nowrap', letterSpacing: 0.5, zIndex: 2,
                            }}>{markerLabel}</div>
                        )}

                        {/* Balance-mode: orange dot at balance position */}
                        {balanceVisible && showToday && (() => {
                            const isOneOff = currentEventType === 'oneOffIncome' || currentEventType === 'oneOffExpense'
                            const hasCurrentAtToday = isOneOff && currentEventType && pastEvents.some(e => e.editType === currentEventType && Math.abs(datePct(e.date) - markerPct) < 0.5)
                            const isTodayTapped = tappedHistDot?.date === '__today__'
                            return (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if (isTodayTapped) {
                                            setTappedHistDot(null)
                                        } else {
                                            setTappedHistDot({ date: '__today__', balance: actualBalNum, x: markerPct, y: balTopPct })
                                        }
                                        onBalanceClick?.(e)
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: `${markerPct}%`,
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
                            const ep = datePctEnd(term.end)
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
                                        position: 'absolute', left: `${mid}%`, bottom: -2,
                                        transform: 'translateX(-50%)',
                                        background: '#e3f2f1', color: '#4a928e',
                                        fontSize: 8, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        padding: '2px 14px', borderRadius: 20,
                                        whiteSpace: 'nowrap',
                                        cursor: isZoomed ? 'default' : 'pointer',
                                        border: expandedTerm === term.id ? '1px solid #7EB6B3' : '0',
                                        zIndex: 3,
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
                        {/* Past balance: flat line (no past events) — uses divs with top transition */}
                        {balanceVisible && pastPath && pastPath.dots.length === 0 && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: 0, right: `${100 - markerPct}%`,
                                    top: `${greenTopPct}%`, bottom: 0,
                                    background: 'linear-gradient(to bottom, rgba(20,123,117,0.05), rgba(20,123,117,0))',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                    transformOrigin: 'right',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    opacity: balanceAnimated ? 1 : 0,
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, opacity 0.3s ease 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1), opacity 0.3s ease',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    left: 0, right: `${100 - markerPct}%`,
                                    top: `${greenTopPct}%`,
                                    height: 0,
                                    borderTop: '1.5px solid rgba(20,123,117,0.25)',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                    transformOrigin: 'right',
                                    transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                    transition: balanceAnimated
                                        ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s, top 0.5s ease'
                                        : 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                                }} />
                            </>
                        )}
                        {/* Past balance: stepped line (has past events) — uses SVG */}
                        {balanceVisible && pastPath && pastPath.dots.length > 0 && (
                            <div style={{
                                position: 'absolute', inset: 0,
                                pointerEvents: 'none',
                                zIndex: 1,
                                transformOrigin: `${markerPct}% center`,
                                transform: balanceAnimated ? 'scaleX(1)' : 'scaleX(0)',
                                transition: balanceAnimated
                                    ? 'transform 0.6s cubic-bezier(.22,1,.36,1) 0.15s'
                                    : 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                            }}>
                                <svg
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                    style={{
                                        position: 'absolute', inset: 0,
                                        width: '100%', height: '100%',
                                        overflow: 'visible',
                                    }}
                                >
                                    <defs>
                                        <linearGradient id="pastRetroGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgba(20,123,117,0.05)" />
                                            <stop offset="100%" stopColor="rgba(20,123,117,0)" />
                                        </linearGradient>
                                    </defs>
                                    <path
                                        d={pastPath.fillPath}
                                        fill="url(#pastRetroGrad)"
                                    />
                                    <path
                                        d={pastPath.linePath}
                                        fill="none"
                                        stroke="rgba(20,123,117,0.25)"
                                        strokeWidth="1.5"
                                        strokeLinejoin="bevel"
                                        vectorEffect="non-scaling-stroke"
                                        shapeRendering="crispEdges"
                                    />
                                </svg>
                            </div>
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
                                {/* Past portion of stepped line (lighter green) */}
                                {steppedPath.pastLinePath && (
                                    <>
                                        <path
                                            d={steppedPath.pastFillPath}
                                            fill="url(#stepGrad)"
                                            shapeRendering="crispEdges"
                                            opacity={(eventsRevealed || isZoomed) ? 0.4 : 0}
                                            style={{ transition: 'opacity 0.5s ease 0.4s' }}
                                        />
                                        <path
                                            d={steppedPath.pastLinePath}
                                            fill="none"
                                            stroke="rgba(20,123,117,0.35)"
                                            strokeWidth="1.5"
                                            strokeLinejoin="bevel"
                                            vectorEffect="non-scaling-stroke"
                                            shapeRendering="crispEdges"
                                            opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                            style={{ transition: 'opacity 0.5s ease' }}
                                        />
                                    </>
                                )}
                                {/* Future portion of stepped line (full green) */}
                                <path
                                    d={steppedPath.futureFillPath || steppedPath.fillPath}
                                    fill="url(#stepGrad)"
                                    shapeRendering="crispEdges"
                                    opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease 0.4s' }}
                                />
                                <path
                                    d={steppedPath.futureLinePath || steppedPath.linePath}
                                    fill="none"
                                    stroke="#147b75"
                                    strokeWidth="1.5"
                                    strokeLinejoin="bevel"
                                    vectorEffect="non-scaling-stroke"
                                    shapeRendering="crispEdges"
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
                            const todayIso = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
                            const gStart = getGraphStart()
                            const allHistPoints = sorted
                                .filter(bh => bh.recorded_date !== todayIso && bh.recorded_date >= gStart)
                                .map(bh => ({
                                    x: datePct(bh.recorded_date),
                                    y: toTopPct(Number(bh.balance)),
                                    balance: Number(bh.balance),
                                    date: bh.recorded_date,
                                })).filter(p => p.x > 0.5 && p.x < 99.5)
                            if (allHistPoints.length === 0) return null
                            // Always use all points for the line, plus marker position to connect
                            const linePoints = [...allHistPoints, { x: markerPct, y: balTopPctLive }]
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
                                    {allHistPoints.length >= 1 && (
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
                                        transform: showBelow ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 12px))',
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

                        {/* Scrubber vertical line + dot */}
                        <div ref={scrubLineRef} style={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: 0,
                            borderLeft: '1.5px solid rgba(80,80,80,0.5)',
                            pointerEvents: 'none',
                            zIndex: 25,
                            display: 'none',
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
                            display: 'none',
                        }} />
                    </div>


                </div>


            </div>

            {/* Spacer between graph and x-axis labels */}
            <div style={{ height: 0, margin: '0 0 14px', marginLeft: Y_AXIS_W }} />

            {/* X-axis date labels — adapt to zoom level */}
            <div style={{
                position: 'relative', height: 14, marginTop: 6, marginBottom: 18, marginLeft: Y_AXIS_W,
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
                                const midDate = new Date(date.getFullYear(), date.getMonth(), 15)
                                const pct = datePctFromDate(midDate)
                                return (
                                    <span key={label} style={{
                                        position: 'absolute',
                                        left: `${Math.max(0, pct)}%`,
                                        transform: pct < 3 ? 'none' : 'translateX(-50%)',
                                        fontSize: 9, fontWeight: 500,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#8f8f8f',
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
                        willChange: zoom > 1 ? 'left, width' : undefined,
                    }}>
                        {(() => {
                            // Generate date ticks that adapt to zoom level
                            const curZoom = labelZoomRef.current
                            const totalDays = Math.round((AY_END - AY_START) / 86400000)
                            const viewWidthDays = (100 / curZoom) / 100 * totalDays

                            if (viewWidthDays > 90) {
                                // Month labels — evenly spaced, skip every other when >6 months visible
                                const step = viewWidthDays > 200 ? 2 : 1
                                return MONTHS
                                    .map(({ label, date }, idx) => ({ label, date, idx }))
                                    .filter(({ idx }) => idx % step === 0)
                                    .map(({ label, date, idx }) => {
                                        const midDate = new Date(date.getFullYear(), date.getMonth(), 15)
                                        const pct = datePctFromDate(midDate)
                                        return (
                                            <span key={label} style={{
                                                position: 'absolute',
                                                left: `${Math.max(0, pct)}%`,
                                                transform: pct < 3 ? 'none' : 'translateX(-50%)',
                                                fontSize: 9, fontWeight: 500,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: '#8f8f8f',
                                                whiteSpace: 'nowrap',
                                            }}>{label}</span>
                                        )
                                    })
                            }

                            // Day ticks — pre-render all for instant panning
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
                                const label = `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
                                ticks.push(
                                    <span key={`d${pct.toFixed(2)}`} style={{
                                        position: 'absolute', left: `${pct}%`,
                                        transform: 'translateX(-50%)',
                                        fontSize: 9, fontWeight: 500,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#8f8f8f',
                                        whiteSpace: 'nowrap',
                                    }}>{label}</span>
                                )
                                d.setDate(d.getDate() + dayInterval)
                            }
                            return ticks
                        })()}
                    </div>
                )}
            </div>

            {/* Zoom-out button removed — now inside graph card */}
            <div style={{ position: 'relative', height: 0 }} />

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
                        <div style={{
                            maxHeight: scrubData.actualBal != null ? 20 : 0,
                            opacity: scrubData.actualBal != null ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.15s ease, opacity 0.15s ease',
                        }}>
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#EC8C17',
                                marginTop: 1,
                            }}>
                                {scrubData.actualBal != null && <>Actual: {scrubData.actualBal < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(scrubData.actualBal)).toLocaleString()}</>}
                            </div>
                        </div>
                        {(() => {
                            const d = scrubData.date
                            let periodLabel = null
                            if (d && terms?.length > 0) {
                                for (const t of terms) {
                                    for (const b of (t.breaks || [])) {
                                        if (d >= new Date(b.start + 'T00:00:00') && d <= new Date(b.end + 'T23:59:59')) {
                                            periodLabel = b.name || 'Reading Week'
                                        }
                                    }
                                }
                                if (!periodLabel) {
                                    const inTerm = terms.some(t => d >= new Date(t.start + 'T00:00:00') && d <= new Date(t.end + 'T23:59:59'))
                                    periodLabel = inTerm ? 'Lectures' : 'Holiday'
                                }
                            }
                            return (
                                <div style={{
                                    maxHeight: periodLabel ? 16 : 0,
                                    opacity: periodLabel ? 1 : 0,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.15s ease, opacity 0.15s ease',
                                }}>
                                    <div style={{ marginTop: 2, fontSize: 8, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                        {periodLabel}
                                    </div>
                                </div>
                            )
                        })()}
                        <div style={{
                            maxHeight: scrubData.nearbyDots?.length ? scrubData.nearbyDots.length * 22 + 6 : 0,
                            opacity: scrubData.nearbyDots?.length ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.15s ease, opacity 0.15s ease',
                        }}>
                            {(scrubData.nearbyDots || []).map((dot, i) => (
                                <div key={i} style={{
                                    marginTop: i === 0 ? 3 : 1,
                                    paddingTop: i === 0 ? 3 : 0,
                                    borderTop: i === 0 ? '1px solid #f0f0f0' : 'none',
                                    fontSize: 8,
                                    fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: dot.event.type === 'income' ? '#147b75' : '#e06470',
                                }}>
                                    {dot.event.type === 'income' ? '+' : '-'}{getCurrencySymbol()}{Math.round(dot.event.amount).toLocaleString()}
                                    {dot.event.label && (
                                        <span style={{ color: '#666', fontWeight: 500 }}> {dot.event.label}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
