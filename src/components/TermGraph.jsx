import { useState, useEffect, useRef, useCallback } from 'react'

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

    // Thin out ticks to max 4-5 visible labels
    let ticks = allTicks
    let skip = 2
    while (ticks.length > 6) {
        ticks = allTicks.filter((_, i) => i % skip === 0)
        skip++
    }

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

export default function TermGraph({ terms, expandedTerm, balance, overdraft, events = [], hiddenEventTypes = [], currentEventType, onEventClick, onBalanceClick, onTermClick, footer, showDotsToggle, onToggleDots, showIncome, onToggleIncome, showExpenses, onToggleExpenses, graphHeight = 108, marginTop = 16, graphHeightRef }) {
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayPct = Math.max(0, Math.min(100, (todayMidnight - AY_START) / AY_MS * 100))
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
    let projMin = balNum, projMax = balNum
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

    const anyEvents = hasEvents || hasPastEvents
    const { yMin, yMax, ticks } = hasBalance
        ? calcYRange(balNum, (anyEvents || hasOverdraft) ? projMin : undefined, (anyEvents || hasOverdraft) ? projMax : undefined)
        : { yMin: 0, yMax: 100, ticks: [] }
    const toTopPct = (val) => Math.max(2, Math.min(98, 100 - ((val - yMin) / (yMax - yMin)) * 100))
    const balTopPctLive = hasBalance ? toTopPct(balNum) : 0
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

    // Build stepped path points and dot positions
    const steppedPath = (() => {
        if (!hasEvents || !hasBalance) return null

        let bal = balNum
        const points = [{ x: todayPct, y: toTopPct(bal) }]
        const dots = []

        for (const evt of futureEvents) {
            const x = datePct(evt.date)
            const yBefore = toTopPct(bal)
            // Horizontal to event date
            points.push({ x, y: yBefore })
            // Step to new balance
            bal += evt.type === 'income' ? evt.amount : -evt.amount
            const yAfter = toTopPct(bal)
            points.push({ x, y: yAfter })
            dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: bal })
        }

        // Extend to end
        points.push({ x: 100, y: toTopPct(bal) })

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const fillPath = linePath + ` L 100 100 L ${todayPct} 100 Z`

        return { linePath, fillPath, dots }
    })()

    // Build past events path (faded, leading up to today)
    const pastPath = (() => {
        if (!hasPastEvents || !hasBalance) return null

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

        for (const evt of pastEvents) {
            const x = Math.max(3, datePct(evt.date))
            const yBefore = toTopPct(bal)
            // Flat line to event date
            points.push({ x, y: yBefore })
            // Step at event
            bal += evt.type === 'income' ? evt.amount : -evt.amount
            const yAfter = toTopPct(bal)
            points.push({ x, y: yAfter })
            dots.push({ x, yBefore, yAfter, event: evt, balanceAfter: bal })
        }

        // Flat line to today (bal should equal balNum here)
        points.push({ x: todayPct, y: toTopPct(bal) })

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const startX = points[0].x
        const fillPath = linePath + ` L ${todayPct} 100 L ${startX} 100 Z`

        return { linePath, fillPath, dots }
    })()

    /* ---------- ZOOM & PAN ---------- */

    const MAX_ZOOM = 36
    const [zoom, setZoom] = useState(1)
    const [panX, setPanX] = useState(0)
    const graphContainerRef = useRef(null)
    const zoomDivRef = useRef(null)
    const xAxisDivRef = useRef(null)
    const animRef = useRef(null)
    const [isAnimatingZoom, setIsAnimatingZoom] = useState(false)
    const isZoomed = zoom > 1.05

    // Live refs — gesture handlers read/write these, React state syncs on gesture end
    const zoomRef = useRef(1)
    const panRef = useRef(0)

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
        setIsAnimatingZoom(true)

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
        if (!zoomEnabledRef.current) return
        const t = touchRef.current

        // Check for double-tap first — handle it cleanly without disrupting animation state
        if (e.touches.length === 1) {
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
        }
    }, [animateTo])

    const handleTouchMove = useCallback((e) => {
        const t = touchRef.current
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
                if (now - t.lastSyncTime > 150) {
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
        if (e.touches.length < 2 && t.isPinching) {
            t.isPinching = false
            if (zoomRef.current < 1.15) {
                animateTo(1, 0, 200)
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
            padding: '10px 14px 8px 8px',
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
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

            <div ref={(el) => { graphContainerRef.current = el; if (graphHeightRef) graphHeightRef.current = el }} style={{ display: 'flex', height: graphHeight, overflowX: 'clip', overflowY: 'visible' }}>
                {/* Y-axis — always reserves space so graph width is consistent */}
                <div style={{ width: Y_AXIS_W, position: 'relative', flexShrink: 0 }}>
                    {balanceVisible && ticks.map((tick, i) => (
                        <div key={tick} style={{
                            position: 'absolute',
                            right: 4,
                            top: `${toTopPct(tick)}%`,
                            transform: 'translateY(-50%)',
                            fontSize: 6,
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
                <div style={{ flex: 1, position: 'relative', overflowX: 'clip', overflowY: 'visible' }}>
                    <div ref={zoomDivRef} style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${innerLeft}%`,
                        width: `${innerWidth}%`,
                        willChange: zoom > 1 ? 'left, width' : undefined,
                    }}>
                        {/* Grid lines — use background-image so dash pattern doesn't stretch with zoom */}
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(pct => (
                                <line key={pct} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`}
                                    stroke="#e4e4e4" strokeWidth="0.5" strokeDasharray="3 3"
                                    vectorEffect="non-scaling-stroke" />
                            ))}
                        </svg>

                        {/* Zero line — pinkish-red dashed like other grid lines */}
                        {hasBalance && !hasOverdraft && yMin < 0 && yMax > 0 && (() => {
                            const zeroPct = toTopPct(0)
                            return (
                                <div style={{
                                    position: 'absolute', left: 0, right: 0,
                                    top: `${zeroPct}%`, height: '0.5px',
                                    backgroundImage: 'repeating-linear-gradient(to right, rgba(224,100,112,0.5) 0, rgba(224,100,112,0.5) 3px, transparent 3px, transparent 6px)',
                                    zIndex: 1,
                                    pointerEvents: 'none',
                                }} />
                            )
                        })()}

                        {/* Overdraft limit line */}
                        {hasBalance && hasOverdraft && (() => {
                            const odPct = toTopPct(-overdraft)
                            return (
                                <>
                                    <div style={{
                                        position: 'absolute', left: 0, right: 0,
                                        top: `${odPct}%`, height: '0.5px',
                                        backgroundImage: 'repeating-linear-gradient(to right, rgba(224,100,112,0.4) 0, rgba(224,100,112,0.4) 3px, transparent 3px, transparent 6px)',
                                        zIndex: 1,
                                        pointerEvents: 'none',
                                    }} />
                                    {/* Overdraft label */}
                                    <div style={{
                                        position: 'absolute',
                                        right: 4,
                                        top: `${odPct}%`,
                                        transform: 'translateY(-50%)',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        background: '#fde8ea',
                                        borderRadius: 4,
                                        padding: '1px 4px',
                                        pointerEvents: 'none',
                                        zIndex: 2,
                                    }}>
                                        <span style={{
                                            fontSize: 6,
                                            fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: 'rgba(224,100,112,0.8)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            Overdraft −£{overdraft.toLocaleString()}
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
                        {balanceVisible && pastPath && (
                            <>
                                {pastPath.dots.filter(dot => !dot.event.noDot).map((dot, i) => {
                                    const isIncome = dot.event.type === 'income'
                                    const isHidden = hiddenEventTypes.includes(dot.event.editType)
                                    const isCurrent = !currentEventType || dot.event.editType === currentEventType
                                    const isDimmed = currentEventType && !isCurrent
                                    const delay = 0.25 + i * 0.12
                                    // Past dots: full color when matching currentEventType, lighter otherwise
                                    const bg = isDimmed
                                        ? (isIncome ? '#d4eae9' : '#f8dde0')
                                        : (currentEventType && isCurrent)
                                            ? (isIncome ? '#147b75' : '#e06470')
                                            : (isIncome ? '#a8d5d3' : '#f2c4c8')
                                    return (
                                        <div
                                            key={`past-${i}`}
                                            onClick={(e) => { e.stopPropagation(); onEventClick?.({ ...dot.event, balanceAfter: dot.balanceAfter }, e) }}
                                            style={{
                                                position: 'absolute',
                                                left: `${dot.x}%`,
                                                top: `${dot.yAfter}%`,
                                                transform: (pastRevealed || isZoomed) && !isHidden
                                                    ? `translate(-50%, -50%) scale(1)`
                                                    : `translate(-50%, -50%) scale(0)`,
                                                opacity: (pastRevealed || isZoomed) && !isHidden ? 1 : 0,
                                                width: isDimmed ? 8 : 10, height: isDimmed ? 8 : 10,
                                                borderRadius: '50%',
                                                background: bg,
                                                border: isCurrent ? '1px solid white' : '0.75px solid white',
                                                boxShadow: isCurrent ? `0 0 4px 2px ${isIncome ? 'rgba(20,123,117,0.2)' : 'rgba(224,100,112,0.2)'}` : 'none',
                                                cursor: 'pointer',
                                                zIndex: isCurrent ? 5 : 4,
                                                transition: isZoomed
                                                    ? 'none'
                                                    : pastRevealed
                                                        ? 'transform 0.2s ease, opacity 0.2s ease, background 0.2s ease'
                                                        : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                            }}
                                        />
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
                        {balanceVisible && showToday && steppedPath && steppedPath.dots.filter(dot => !dot.event.noDot).map((dot, i) => {
                            const isIncome = dot.event.type === 'income'
                            const isHidden = hiddenEventTypes.includes(dot.event.editType)
                            const isCurrent = !currentEventType || dot.event.editType === currentEventType
                            const color = isCurrent
                                ? (isIncome ? '#147b75' : '#e06470')
                                : (isIncome ? '#a8d5d3' : '#f2c4c8')
                            const delay = 0.25 + i * 0.12
                            return (
                                <div
                                    key={i}
                                    onClick={(e) => { if (!isHidden) { e.stopPropagation(); onEventClick?.({ ...dot.event, balanceAfter: dot.balanceAfter }, e) } }}
                                    style={{
                                        position: 'absolute',
                                        left: `${dot.x}%`,
                                        top: `${dot.yAfter}%`,
                                        transform: (eventsRevealed || isZoomed) && !isHidden
                                            ? `translate(-50%, -50%) scale(1)`
                                            : `translate(-50%, -50%) scale(0)`,
                                        opacity: (eventsRevealed || isZoomed) && !isHidden ? 1 : 0,
                                        width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8,
                                        borderRadius: '50%',
                                        background: color,
                                        border: isCurrent ? '1px solid white' : '0.75px solid white',
                                        boxShadow: isCurrent ? `0 0 4px 2px ${isIncome ? 'rgba(20,123,117,0.2)' : 'rgba(224,100,112,0.2)'}` : 'none',
                                        cursor: 'pointer',
                                        pointerEvents: 'auto',
                                        zIndex: isCurrent ? 6 : 5,
                                        transition: isZoomed
                                            ? 'none'
                                            : eventsRevealed
                                                ? 'transform 0.2s ease, opacity 0.2s ease'
                                                : `transform 0.35s cubic-bezier(.34,1.56,.64,1) ${delay}s, opacity 0.2s ease ${delay}s`,
                                    }}
                                />
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
                                    const dotColor = '#a8d5d3'
                                    return (
                                        <svg
                                            key={`removed-${i}`}
                                            onClick={(e) => { e.stopPropagation(); onEventClick?.({ ...evt, balanceAfter: null }, e) }}
                                            width="11" height="11" viewBox="0 0 11 11"
                                            style={{
                                                position: 'absolute',
                                                left: `${x}%`,
                                                top: `${toTopPct(bal)}%`,
                                                transform: 'translate(-50%, -50%)',
                                                cursor: 'pointer',
                                                pointerEvents: 'auto',
                                                zIndex: 6,
                                                overflow: 'visible',
                                            }}
                                        >
                                            <circle cx="5.5" cy="5.5" r="4" fill="none" stroke={dotColor} strokeWidth="1.5" strokeDasharray="2 2" />
                                        </svg>
                                    )
                                })
                        })()}

                        {/* Colored vertical step lines at events — fade in with dots */}
                        {balanceVisible && showToday && steppedPath && steppedPath.dots
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
                                            left: `${dot.x}%`,
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
                        {balanceVisible && showToday && (
                            <div
                                onClick={(e) => { e.stopPropagation(); onBalanceClick?.(e) }}
                                style={{
                                    position: 'absolute',
                                    left: `${todayPct}%`,
                                    top: `${balTopPct}%`,
                                    transform: dotAnimated
                                        ? 'translate(-50%, -50%) scale(1)'
                                        : 'translate(-50%, -50%) scale(0)',
                                    width: 13, height: 13,
                                    borderRadius: '50%',
                                    background: '#EC8C17',
                                    border: '1.5px solid white',
                                    boxShadow: '0 0 4px 2px rgba(236,140,23,0.2)',
                                    cursor: 'pointer',
                                    zIndex: 7,
                                    transition: zoom > 1
                                        ? 'top 0.5s ease'
                                        : dotAnimated
                                            ? 'transform 0.5s ease, top 0.5s ease'
                                            : 'transform 0.4s cubic-bezier(.22,1,.36,1)',
                                }}
                            />
                        )}

                        {/* Term labels at bottom — fade when zoomed */}
                        {terms.map((term) => {
                            const sp = datePct(term.start)
                            const ep = datePct(term.end)
                            const mid = (sp + ep) / 2
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
                    </div>

                </div>
            </div>

            {/* Separator */}
            <div style={{ height: 0.2, background: '#e8e8e8', margin: '2px 0 15px' }} />

            {/* X-axis date labels — adapt to zoom level */}
            <div style={{
                position: 'relative', height: 14, marginLeft: Y_AXIS_W,
                overflow: 'hidden',
            }}>
                <div ref={xAxisDivRef} style={{
                    position: 'absolute',
                    top: 0, bottom: 0,
                    left: `${innerLeft}%`,
                    width: `${innerWidth}%`,
                    opacity: isAnimatingZoom ? 0 : 1,
                    transition: 'opacity 0.25s ease',
                }}>
                    {(() => {
                        // Generate date ticks that adapt to zoom level
                        // All labels rendered across full range — parent overflow:hidden handles clipping
                        const curZoom = zoomRef.current
                        const viewWidthDays = (100 / curZoom) / 100 * 365

                        if (viewWidthDays > 90) {
                            // Month labels — evenly spaced across the full width
                            const count = MONTHS.length
                            return MONTHS.map(({ label, date }, i) => {
                                const pct = (i / (count - 1)) * 100
                                const isNow = today.getMonth() === date.getMonth() &&
                                    today.getFullYear() === date.getFullYear()
                                const isFirst = i === 0
                                const isLast = i === count - 1
                                return (
                                    <span key={label} style={{
                                        position: 'absolute', left: `${pct}%`,
                                        transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                                        fontSize: 7, fontWeight: 500,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: isNow ? '#147b75' : '#8f8f8f',
                                        whiteSpace: 'nowrap',
                                        animation: 'labelFadeIn 0.25s ease',
                                    }}>{label}</span>
                                )
                            })
                        }

                        // At higher zoom, generate date ticks across full year
                        // (parent overflow:hidden clips, labels hidden during zoom animation)
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
                            const pct = (d - AY_START) / AY_MS * 100
                            const label = `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
                            const isToday = d.getDate() === today.getDate() &&
                                d.getMonth() === today.getMonth() &&
                                d.getFullYear() === today.getFullYear()
                            ticks.push(
                                <span key={pct.toFixed(2)} style={{
                                    position: 'absolute', left: `${pct}%`,
                                    transform: 'translateX(-50%)',
                                    fontSize: 7, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: isToday ? '#EC8C17' : '#8f8f8f',
                                    whiteSpace: 'nowrap',
                                    animation: 'labelFadeIn 0.2s ease',
                                }}>{label}</span>
                            )
                            d.setDate(d.getDate() + dayInterval)
                        }
                        return ticks
                    })()}
                </div>
            </div>

            {/* Zoom-out button — overlaps month labels, right-aligned with graph, no layout impact */}
            <div style={{ position: 'relative', height: 0 }}>
                {isZoomed && (
                    <button
                        onClick={() => animateTo(1, 0, 300)}
                        style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: 24, height: 24,
                            borderRadius: 6,
                            border: '1px solid #e8e8e8',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 5,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <circle cx="7" cy="7" r="5.5" stroke="#666" strokeWidth="1.5" />
                            <path d="M4.5 7h5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M11 11l3.5 3.5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                )}
            </div>

            {footer}
        </div>
    )
}
