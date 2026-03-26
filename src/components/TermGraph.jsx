import { useState, useEffect, useRef, useCallback } from 'react'
import { getGraphStart, getMonthsFromStart, getCurrencySymbol } from '../lib/settings'

/* ---------- CONSTANTS ---------- */

function computeAY() {
    const start = getGraphStart()
    const [y, m, d] = start.split('-').map(Number)
    const ayStart = new Date(y, m - 1, d)
    // Add a few days padding before join date
    ayStart.setDate(ayStart.getDate() - 2)
    // Always end Sep 1: same year if start is Sep+, next year otherwise
    const endYear = m >= 9 ? y + 1 : y
    const ayEnd = new Date(endYear, 8, 1) // Sep 1
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

// Start-of-day: for term/block start dates so they begin at the very start of the day
export const datePctStart = (d) => {
    const dt = new Date(d + 'T00:00:00')
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

// Vertical gradient for breaks (soft warm sand)
export const HASH_BG = `linear-gradient(to bottom, rgba(180,170,150,0) 0%, rgba(180,170,150,0.08) 35%, rgba(180,170,150,0.08) 65%, rgba(180,170,150,0) 100%)`

// Vertical gradient for exam breaks (red)
export const HASH_BG_EXAM = `linear-gradient(to bottom, rgba(224,100,112,0) 0%, rgba(224,100,112,0.10) 35%, rgba(224,100,112,0.10) 65%, rgba(224,100,112,0) 100%)`

// Vertical gradient for exam prep/revision (lighter red)
export const HASH_BG_EXAM_PREP = `linear-gradient(to bottom, rgba(224,100,112,0) 0%, rgba(224,100,112,0.05) 35%, rgba(224,100,112,0.05) 65%, rgba(224,100,112,0) 100%)`

// Vertical gradient for reading weeks (soft teal-mint)
export const HASH_BG_READING = `linear-gradient(to bottom, rgba(90,180,160,0) 0%, rgba(90,180,160,0.09) 35%, rgba(90,180,160,0.09) 65%, rgba(90,180,160,0) 100%)`

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

    // Add generous padding so values always have space above and below
    const pad = step * 1.0
    const yMax = Math.ceil((hi + pad) / step) * step
    // Ensure 0 is always visible with some space below
    const loWithZero = Math.min(lo, 0)
    const yMin = Math.min(yMax - 2 * step, Math.floor((loWithZero - pad * 0.5) / step) * step)

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

export default function TermGraph({ terms, expandedTerm, balance, balanceAnchorDate, actualBalance, balanceStartDate, overdraft, events = [], allEvents: allEventsProp = [], weeklySpendRate = 0, hiddenEventTypes = [], removedHiddenTypes = [], balanceHiddenTypes = [], currentEventLabel = null, currentEventType, onEventClick, onBalanceClick, onOverdraftClick, onTermClick, footer, showDotsToggle, onToggleDots, showIncome, onToggleIncome, showExpenses, onToggleExpenses, graphHeight = 108, marginTop = 16, graphHeightRef, forceGreenDots = false, forceDotColor = null, hideDots = false, balanceHistory = [], showBalanceHistory = true, activeEventDot = null, onZeroDate, onOverdraftBreachDate, showHolidays = true, showDateMarker = true, showXAxis = false, showTodayMarker = false, termLabelsBottom = false, onZoomChange, zoomOutRef, scrubNearLineOnly = false, collapsed = false }) {
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
    const isFirstBalance = useRef(true)
    const [balanceAnimated, setBalanceAnimated] = useState(false)
    const [dotAnimated, setDotAnimated] = useState(false)
    const [dotExiting, setDotExiting] = useState(false)
    const [balanceVisible, setBalanceVisible] = useState(false)
    const prevHasBalance = useRef(false)
    const balanceExitTimer = useRef(null)
    useEffect(() => {
        if (hasBalance && !prevHasBalance.current) {
            if (balanceExitTimer.current) { clearTimeout(balanceExitTimer.current); balanceExitTimer.current = null }
            if (isFirstBalance.current) {
                // First time balance appears — show elements then animate
                isFirstBalance.current = false
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setBalanceVisible(true)
                        requestAnimationFrame(() => {
                            setDotAnimated(true)
                            setBalanceAnimated(true)
                        })
                    })
                })
            } else {
                // Subsequent appearances — animate in
                setBalanceVisible(true)
                requestAnimationFrame(() => {
                    setDotAnimated(true)
                    setBalanceAnimated(true)
                })
            }
        } else if (!hasBalance && prevHasBalance.current) {
            // Exiting: dot shrinks to nothing, then hide
            setBalanceAnimated(false)
            setDotExiting(true)
            balanceExitTimer.current = setTimeout(() => {
                setDotAnimated(false)
                balanceExitTimer.current = setTimeout(() => {
                    setBalanceVisible(false)
                    setDotExiting(false)
                    balanceExitTimer.current = null
                }, 400)
            }, 100)
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
    const activeEvents = events.filter(e => !e.removed && !balanceHiddenTypes.includes(e.editType) && !balanceHiddenTypes.some(h => e.editType?.startsWith(h + ':') || h.startsWith(e.editType + ':')))
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

        // Retroactive past balance range: reverse ALL events before today from balNum
        const allPastEvts = sortedEvents.filter(e => datePct(e.date) <= todayPct)
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
    const toTopPct = (val) => Math.max(1, Math.min(99, 100 - ((val - yMin) / (yMax - yMin)) * 100))
    const fromTopPct = (pct) => yMin + (100 - pct) / 100 * (yMax - yMin)
    const balTopPctLive = hasBalance ? toTopPct(actualBalNum) : 0
    const balTopPctRef = useRef(balTopPctLive)
    if (hasBalance) balTopPctRef.current = balTopPctLive
    // During exit animation, freeze position at last known value
    const balTopPct = hasBalance ? balTopPctLive : balTopPctRef.current
    // Green line position: based on projection balance (balNum), not actual balance
    const greenTopPct = hasBalance ? toTopPct(balNum) : balTopPct

    // Animate stepped line when events actually change (new events added/removed, not just filtered)
    const [eventsRevealed, setEventsRevealed] = useState(false)
    const prevEventKeyRef = useRef('')
    const totalEventCount = events.filter(e => !e.removed && e.amount > 0).length
    const eventKey = `${totalEventCount}`

    useEffect(() => {
        if (futureEvents.length > 0) {
            if (eventKey !== prevEventKeyRef.current) {
                // Only re-animate if the total event pool changed (not just filtering)
                if (prevEventKeyRef.current !== '') {
                    setEventsRevealed(false)
                }
                prevEventKeyRef.current = eventKey
            }
            const t = setTimeout(() => setEventsRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setEventsRevealed(false)
        prevEventKeyRef.current = eventKey
    }, [futureEvents.length, eventKey])

    // Animate past stepped line when past events actually change
    const [pastRevealed, setPastRevealed] = useState(false)
    const pastEventCount = hasBalance ? activeEvents.filter(e => e.amount > 0 && datePct(e.date) < markerPct).length : 0
    const prevPastKeyRef = useRef('')

    useEffect(() => {
        if (hasBalance) {
            if (`${totalEventCount}` !== prevPastKeyRef.current) {
                if (prevPastKeyRef.current !== '') {
                    setPastRevealed(false)
                }
                prevPastKeyRef.current = `${totalEventCount}`
            }
            const t = setTimeout(() => setPastRevealed(true), 30)
            return () => clearTimeout(t)
        }
        setPastRevealed(false)
        prevPastKeyRef.current = `${totalEventCount}`
    }, [pastEventCount, hasBalance, totalEventCount])

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

        // Helper: compute proportional daily spend between two x positions
        const totalMs = AY_END.getTime() - AY_START.getTime()
        const dailySpendRate = weeklySpendRate / 7
        const weeklySpendBetween = (x1, x2) => {
            if (dailySpendRate <= 0) return 0
            const ms1 = (x1 / 100) * totalMs
            const ms2 = (x2 / 100) * totalMs
            const days = (ms2 - ms1) / (24 * 60 * 60 * 1000)
            return dailySpendRate * Math.max(0, days)
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
            points.push({ x: 0, y: toTopPct(bal) })
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
        // Extend line to left edge of screen if no pre-signup events already did
        if (points.length === 0 || points[0].x > -10) {
            points.unshift({ x: 0, y: toTopPct(balAtStart) })
        }
        if (points.length > 0 && points[points.length - 1].x < balStartX) {
            points.push({ x: balStartX, y: toTopPct(balAtStart) })
        }
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

            // Ensure future line starts exactly at the orange dot position
            const futurePts = points.slice(splitIdx)
            if (futurePts.length > 0 && Math.abs(futurePts[0].x - splitX) > 0.01) {
                // Interpolate y at splitX between the point before and after
                const prevPt = points[splitIdx - 1]
                const nextPt = points[splitIdx]
                const t = (splitX - prevPt.x) / (nextPt.x - prevPt.x || 1)
                const interpolatedY = prevPt.y + t * (nextPt.y - prevPt.y)
                futurePts.unshift({ x: splitX, y: interpolatedY })
            }
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
            // Only consider future crossings (at or after today)
            if (cur.x < todayPct) continue
            if (zeroCrossX === null && cur.bal <= 100 && prev.bal > 100) {
                // Interpolate x position where balance hits 100
                if (cur.x !== prev.x && cur.bal !== prev.bal) {
                    const ratio = (prev.bal - 100) / (prev.bal - cur.bal)
                    zeroCrossX = prev.x + ratio * (cur.x - prev.x)
                } else {
                    zeroCrossX = cur.x
                }
            } else if (zeroCrossX === null && cur.bal <= 100) {
                zeroCrossX = cur.x
            }
            if (od > 0 && odCrossX === null && cur.bal < -od + 100 && prev.bal >= -od + 100) {
                if (cur.x !== prev.x && cur.bal !== prev.bal) {
                    const target = -od + 100
                    const ratio = (prev.bal - target) / (prev.bal - cur.bal)
                    odCrossX = prev.x + ratio * (cur.x - prev.x)
                } else {
                    odCrossX = cur.x
                }
            } else if (od > 0 && odCrossX === null && cur.bal < -od + 100) {
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

        // Discrete (non-weekly) events before marker (for drawing the line)
        // Exclude events on anchor date (already baked into starting balance)
        const pastDiscrete = activeEvents
            .filter(e => e.amount > 0 && e.editType !== 'weeklySpend' && datePct(e.date) < markerPct)
            .sort((a, b) => datePct(a.date) - datePct(b.date))
        // All discrete events up to today (for reverse-walk — balNum is anchored at today)
        const allPastDiscrete = activeEvents
            .filter(e => e.amount > 0 && e.editType !== 'weeklySpend' && datePct(e.date) <= todayPct)
            .sort((a, b) => datePct(a.date) - datePct(b.date))
        // Daily spend rate from weekly amount
        const dailyRate = weeklySpendRate / 7

        if (allPastDiscrete.length === 0 && dailyRate <= 0) {
            const y = toTopPct(balNum)
            const endPct = Math.max(markerPct, todayPct)
            const points = [{ x: 0, y }, { x: endPct, y }]
            const linePath = `M 0 ${y} L ${endPct} ${y}`
            const fillPath = linePath + ` L ${endPct} 100 L 0 100 Z`
            return { linePath, fillPath, dots: [], points }
        }

        const totalMs = AY_END.getTime() - AY_START.getTime()
        const pctToMs = (p) => AY_START.getTime() + (p / 100) * totalMs
        const markerDate = new Date(pctToMs(markerPct))
        markerDate.setHours(0, 0, 0, 0)

        // Reverse-walk from balNum at TODAY to find balance at graph start
        // (balNum is always anchored at today, even when markerPct is earlier)
        let bal = balNum
        // Reverse weekly spend (daily)
        const graphStartDate = new Date(AY_START)
        graphStartDate.setHours(0, 0, 0, 0)
        for (let d = new Date(todayMidnight); d > graphStartDate; d.setDate(d.getDate() - 1)) {
            const prev = new Date(d)
            prev.setDate(prev.getDate() - 1)
            const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
            if (dailyRate > 0) {
                bal += dailyRate
            }
            // Reverse discrete events on this day
            for (const evt of allPastDiscrete) {
                if (evt.date === key) {
                    bal -= evt.type === 'income' ? evt.amount : -evt.amount
                }
            }
        }
        const balAtGraphStart = bal

        // Forward walk day by day to build points (all the way to today, not just marker)
        const points = []
        const dots = []
        let running = balAtGraphStart
        points.push({ x: 0, y: toTopPct(running) })

        // Walk to todayMidnight so the daily-rate gradient covers the full past
        const walkEndDate = new Date(Math.max(markerDate.getTime(), todayMidnight.getTime()))
        const walkEndPct = Math.max(markerPct, todayPct)

        for (let d = new Date(graphStartDate); d < walkEndDate; d.setDate(d.getDate() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const x = datePct(key)
            if (x >= walkEndPct) break

            // Apply discrete events on this day
            for (const evt of allPastDiscrete) {
                if (evt.date === key) {
                    points.push({ x, y: toTopPct(running) })
                    const yBefore = toTopPct(running)
                    running += evt.type === 'income' ? evt.amount : -evt.amount
                    const yAfter = toTopPct(running)
                    points.push({ x, y: yAfter })
                    dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: running })
                }
            }

            // Apply daily weekly spend
            if (dailyRate > 0) {
                running -= dailyRate
            }

            // Add end-of-day point
            const nextDay = new Date(d)
            nextDay.setDate(nextDay.getDate() + 1)
            const nextX = datePct(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`)
            if (nextX < walkEndPct) {
                points.push({ x: nextX, y: toTopPct(running) })
            }
        }
        points.push({ x: walkEndPct, y: toTopPct(running) })

        const startX = points[0].x
        const endX = walkEndPct
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const fillPath = linePath + ` L ${endX} 100 L ${startX} 100 Z`
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
    // Expose scrub state for parent components
    useEffect(() => { window.__budgeup_scrubbing = scrubRef }, [])
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

    // All event dots combined — deduplicate by event date + editType
    const allDots = (() => {
        const combined = [...(pastPath?.dots || []), ...(steppedPath?.dots || [])]
        const seen = new Set()
        return combined.filter(dot => {
            const key = `${dot.event?.date}:${dot.event?.editType}:${dot.event?.amount}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    })()

    // Keep refs for scrubber calculations (avoids stale closures in touch handlers)
    const balancePointsRef = useRef(balancePoints)
    balancePointsRef.current = balancePoints
    // Build history line points for scrubber proximity check
    const historyLinePoints = (() => {
        if (!balanceHistory.length) return []
        const byDate = new Map()
        for (const bh of balanceHistory) {
            if (!byDate.has(bh.recorded_date)) byDate.set(bh.recorded_date, bh)
        }
        return [...byDate.values()]
            .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
            .map(bh => ({ x: datePct(bh.recorded_date), y: toTopPct(Number(bh.balance)) }))
            .filter(p => p.x > 0.5 && p.x < 99.5)
    })()
    const historyLineRef = useRef(historyLinePoints)
    historyLineRef.current = historyLinePoints
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
            // Centre horizontally on the scrub line (use clientX which tracks the finger/scrub position)
            const tooltipX = Math.max(rect.left + 65, Math.min(rect.right - 65, clientX))
            const tooltipY = rect.top - 10
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
    const xAxisContainerRef = useRef(null)
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

        if (!zoomEnabledRef.current) return
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
            t.startY = e.touches[0].clientY
            t.lastX = e.touches[0].clientX
            t.startPanX = panRef.current
            t.startTime = performance.now()
            t.lastTime = performance.now()
            t.velocityX = 0

            // Record start position for scrubber activation on move
            if (hasBalance) {
                s.startX = e.touches[0].clientX
                s.startY = e.touches[0].clientY
                s.nearLineCheck = true
                // Always check if touch Y is near the graph line
                {
                    const container = graphContainerRef.current
                    if (container) {
                        const rect = container.getBoundingClientRect()
                        const touchXPct = ((e.touches[0].clientX - rect.left) / rect.width) * 100
                        const touchYPct = ((e.touches[0].clientY - rect.top) / rect.height) * 100
                        const proximityPx = 40
                        const proximityPct = (proximityPx / rect.height) * 100
                        const pts = balancePointsRef.current
                        let lineYPct = null
                        for (let j = 0; j < pts.length - 1; j++) {
                            if (touchXPct >= pts[j].x && touchXPct <= pts[j + 1].x) {
                                const t2 = (touchXPct - pts[j].x) / (pts[j + 1].x - pts[j].x || 1)
                                lineYPct = pts[j].y + t2 * (pts[j + 1].y - pts[j].y)
                                break
                            }
                        }
                        if (lineYPct === null && pts.length > 0) lineYPct = pts[pts.length - 1].y
                        s.nearLineCheck = lineYPct !== null && Math.abs(touchYPct - lineYPct) < proximityPct
                    }
                }
            }
        }
    }, [animateTo, hasBalance, updateScrubPosition, scrubNearLineOnly])

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
                // If scrubNearLineOnly, check touch is near the graph line
                if (s.nearLineCheck === false) {
                    // Already determined not near line — skip
                } else {
                    s.active = true
                    if (navigator.vibrate) navigator.vibrate(10)
                    e.preventDefault()
                    updateScrubPosition(e.touches[0].clientX)
                    return
                }
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

        // Double-tap to zoom in/out (only when zoom enabled)
        if (e.touches.length === 0 && !t.isPinching && !t.isPanning && zoomEnabledRef.current) {
            const now = performance.now()
            const dx = Math.abs(t.startX - (t.lastTapX || 0))
            const dy = Math.abs((t.startY || 0) - (t.lastTapY || 0))
            const moved = Math.abs(t.startX - (t.lastX || t.startX))
            if (moved < 10 && t.lastTapTime && now - t.lastTapTime < 350 && dx < 40 && dy < 40) {
                // Double tap detected
                t.lastTapTime = 0
                t.isDoubleTap = true
                if (zoomRef.current > 1.5) {
                    // Zoom out
                    animateTo(1, 0, 300)
                } else {
                    // Zoom in to 3x centred on tap
                    const container = graphContainerRef.current
                    if (container) {
                        const rect = container.getBoundingClientRect()
                        const tapXRel = (t.startX - rect.left) / rect.width
                        const targetZoom = 3
                        const focalPct = (50 - panRef.current) + (tapXRel - 0.5) * (100 / zoomRef.current)
                        const newPan = clampPan(50 - focalPct + (tapXRel - 0.5) * (100 / targetZoom), targetZoom)
                        animateTo(targetZoom, newPan, 300)
                    }
                }
                return
            }
            t.lastTapTime = moved < 10 ? now : 0
            t.lastTapX = t.startX
            t.lastTapY = t.startY || 0
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

    // Also attach touch handlers to x-axis labels for panning
    useEffect(() => {
        const el = xAxisContainerRef.current
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
            padding: '14px 14px 10px 4px',
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
                <div style={{ width: Y_AXIS_W, position: 'relative', flexShrink: 0, zIndex: 0 }}>
                    {balanceVisible && ticks.map((tick, i) => {
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
                                opacity: balanceAnimated ? 1 : 0,
                                transition: 'top 0.5s ease, opacity 0.4s ease',
                            }}>
                                {fmtMoney(tick)}
                            </div>
                        )
                    })}
                </div>

                {/* Graph area — clip X so zoomed content doesn't bleed into y-axis */}
                <div ref={graphAreaRef} onClick={() => setTappedHistDot(null)} style={{ flex: 1, position: 'relative', overflowX: isZoomed ? 'clip' : 'visible', overflowY: 'visible' }}>
                    {/* Current source label */}
                    {currentEventLabel && (
                        <div style={{
                            position: 'absolute', top: 4, right: 6, zIndex: 15,
                            background: '#fff',
                            borderRadius: 8, padding: '3px 10px',
                            pointerEvents: 'none',
                            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
                        }}>
                            <span style={{
                                fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: currentEventType ? (events.find(e => e.editType === currentEventType)?.type === 'income' ? '#147b75' : '#e06470') : '#999',
                            }}>
                                {currentEventLabel}
                            </span>
                        </div>
                    )}
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

                        {/* Inline date dividers — adapt to zoom level (hidden when months shown externally below graph) */}
                        {!termLabelsBottom && (() => {
                            // During zoom-out animation, force month view to avoid day labels flying around
                            const curZoom = isZoomingOut ? 1 : labelZoomRef.current
                            const totalDays = Math.round((AY_END - AY_START) / 86400000)
                            const viewWidthDays = (100 / curZoom) / 100 * totalDays

                            if (viewWidthDays > 90) {
                                // Month labels at month boundaries
                                const step = (collapsed || viewWidthDays <= 200) ? 1 : 2
                                // Compute visible term label positions
                                const termMids = terms.map(term => {
                                    const sp = datePctStart(term.start)
                                    const ep = datePctEnd(term.end)
                                    return (sp + ep) / 2
                                }).filter(mid => mid > 0.5 && mid < 99.5)
                                const multipleTermLabels = termMids.length > 1 && !isZoomed && !collapsed
                                return MONTHS
                                    .filter((_, idx) => idx % step === 0)
                                    .map(({ label, date }, i) => {
                                        const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
                                        const pct = datePctFromDate(firstOfMonth)
                                        if (pct <= 0.5 || pct >= 99.5) return null
                                        // Hide all month labels if multiple term labels, or hide if too close to a term label
                                        const pillClash = multipleTermLabels || (!collapsed && !isZoomed && termMids.some(mid => Math.abs(pct - mid) < 8))
                                        if (pillClash) return null
                                        return (
                                            <div key={`month-${i}`} style={{
                                                position: 'absolute',
                                                left: `${pct}%`,
                                                top: 0, bottom: 0,
                                                pointerEvents: 'none',
                                                zIndex: 1,
                                            }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    left: 0, top: 0, bottom: 0,
                                                    width: 0,
                                                    borderLeft: '0.5px solid rgba(180,180,180,0.3)',
                                                }} />
                                                {!pillClash && (
                                                    <span style={{
                                                        position: 'absolute',
                                                        left: 4, top: -12,
                                                        fontSize: 9, fontWeight: 500,
                                                        fontFamily: 'Nunito, sans-serif',
                                                        color: '#9f9c9c',
                                                        lineHeight: 1,
                                                    }}>{label}</span>
                                                )}
                                            </div>
                                        )
                                    })
                            }

                            // Day ticks when zoomed
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
                                    <div key={`dt-${pct.toFixed(2)}`} style={{
                                        position: 'absolute',
                                        left: `${pct}%`,
                                        top: 0, bottom: 0,
                                        pointerEvents: 'none',
                                        zIndex: 1,
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            left: 0, top: 0, bottom: 0,
                                            width: 0,
                                            borderLeft: '0.5px solid rgba(180,180,180,0.2)',
                                        }} />
                                        <span style={{
                                            position: 'absolute',
                                            left: 4, top: -12,
                                            fontSize: 9, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#9f9c9c',
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                        }}>{label}</span>
                                    </div>
                                )
                                d.setDate(d.getDate() + dayInterval)
                            }
                            return ticks
                        })()}

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
                        {showHolidays && terms.map((term) => {
                            const sp = datePctStart(term.start)
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
                                            ? 'linear-gradient(to bottom, rgba(122,142,168,0) 0%, rgba(122,142,168,0.14) 15%, rgba(122,142,168,0.10) 60%, rgba(122,142,168,0) 100%)'
                                            : 'linear-gradient(to bottom, rgba(122,142,168,0) 0%, rgba(122,142,168,0.09) 15%, rgba(122,142,168,0.06) 60%, rgba(122,142,168,0) 100%)',
                                        borderLeft: '0.5px solid rgba(122,142,168,0.15)',
                                        borderRight: '0.5px solid rgba(122,142,168,0.15)',
                                        transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease, background 0.3s ease',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                    }}>
                                    {showHolidays && term.breaks.map((brk, j) => {
                                        const bsp = datePctStart(brk.start)
                                        const bep = datePctEnd(brk.end)
                                        const bl = ((bsp - sp) / wp) * 100
                                        const bw = ((bep - bsp) / wp) * 100
                                        const isExamFull = brk.name && /^exams?$/i.test(brk.name.trim())
                                        const isExamPrep = !isExamFull && brk.name && /exam|revision|prep/i.test(brk.name.trim())
                                        const isReading = brk.name && /reading/i.test(brk.name)
                                        return (
                                            <div key={j} style={{
                                                position: 'absolute',
                                                left: `${bl}%`, width: `${bw}%`,
                                                top: 0, bottom: 0,
                                                background: isExamFull ? HASH_BG_EXAM : isExamPrep ? HASH_BG_EXAM_PREP : isReading ? HASH_BG_READING : HASH_BG,
                                                transition: hasBalance ? undefined : 'left 0.35s ease, width 0.35s ease',
                                            }} />
                                        )
                                    })}
                                </div>
                            )
                        })}

                        {/* (Past line now rendered via pastPath SVG below) */}

                        {/* Past events: dots — only if steppedPath doesn't have its own past line */}
                        {balanceVisible && !hideDots && pastPath && !steppedPath?.pastLinePath && (
                            <>
                                {pastPath.dots.filter(dot => {
                                    if (dot.event.noDot) return false
                                    const pet = dot.event.editType
                                    return !hiddenEventTypes.includes(pet) && !hiddenEventTypes.some(h => pet.startsWith(h + ':'))
                                }).map((dot, i) => {
                                    const isIncome = dot.event.type === 'income'
                                    const pet = dot.event.editType
                                    const isHidden = false
                                    const isCurrent = !currentEventType || pet === currentEventType || pet.startsWith(currentEventType + ':')
                                    const isDimmed = currentEventType && !isCurrent
                                    const delay = 0.25 + i * 0.12
                                    const bg = isCurrent && currentEventType
                                        ? (isIncome ? '#147b75' : '#e06470')
                                        : (isIncome ? '#a8d5cf' : '#f2b3b8')
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
                                                    ? 'transform 0.15s ease'
                                                    : pastRevealed
                                                        ? 'transform 0.15s ease, opacity 0.2s ease, background 0.2s ease'
                                                        : `transform 0.3s cubic-bezier(.22,1,.36,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                            }}
                                        >
                                            <div style={{
                                                width: isActive ? 14 : 10, height: isActive ? 14 : 10,
                                                borderRadius: '50%',
                                                background: dot.event.flex ? 'transparent' : bg,
                                                border: dot.event.flex
                                                    ? `2px solid ${bg}`
                                                    : isActive ? '2px solid white' : '1px solid white',
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
                        {balanceVisible && !hideDots && showToday && steppedPath && steppedPath.dots.filter(dot => {
                            if (dot.event.noDot) return false
                            const et = dot.event.editType
                            return !hiddenEventTypes.includes(et) && !hiddenEventTypes.some(h => et.startsWith(h + ':'))
                        }).map((dot, i) => {
                            const isIncome = dot.event.type === 'income'
                            const et = dot.event.editType
                            const isHidden = false
                            const isCurrent = !currentEventType || et === currentEventType || et.startsWith(currentEventType + ':')
                            const isPast = dot.x < markerPct
                            const color = isCurrent
                                ? (isPast && !currentEventType ? (isIncome ? '#a8d5cf' : '#f2b3b8') : (isIncome ? '#147b75' : '#e06470'))
                                : (isIncome ? '#a8d5cf' : '#f2b3b8')
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
                                            ? 'transform 0.15s ease'
                                            : eventsRevealed
                                                ? 'transform 0.15s ease, opacity 0.2s ease'
                                                : `transform 0.3s cubic-bezier(.22,1,.36,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                    }}
                                >
                                    <div style={{
                                        width: isActive ? 14 : 10, height: isActive ? 14 : 10,
                                        borderRadius: '50%',
                                        background: dot.event.flex ? 'transparent'
                                            : (dot.event.hasOverride || dot.event.edited) && isCurrent && currentEventType ? '#3b82f6'
                                            : color,
                                        border: dot.event.flex
                                            ? `2px solid ${(dot.event.hasOverride || dot.event.edited) && isCurrent && currentEventType ? '#3b82f6' : color}`
                                            : isActive ? '2px solid white' : '1px solid white',
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
                            // Build combined line points (x%, y% top) from past + future paths
                            const linePts = []
                            if (pastPath?.points) linePts.push(...pastPath.points)
                            if (steppedPath?.points) {
                                const startIdx = linePts.length > 0 && steppedPath.points.length > 0 && Math.abs(steppedPath.points[0].x - markerPct) < 0.1 ? 1 : 0
                                for (let i = startIdx; i < steppedPath.points.length; i++) linePts.push(steppedPath.points[i])
                            }
                            linePts.sort((a, b) => a.x - b.x)
                            // Find y% on the green line at a given x% (interpolate between points)
                            const getLineY = (xPct) => {
                                if (!linePts.length) return toTopPct(balNum)
                                if (xPct <= linePts[0].x) return linePts[0].y
                                for (let j = 1; j < linePts.length; j++) {
                                    if (xPct <= linePts[j].x) {
                                        const p0 = linePts[j - 1], p1 = linePts[j]
                                        const dx = p1.x - p0.x
                                        if (dx === 0) return p0.y
                                        // Linear interpolation between the two points
                                        const t = (xPct - p0.x) / dx
                                        return p0.y + (p1.y - p0.y) * t
                                    }
                                }
                                return linePts[linePts.length - 1].y
                            }

                            return [...removedFutureEvents, ...removedPastEvents]
                                .filter(evt => (evt.editType === currentEventType || evt.editType?.startsWith(currentEventType + ':') || currentEventType?.startsWith(evt.editType + ':')) && !removedHiddenTypes.includes(evt.editType))
                                .map((evt, i) => {
                                    const x = datePct(evt.date)
                                    const yPct = getLineY(x)
                                    const isIncome = evt.type === 'income'
                                    const dotColor = '#e06470'
                                    const isActive = activeEventDot && activeEventDot.date === evt.date && activeEventDot.editType === evt.editType
                                    const size = isActive ? 14 : 12
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
                                                boxShadow: isActive ? `0 0 6px ${dotColor}50` : 'none',
                                                transition: 'width 0.15s ease, height 0.15s ease, border-width 0.15s ease, box-shadow 0.15s ease',
                                            }} />
                                        </div>
                                    )
                                })
                        })()}

                        {/* Colored vertical step lines at events — fade in with dots */}
                        {balanceVisible && !hideDots && showToday && steppedPath && steppedPath.dots
                            .filter(dot => {
                                if (dot.event.noDot) return false
                                const et = dot.event.editType
                                return !hiddenEventTypes.includes(et) && !hiddenEventTypes.some(h => et.startsWith(h + ':'))
                            })
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
                                            transition: `opacity 0.3s ease ${delay}s`,
                                        }}
                                    />
                                )
                            })}

                        {/* Today marker — dashed line + pill (opt-in via showTodayMarker) */}
                        {showToday && showTodayMarker && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: `${markerPct}%`,
                                    top: 0, bottom: 2,
                                    width: 1,
                                    transform: 'translateX(-0.5px)',
                                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(241,169,80,0.4) 0, rgba(241,169,80,0.4) 3px, transparent 3px, transparent 6px)',
                                    maskImage: 'linear-gradient(to bottom, black 0%, black 65%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 65%, transparent 100%)',
                                    pointerEvents: 'none',
                                }} />
                                <div style={{
                                    position: 'absolute', left: `${markerPct}%`, top: -5,
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(241,169,80,0.75)',
                                    backdropFilter: 'blur(8px)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                    color: '#fff',
                                    fontSize: 7, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    padding: '2.5px 6px', borderRadius: 6,
                                    whiteSpace: 'nowrap', letterSpacing: 0.5, zIndex: 2,
                                    border: '0.5px solid rgba(255,255,255,0.3)',
                                    boxShadow: '0 2px 8px rgba(241,169,80,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    lineHeight: 1,
                                }}>{markerLabel}</div>
                            </>
                        )}

                        {/* Balance-mode: orange dot at balance position */}
                        {balanceVisible && showToday && (() => {
                            const isOneOff = currentEventType === 'oneOffIncome' || currentEventType === 'oneOffExpense'
                            const hasCurrentAtToday = isOneOff && currentEventType && pastEvents.some(e => e.editType === currentEventType && Math.abs(datePct(e.date) - markerPct) < 0.5)
                            const isTodayTapped = tappedHistDot?.date === '__today__'
                            return (
                                <>
                                    {/* Pulsing ring */}
                                    {dotAnimated && !isTodayTapped && (
                                        <div style={{
                                            position: 'absolute',
                                            left: `${markerPct}%`,
                                            top: `${balTopPct}%`,
                                            transform: 'translate(-50%, -50%)',
                                            width: 13, height: 13, // matches dot size for ring alignment
                                            borderRadius: '50%',
                                            border: '2px solid rgba(241,169,80,0.4)',
                                            animation: 'orangePulse 2s ease-out infinite',
                                            pointerEvents: 'none',
                                            zIndex: hasCurrentAtToday ? 2 : 25,
                                            transition: 'none',
                                        }} />
                                    )}
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
                                            opacity: dotAnimated ? 1 : 0,
                                            width: isTodayTapped ? 18 : 14, height: isTodayTapped ? 18 : 14,
                                            borderRadius: '50%',
                                            background: '#f1a950',
                                            border: '2px solid white',
                                            boxShadow: isTodayTapped
                                                ? '0 0 8px 3px rgba(241,169,80,0.5)'
                                                : 'none',
                                            cursor: 'pointer',
                                            zIndex: hasCurrentAtToday ? 3 : 25,
                                            pointerEvents: hasCurrentAtToday ? 'none' : 'auto',
                                            transition: (dotAnimated || dotExiting)
                                                ? 'transform 0.3s ease, opacity 0.3s ease, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease'
                                                : 'none',
                                        }}
                                    />
                                </>
                            )
                        })()}


                        {/* Term labels at top — fade when zoomed/collapsed/hidden */}
                        {showHolidays && terms.map((term) => {
                            const sp = datePctStart(term.start)
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
                                    data-term-label
                                    key={`lbl-${term.id}`}
                                    onClick={(e) => { if (!isZoomed) { const rect = e.currentTarget.getBoundingClientRect(); onTermClick?.(term.id, { clickX: rect.left + rect.width / 2, clickY: rect.bottom }) } }}
                                    style={{
                                        position: 'absolute', left: `${mid}%`, ...(termLabelsBottom ? { bottom: 0 } : { top: -13 }),
                                        transform: 'translateX(-50%)',
                                        background: expandedTerm === term.id ? '#7a8ea8' : '#e8edf2',
                                        color: expandedTerm === term.id ? '#fff' : '#7a8ea8',
                                        fontSize: 8,
                                        fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        padding: '2px 14px',
                                        borderRadius: 20,
                                        whiteSpace: 'nowrap',
                                        cursor: isZoomed ? 'default' : 'pointer',
                                        border: 'none',
                                        zIndex: expandedTerm === term.id ? 5 : 3,
                                        opacity: (isZoomed || collapsed) ? 0 : 1,
                                        pointerEvents: (isZoomed || collapsed) ? 'none' : 'auto',
                                        transition: 'background 0.2s ease, color 0.2s ease, font-size 0.2s ease, padding 0.2s ease, opacity 0.3s ease' + (hasBalance ? '' : ', left 0.35s ease'),
                                    }}
                                >{term.name}</div>
                            )
                        })}

                        {/* Past events: stepped line + fill (inside zoom div — no CSS scale so strokes stay clean) */}
                        {/* Past balance: flat line (no past events) — only show if steppedPath has no past line */}
                        {balanceVisible && pastPath && pastPath.points.length <= 2 && pastPath.dots.length === 0 && !steppedPath?.pastLinePath && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    left: 0, right: `${100 - markerPct}%`,
                                    top: `${greenTopPct}%`, bottom: 0,
                                    background: 'linear-gradient(to bottom, rgba(20,123,117,0.12), rgba(20,123,117,0))',
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
                        {balanceVisible && pastPath && (pastPath.dots.length > 0 || pastPath.points.length > 2) && !steppedPath?.pastLinePath && (
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
                                        {(() => {
                                            const rawZeroPct = yMax > yMin ? toTopPct(0) : 100
                                            const zeroOnChart = rawZeroPct >= 0 && rawZeroPct <= 100
                                            const zeroPct = Math.max(0, Math.min(100, rawZeroPct))
                                            const bufferPct = 15
                                            const amberStart = Math.max(0, zeroPct - bufferPct)
                                            return (
                                                <linearGradient id="pastRetroGrad" x1="0" y1="0" x2="0" y2="1">
                                                    {zeroOnChart ? (<>
                                                        <stop offset="0%" stopColor="rgba(20,123,117,0.12)" />
                                                        <stop offset={`${amberStart}%`} stopColor="rgba(20,123,117,0.05)" />
                                                        <stop offset={`${zeroPct}%`} stopColor="rgba(236,140,23,0.07)" />
                                                        <stop offset={`${Math.min(100, zeroPct + bufferPct)}%`} stopColor="rgba(224,100,112,0.05)" />
                                                        <stop offset="100%" stopColor="rgba(224,100,112,0)" />
                                                    </>) : (<>
                                                        <stop offset="0%" stopColor="rgba(20,123,117,0.12)" />
                                                        <stop offset="100%" stopColor="rgba(20,123,117,0)" />
                                                    </>)}
                                                </linearGradient>
                                            )
                                        })()}
                                    </defs>
                                    <path
                                        d={pastPath.fillPath}
                                        fill="url(#pastRetroGrad)"
                                    />
                                    <path
                                        d={pastPath.linePath}
                                        fill="none"
                                        stroke="rgba(20,123,117,0.25)"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        shapeRendering="geometricPrecision"
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
                                    {/* Fill + line gradients: fill always shows color zones, line only when balance drops near zero */}
                                    {(() => {
                                        const rawZeroPct = yMax > yMin ? toTopPct(0) : 100
                                        const zeroOnChart = rawZeroPct >= 0 && rawZeroPct <= 100
                                        const lineNearZero = zeroOnChart && projMin < 100
                                        const zeroPct = Math.max(0, Math.min(100, rawZeroPct))
                                        const bufferPct = 8
                                        const amberStart = Math.max(0, zeroPct - bufferPct)
                                        return (
                                            <>
                                                {/* Fill always shows color zones when zero is on chart */}
                                                <linearGradient id="stepGrad" x1="0" y1="0" x2="0" y2="1">
                                                    {zeroOnChart ? (<>
                                                        <stop offset="0%" stopColor="rgba(20,123,117,0.15)" />
                                                        <stop offset={`${amberStart}%`} stopColor="rgba(20,123,117,0.06)" />
                                                        <stop offset={`${zeroPct}%`} stopColor="rgba(236,140,23,0.08)" />
                                                        <stop offset={`${Math.min(100, zeroPct + bufferPct)}%`} stopColor="rgba(224,100,112,0.08)" />
                                                        <stop offset="100%" stopColor="rgba(224,100,112,0.06)" />
                                                    </>) : (<>
                                                        <stop offset="0%" stopColor="rgba(20,123,117,0.15)" />
                                                        <stop offset="100%" stopColor="rgba(20,123,117,0)" />
                                                    </>)}
                                                </linearGradient>
                                                {/* Line always green */}
                                                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#147b75" />
                                                    <stop offset="100%" stopColor="#147b75" />
                                                </linearGradient>
                                            </>
                                        )
                                    })()}
                                </defs>
                                {/* Combined fill for entire line (past + future) — single gradient ensures consistent color */}
                                <path
                                    d={steppedPath.fillPath}
                                    fill="url(#stepGrad)"
                                    shapeRendering="geometricPrecision"
                                    opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                    style={{ transition: 'opacity 0.5s ease 0.4s' }}
                                />
                                {/* Past portion of stepped line (lighter stroke) */}
                                {steppedPath.pastLinePath && (
                                    <path
                                        d={steppedPath.pastLinePath}
                                        fill="none"
                                        stroke="rgba(20,123,117,0.35)"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        shapeRendering="geometricPrecision"
                                        opacity={(eventsRevealed || isZoomed) ? 1 : 0}
                                        style={{ transition: 'opacity 0.5s ease' }}
                                    />
                                )}
                                <path
                                    d={steppedPath.futureLinePath || steppedPath.linePath}
                                    fill="none"
                                    stroke="url(#lineGrad)"
                                    strokeWidth="1.8"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                    shapeRendering="geometricPrecision"
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
                            // Show dots: space them so there's always ~1.5 dot-widths gap between each
                            // Dot is 10px wide, so min spacing = 10 * 2.5 = 25px between centres
                            const graphWidth = graphAreaRef.current?.offsetWidth || 300
                            const effectiveWidth = graphWidth * (zoom || 1)
                            const dotSize = 10
                            const minGapPx = dotSize * 2.5 // 1.5 dot-widths gap = 2.5 dot-widths centre-to-centre
                            const minGapPct = (minGapPx / effectiveWidth) * 100
                            const dotPoints = (() => {
                                if (allHistPoints.length <= 1) return allHistPoints
                                const last = allHistPoints[allHistPoints.length - 1]
                                const pts = [last]
                                for (let i = allHistPoints.length - 2; i >= 0; i--) {
                                    const prevShown = pts[pts.length - 1]
                                    if (Math.abs(prevShown.x - allHistPoints[i].x) >= minGapPct) {
                                        pts.push(allHistPoints[i])
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
                                                    background: '#f1a950',
                                                    border: '2px solid white',
                                                    boxShadow: isActive ? '0 0 8px rgba(241,169,80,0.5)' : 'none',
                                                    pointerEvents: showBalanceHistory ? 'auto' : 'none',
                                                    cursor: 'pointer',
                                                    zIndex: isActive ? 20 : 11,
                                                    transition: `transform 0.3s cubic-bezier(.22,1,.36,1) ${delay}s, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease`,
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
                            // Shift tooltip horizontally so it doesn't get cut off at edges
                            const xPct = tappedHistDot.x
                            const translateX = xPct < 12 ? '0%' : xPct > 88 ? '-100%' : '-50%'
                            return (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: `${xPct}%`,
                                        top: `${tappedHistDot.y}%`,
                                        transform: showBelow ? `translate(${translateX}, 14px)` : `translate(${translateX}, calc(-100% - 12px))`,
                                        background: '#fff',
                                        borderRadius: 12,
                                        padding: '8px 16px',
                                        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                        zIndex: 30,
                                        pointerEvents: 'none',
                                        whiteSpace: 'nowrap',
                                        minWidth: 100,
                                        textAlign: 'center',
                                    }}
                                >
                                    <div style={{
                                        fontSize: 9, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif', color: '#999',
                                        marginBottom: 3,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                    }}>
                                        <span>{dateLabel}</span>
                                    </div>
                                    <div style={{
                                        fontSize: 10, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif', color: '#EC8C17',
                                        marginBottom: 1,
                                    }}>
                                        Actual balance
                                    </div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif', color: '#EC8C17',
                                    }}>
                                        {sym}{Math.round(tappedHistDot.balance).toLocaleString()}
                                    </div>
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
                            width: 14, height: 14,
                            borderRadius: '50%',
                            background: '#147b75',
                            border: '2.5px solid white',
                            boxShadow: '0 0 8px rgba(0,0,0,0.2)',
                            pointerEvents: 'none',
                            zIndex: 26,
                            display: 'none',
                        }} />
                    </div>


                </div>

                {/* Bottom fade to white — below labels so they stay readable */}
                <div style={{
                    position: 'absolute', bottom: -2, left: 0, right: 0, height: 30,
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 60%, rgba(255,255,255,0.8) 100%)',
                    pointerEvents: 'none', zIndex: 2,
                }} />

            </div>

            {/* Spacer between graph and x-axis labels */}
            <div style={{ height: 0, margin: '0', marginLeft: Y_AXIS_W }} />

            {/* X-axis date labels */}
            <div ref={xAxisContainerRef} style={{
                position: 'relative', height: 0, marginTop: 0, marginBottom: 0, marginLeft: Y_AXIS_W,
                overflow: 'hidden', touchAction: 'none',
            }}>
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
                                // Month labels — evenly spaced, show all when showXAxis
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
                        borderRadius: 12,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                        padding: '8px 16px',
                        minWidth: 130,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                    }}>
                        {/* Date + period label on same line */}
                        <div style={{
                            fontSize: 9,
                            fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#999',
                            marginBottom: 3,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}>
                            <span>{scrubData.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
                                return periodLabel ? <span style={{ color: '#bbb' }}>· {periodLabel}</span> : null
                            })()}
                        </div>
                        {/* Actual balance (shown above predicted when available) */}
                        {scrubData.actualBal != null && (<>
                            <div style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#EC8C17', marginBottom: 1 }}>
                                Actual balance
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#EC8C17', marginBottom: 4 }}>
                                {scrubData.actualBal < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(scrubData.actualBal)).toLocaleString()}
                            </div>
                        </>)}
                        {/* Predicted */}
                        <div style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75', marginBottom: 1 }}>
                            Predicted balance
                        </div>
                        <div style={{
                            fontSize: scrubData.actualBal != null ? 13 : 16,
                            fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: scrubData.balance >= 0 ? '#147b75' : '#e06470',
                        }}>
                            {scrubData.balance < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(scrubData.balance)).toLocaleString()}
                        </div>
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
