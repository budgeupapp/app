import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, TrendingDown, TrendingUp } from 'react-feather'
import { PiHouse, PiHouseFill, PiQuestion, PiQuestionFill, PiChatCircle, PiChatCircleFill, PiGear, PiGearFill, PiCalendarBlank, PiArrowLeft, PiArrowLeftBold, PiGraduationCap, PiHandCoins, PiUsers, PiBriefcase, PiDotsThree, PiLightningFill, PiBank, PiPiggyBank, PiRepeat, PiIdentificationCard, PiAirplaneTilt, PiMusicNotes, PiGift, PiDeviceMobile, PiTShirt, PiHeartbeat, PiBookOpen, PiBookOpenFill, PiStorefront, PiLifebuoy, PiLaptop, PiShuffle } from 'react-icons/pi'
import { analytics, MONEY_ADVICE_EVENTS } from '../lib/analytics/index.js'
import { getCurrencySymbol } from '../lib/settings'
import './BottomNav.css'

export default function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()
    const [fabOpen, setFabOpen] = useState(false)
    const [fabBalanceActive, setFabBalanceActive] = useState(false)
    const [fabSubMenu, setFabSubMenu] = useState(null)
    const [fabSourcePicker, setFabSourcePicker] = useState(null)
    const [pickerClosing, setPickerClosing] = useState(false)
    const fabRef = useRef(null)
    const fabBtnRef = useRef(null)
    const pickerScrollRef = useRef(null)
    const pickerInnerRef = useRef(null)
    const pickerTouchRef = useRef({ startX: 0, lastX: 0, offset: 0, lastTime: 0, velocity: 0 })
    const pickerOffsetRef = useRef(0)
    const pickerMomentumRef = useRef(null)
    const [pickerOffset, setPickerOffset] = useState(0)
    const getPickerSingleWidth = () => {
        const el = pickerInnerRef.current
        if (!el) return 1
        const contentEl = el.firstChild
        if (!contentEl) return 1
        return contentEl.scrollWidth / 3
    }

    const wrapOffset = (offset) => {
        const sw = getPickerSingleWidth()
        let o = offset % sw
        if (o > 0) o -= sw
        if (o < -sw) o += sw
        return o
    }

    const handlePickerTouchStart = (e) => {
        if (pickerMomentumRef.current) {
            cancelAnimationFrame(pickerMomentumRef.current)
            pickerMomentumRef.current = null
        }
        const t = pickerTouchRef.current
        t.startX = e.touches[0].clientX
        t.lastX = e.touches[0].clientX
        t.offset = pickerOffsetRef.current
        t.lastTime = Date.now()
        t.velocity = 0
    }

    const handlePickerTouchMove = (e) => {
        e.preventDefault()
        const t = pickerTouchRef.current
        const now = Date.now()
        const x = e.touches[0].clientX
        const dt = Math.max(1, now - t.lastTime)
        t.velocity = (x - t.lastX) / dt
        t.lastX = x
        t.lastTime = now
        const dx = x - t.startX
        const newOffset = wrapOffset(t.offset + dx)
        pickerOffsetRef.current = newOffset
        setPickerOffset(newOffset)
    }

    const handlePickerTouchEnd = () => {
        const velocity = pickerTouchRef.current.velocity
        if (Math.abs(velocity) < 0.05) return

        let v = velocity
        let lastTime = performance.now()
        const friction = 0.95

        const tick = (now) => {
            const dt = now - lastTime
            lastTime = now
            v *= Math.pow(friction, dt / 16)

            if (Math.abs(v) < 0.02) {
                pickerMomentumRef.current = null
                return
            }

            const newOffset = wrapOffset(pickerOffsetRef.current + v * dt)
            pickerOffsetRef.current = newOffset
            setPickerOffset(newOffset)
            pickerMomentumRef.current = requestAnimationFrame(tick)
        }

        pickerMomentumRef.current = requestAnimationFrame(tick)
    }

    // Reset scroll when picker opens/closes — start at middle copy
    useEffect(() => {
        if (!fabSourcePicker) {
            if (pickerMomentumRef.current) cancelAnimationFrame(pickerMomentumRef.current)
            pickerOffsetRef.current = 0
            setPickerOffset(0)
        } else {
            requestAnimationFrame(() => {
                const sw = getPickerSingleWidth()
                pickerOffsetRef.current = -sw
                setPickerOffset(-sw)
            })
        }
    }, [fabSourcePicker])

    // Register touch handlers when picker is open
    useEffect(() => {
        const el = pickerInnerRef.current
        if (!el || !fabSourcePicker) return
        const onStart = (e) => { e.stopPropagation(); handlePickerTouchStart(e) }
        const onMove = (e) => { e.stopPropagation(); handlePickerTouchMove(e) }
        const onEnd = () => handlePickerTouchEnd()
        el.addEventListener('touchstart', onStart, { passive: false })
        el.addEventListener('touchmove', onMove, { passive: false })
        el.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchmove', onMove)
            el.removeEventListener('touchend', onEnd)
        }
    }, [fabSourcePicker])

    const university = (() => {
        try {
            const saved = localStorage.getItem('budgeup_onboarding_state')
            const parsed = saved ? JSON.parse(saved) : {}
            return parsed?.formData?.university || ''
        } catch { return '' }
    })()

    const leftTabs = [
        { key: 'home', path: '/dashboard', icon: PiHouse, activeIcon: PiHouseFill },
        { key: 'resources', path: '/support', icon: PiBookOpen, activeIcon: PiBookOpenFill },
    ]
    const rightTabs = [
        { key: 'feedback', path: '/feedback', icon: PiChatCircle, activeIcon: PiChatCircleFill },
        { key: 'settings', path: '/settings', icon: PiGear, activeIcon: PiGearFill },
    ]

    const isActive = (path) => location.pathname === path
    const fabClosingRef = useRef(false)
    const [fabClosing, setFabClosing] = useState(false)
    const closeFab = () => {
        fabClosingRef.current = true
        setFabClosing(true)
        // Keep all state alive so exit animations can play
        // After exit animation, clear everything
        setTimeout(() => {
            setFabSourcePicker(null)
            setFabSubMenu(null)
            setFabOpen(false)
            setTimeout(() => {
                fabClosingRef.current = false
                setFabClosing(false)
            }, 50)
        }, 250)
    }

    const activeSources = window.__budgeup_active_sources || { income: [], expense: [], flexIncome: [], flexExpense: [] }
    const incomeSources = [
        { id: 'maintenance_loan', label: 'Loan', Icon: PiGraduationCap },
        { id: 'bursary', label: 'Bursary', Icon: PiHandCoins },
        { id: 'family_friends', label: 'Family', Icon: PiUsers },
        { id: 'work', label: 'Work', Icon: PiBriefcase },
        { id: 'other_income', label: 'Other', Icon: PiDotsThree },
    ].filter(s => s.id === 'other_income' || !activeSources.income.includes(s.id))
    const expenseSources = [
        { id: 'rent', label: 'Rent', Icon: PiHouse },
        { id: 'bills', label: 'Bills', Icon: PiLightningFill },
        { id: 'uni_fees', label: 'Uni Fees', Icon: PiBank },
        { id: 'savings_investments', label: 'Savings', Icon: PiPiggyBank },
        { id: 'subscriptions', label: 'Subscriptions', Icon: PiRepeat },
        { id: 'memberships', label: 'Memberships', Icon: PiIdentificationCard },
        { id: 'other_expense', label: 'Other', Icon: PiDotsThree },
    ].filter(s => s.id === 'other_expense' || !activeSources.expense.includes(s.id))
    const flexIncomeSources = [
        { id: 'flex_freelance', label: 'Freelance', Icon: PiBriefcase },
        { id: 'flex_family_topups', label: 'Family Top-ups', Icon: PiUsers },
        { id: 'flex_savings_dip', label: 'Savings Dip', Icon: PiPiggyBank },
        { id: 'flex_selling', label: 'Selling', Icon: PiStorefront },
        { id: 'flex_hardship', label: 'Hardship', Icon: PiLifebuoy },
        { id: 'flex_side_projects', label: 'Side Projects', Icon: PiLaptop },
        { id: 'flex_other_income', label: 'Other', Icon: PiDotsThree },
    ].filter(s => !(activeSources.flexIncome || []).includes(s.id))
    const flexExpenseSources = [
        { id: 'flex_travel', label: 'Travel', Icon: PiAirplaneTilt },
        { id: 'flex_events', label: 'Events', Icon: PiMusicNotes },
        { id: 'flex_gifts', label: 'Gifts', Icon: PiGift },
        { id: 'flex_tech', label: 'Tech', Icon: PiDeviceMobile },
        { id: 'flex_clothing', label: 'Clothing', Icon: PiTShirt },
        { id: 'flex_health', label: 'Health', Icon: PiHeartbeat },
        { id: 'flex_course_materials', label: 'Materials', Icon: PiBookOpen },
        { id: 'flex_other_expense', label: 'Other', Icon: PiDotsThree },
    ].filter(s => !(activeSources.flexExpense || []).includes(s.id))

    useEffect(() => {
        if (!fabOpen) return
        const handler = (e) => {
            if (fabBtnRef.current && fabBtnRef.current.contains(e.target)) return
            if (fabRef.current && !fabRef.current.contains(e.target)) {
                if (pickerScrollRef.current && pickerScrollRef.current.contains(e.target)) return
                closeFab()
            }
        }
        document.addEventListener('pointerdown', handler)
        return () => document.removeEventListener('pointerdown', handler)
    }, [fabOpen])


    // Track balance popup state for FAB styling
    useEffect(() => {
        const handler = (e) => setFabBalanceActive(e.detail?.open || false)
        window.addEventListener('nav-fab-balance', handler)
        return () => window.removeEventListener('nav-fab-balance', handler)
    }, [])

    const handleAction = (action) => {
        if (action === 'update-balance') {
            // Close FAB buttons, FAB circle becomes orange currency button
            closeFab()
            dispatchAction(action)
            return
        }
        if (fabSourcePicker) {
            setPickerClosing(true)
            setFabOpen(false)
            setTimeout(() => {
                setPickerClosing(false)
                setFabSubMenu(null)
                setFabSourcePicker(null)
                dispatchAction(action)
            }, 200)
            return
        }
        closeFab()
        dispatchAction(action)
    }

    const dispatchAction = (action) => {
        if (location.pathname !== '/dashboard') {
            navigate('/dashboard')
            const onReady = () => {
                window.dispatchEvent(new CustomEvent('nav-fab-action', { detail: { action } }))
                window.removeEventListener('dashboard-ready', onReady)
            }
            window.addEventListener('dashboard-ready', onReady)
            setTimeout(() => {
                window.removeEventListener('dashboard-ready', onReady)
                window.dispatchEvent(new CustomEvent('nav-fab-action', { detail: { action } }))
            }, 500)
        } else {
            window.dispatchEvent(new CustomEvent('nav-fab-action', { detail: { action } }))
        }
    }

    const renderTab = (tab) => {
        const active = isActive(tab.path)
        const Icon = active ? tab.activeIcon : tab.icon
        return (
            <div key={tab.key} data-href={tab.path}
                onClick={() => {
                    if (active) { window.dispatchEvent(new CustomEvent('nav-tap-again')); return }
                    if (tab.path === '/support') analytics.track(MONEY_ADVICE_EVENTS.VIEWED)
                    navigate(tab.path)
                }}
                className={`nav-tab ${active ? 'active' : ''}`}
            >
                <div className="nav-icon">
                    <Icon size={24} color={active ? '#1a1a1a' : '#999'} style={{ strokeWidth: 1.6 }} />
                </div>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#1a1a1a' : 'transparent', marginTop: 3 }} />
            </div>
        )
    }

    const showSub = fabSubMenu !== null
    const isIncome = fabSubMenu === 'income'
    const isExpense = fabSubMenu === 'expense'
    const showPicker = fabSourcePicker !== null
    const mainVisible = fabOpen && !showSub && !fabClosing
    const t = '0.4s cubic-bezier(0.22, 1, 0.36, 1)'
    const tOut = '0.25s cubic-bezier(0.4, 0, 0.2, 1)'

    const isFlexPicker = fabSourcePicker === 'flex-income' || fabSourcePicker === 'flex-expense'
    const accentColor = fabSourcePicker === 'income' ? '#147b75'
        : fabSourcePicker === 'flex-income' ? '#1a9e97'
            : fabSourcePicker === 'expense' ? '#d4566a'
                : fabSourcePicker === 'flex-expense' ? '#e8838e'
                    : '#147b75'
    const sources = fabSourcePicker === 'income' ? incomeSources
        : fabSourcePicker === 'expense' ? expenseSources
            : fabSourcePicker === 'flex-income' ? flexIncomeSources
                : fabSourcePicker === 'flex-expense' ? flexExpenseSources
                    : []

    // Helper for consistent button style

    const fabBtn = (visible, transformIn, transformOut, delay, onClick, bg, icon, label, shadow, customTransition) => (
        <div onClick={onClick} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            opacity: visible ? 1 : 0,
            transform: visible ? transformIn : transformOut,
            transition: customTransition || (visible
                ? `opacity 0.4s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${delay}`
                : `all ${tOut}`),
            pointerEvents: visible ? 'auto' : 'none',
            cursor: 'pointer',
            position: 'absolute',
            visibility: visible ? 'visible' : 'hidden',
            transitionProperty: 'opacity, transform',
        }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadow || 'none' }}>
                {icon}
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#333', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{label}</span>
        </div>
    )

    return (
        <>
            {fabOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={(e) => {
                // Don't dismiss if tapping in the picker area
                if (pickerScrollRef.current && pickerScrollRef.current.contains(e.target)) return
                closeFab()
            }} />}

            <div ref={fabRef} style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
                pointerEvents: fabOpen ? 'auto' : 'none',
                padding: `30px 0 calc(90px + env(safe-area-inset-bottom, 0px))`,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                width: '100%', boxSizing: 'border-box',
                overflow: 'visible',
            }}>

                {/* Gradient background */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 25%, rgba(255,255,255,1) 45%)',
                    opacity: (fabOpen && !fabClosing) ? 1 : 0,
                    transition: (fabOpen && !fabClosing) ? 'opacity 0.25s ease' : 'opacity 0.25s ease',
                    pointerEvents: 'none',
                }} />

                {/* L3: Source picker — single scrollable row with BACK first */}

                {/* L1 + L2 buttons (hidden when L3 picker is showing) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end', justifyContent: showSub ? 'center' : 'space-between',
                    gap: showSub ? 0 : 0,
                    width: '100%', maxWidth: 400, padding: '0 30px',
                    position: 'relative',
                    opacity: showPicker ? 0 : 1,
                    transform: showPicker ? 'translateY(15px)' : 'translateY(0)',
                    transition: showPicker
                        ? 'opacity 0.15s ease, transform 0.15s ease'
                        : 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                    pointerEvents: fabOpen && !showPicker ? 'auto' : 'none',
                }}>

                    {/* LEFT SLOT */}
                    <div style={{ width: 110, height: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', position: 'relative', flexShrink: 0 }}>
                        {fabBtn(mainVisible, 'translateY(0) scale(1)', showSub ? 'translateY(8px) scale(0.5)' : 'translateY(30px) scale(0.4)', '0s',
                            () => { if (mainVisible) setFabSubMenu('expense') },
                            '#e06470', <TrendingDown size={24} color="#fff" strokeWidth={2.2} />, 'ADD EXPENSE',
                            '0 4px 16px rgba(224,100,112,0.35), 0 -8px 40px 10px rgba(246,246,246,0.95)',
                            mainVisible && !fabOpen ? `all ${tOut}` : (mainVisible ? `opacity 0.25s ease, transform 0.25s ease` : undefined)
                        )}
                        {/* Expense: REGULAR on left */}
                        {fabBtn(isExpense && !fabClosing, 'translateX(0) scale(1)', fabClosing ? 'translateY(30px) scale(0.4)' : 'translateY(0) scale(0.85)', '0s',
                            () => setFabSourcePicker('expense'),
                            '#d4566a', <PiCalendarBlank size={22} color="#fff" />, 'REGULAR',
                            '0 4px 16px rgba(212,86,106,0.35)',
                            (isExpense && !fabClosing) ? `opacity 0.25s ease, transform 0.25s ease` : `opacity 0.2s ease, transform 0.2s ease`
                        )}
                        {/* Income: REGULAR on left */}
                        {fabBtn(isIncome && !fabClosing, 'translateX(0) scale(1)', fabClosing ? 'translateY(30px) scale(0.4)' : 'translateY(0) scale(0.85)', '0s',
                            () => setFabSourcePicker('income'),
                            '#147b75', <PiCalendarBlank size={22} color="#fff" />, 'REGULAR',
                            '0 4px 16px rgba(20,123,117,0.35)',
                            (isIncome && !fabClosing) ? `opacity 0.25s ease, transform 0.25s ease` : `opacity 0.2s ease, transform 0.2s ease`
                        )}
                    </div>

                    {/* CENTER SLOT — collapses when in sub-menu */}
                    <div style={{ width: showSub ? 0 : 110, height: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', position: 'relative', flexShrink: 0, overflow: 'visible', transition: 'width 0.2s ease' }}>
                        {fabBtn(mainVisible, 'translateY(0) scale(1)', showSub ? 'translateY(8px) scale(0.5)' : 'translateY(30px) scale(0.4)', '0s',
                            () => { if (mainVisible) handleAction('update-balance') },
                            '#EC8C17',
                            <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>{getCurrencySymbol()}</span>,
                            'UPDATE BALANCE',
                            '0 4px 16px rgba(236,140,23,0.35), 0 -8px 40px 10px rgba(246,246,246,0.95)',
                            mainVisible && !fabOpen ? `all ${tOut}` : (mainVisible ? `opacity 0.25s ease, transform 0.25s ease` : undefined)
                        )}
                    </div>

                    {/* RIGHT SLOT */}
                    <div style={{ width: 110, height: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', position: 'relative', flexShrink: 0 }}>
                        {fabBtn(mainVisible, 'translateY(0) scale(1)', showSub ? 'translateY(8px) scale(0.5)' : 'translateY(30px) scale(0.4)', '0s',
                            () => { if (mainVisible) setFabSubMenu('income') },
                            '#147b75', <TrendingUp size={24} color="#fff" strokeWidth={2.2} />, 'ADD INCOME',
                            '0 4px 16px rgba(20,123,117,0.35), 0 -8px 40px 10px rgba(246,246,246,0.95)',
                            mainVisible && !fabOpen ? `all ${tOut}` : (mainVisible ? `opacity 0.25s ease, transform 0.25s ease` : undefined)
                        )}
                        {/* Expense: FLEXIBLE on right */}
                        {fabBtn(isExpense && !fabClosing, 'translateX(0) scale(1)', fabClosing ? 'translateY(30px) scale(0.4)' : 'translateY(0) scale(0.85)', '0s',
                            () => setFabSourcePicker('flex-expense'),
                            '#e8838e', <PiShuffle size={22} color="#fff" />, 'FLEXIBLE',
                            '0 4px 16px rgba(232,131,142,0.35)',
                            (isExpense && !fabClosing) ? `opacity 0.25s ease, transform 0.25s ease` : `opacity 0.2s ease, transform 0.2s ease`
                        )}
                        {/* Income: FLEXIBLE on right */}
                        {fabBtn(isIncome && !fabClosing, 'translateX(0) scale(1)', fabClosing ? 'translateY(30px) scale(0.4)' : 'translateY(0) scale(0.85)', '0s',
                            () => setFabSourcePicker('flex-income'),
                            '#1a9e97', <PiShuffle size={22} color="#fff" />, 'FLEXIBLE',
                            '0 4px 16px rgba(26,158,151,0.35)',
                            (isIncome && !fabClosing) ? `opacity 0.25s ease, transform 0.25s ease` : `opacity 0.2s ease, transform 0.2s ease`
                        )}
                    </div>
                </div>
            </div>

            {/* L3: Source picker — scrollable row above nav */}
            <div
                ref={pickerScrollRef}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'fixed',
                    bottom: `calc(78px + env(safe-area-inset-bottom, 0px))`,
                    left: 0, right: 0,
                    zIndex: 1003,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    padding: '12px 20px',
                    pointerEvents: (showPicker && !pickerClosing && !fabClosing) ? 'auto' : 'none',
                    overflow: 'visible',
                    opacity: (showPicker && !pickerClosing && !fabClosing) ? 1 : 0,
                    transform: (showPicker && !pickerClosing && !fabClosing) ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.4)',
                    transition: (showPicker && !pickerClosing && !fabClosing)
                        ? 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        : `all ${tOut}`,
                }}
            >
                {/* Scrollable source list */}
                <div
                    ref={pickerInnerRef}
                    style={{
                        flex: 1, minWidth: 0,
                        overflow: 'visible',
                        padding: '20px 0',
                        margin: '-20px 0',
                        maskImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 0%, black 8%, black 92%, rgba(0,0,0,0.05) 100%)',
                        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 0%, black 8%, black 92%, rgba(0,0,0,0.05) 100%)',
                        maskSize: '100% 300%',
                        WebkitMaskSize: '100% 300%',
                        maskPosition: 'center',
                        WebkitMaskPosition: 'center',
                    }}
                >
                    <div style={{
                        display: 'flex', alignItems: 'flex-end',
                        gap: 12,
                        ...(sources.length > 4 ? {
                            transform: `translateX(${pickerOffset}px)`,
                            width: 'max-content',
                        } : {
                            justifyContent: 'center',
                            width: '100%',
                        }),
                    }}>
                        {showPicker && (sources.length > 4 ? [...sources, ...sources, ...sources] : sources).map((src, i) => (
                            <div key={`${src.id}-${i}`}
                                onClick={(e) => {
                                    const el = e.currentTarget
                                    el.style.transition = 'transform 0.15s ease, opacity 0.15s ease'
                                    el.style.transform = 'scale(0.85)'
                                    el.style.opacity = '0.6'
                                    setTimeout(() => {
                                        el.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease'
                                        el.style.transform = 'scale(1.1)'
                                        el.style.opacity = '0'
                                        setTimeout(() => {
                                            handleAction(isFlexPicker ? `add-flex:${src.id}:${fabSourcePicker === 'flex-income' ? 'income' : 'expense'}` : `add-source:${src.id}:${fabSourcePicker}`)
                                        }, 150)
                                    }, 120)
                                }}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    opacity: 0,
                                    animation: `fabSourceIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.04 + (i % sources.length) * 0.03}s forwards`,
                                }}
                            >
                                <div style={{
                                    width: 60, height: 60, borderRadius: '50%',
                                    background: accentColor,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: `0 4px 12px ${accentColor}35`,
                                    transition: 'transform 0.15s ease',
                                }}>
                                    <src.Icon size={22} color="#fff" />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#333', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{src.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bottom-nav-container">
                <div className="bottom-nav-pill">
                    {leftTabs.map(renderTab)}
                    <div ref={fabBtnRef} className="nav-fab-wrapper"
                        onClick={() => {
                            if (fabBalanceActive) {
                                // Close the balance popup
                                window.dispatchEvent(new CustomEvent('nav-fab-close-balance'))
                                return
                            }
                            if (!fabOpen) {
                                if (location.pathname !== '/dashboard') navigate('/dashboard')
                                setFabSubMenu(null); setFabSourcePicker(null); setFabOpen(true)
                            } else if (showPicker) {
                                setFabSourcePicker(null)
                            } else if (showSub) {
                                setFabSubMenu(null)
                            } else {
                                closeFab()
                            }
                        }}
                    >
                        <div className={`nav-fab ${(fabOpen && !fabClosing) ? 'open' : ''}`} style={{
                            position: 'relative',
                            ...(fabBalanceActive ? { background: '#EC8C17', boxShadow: '0 0 0 4px rgba(236,140,23,0.2)', transform: 'none' } : {}),
                            transition: 'background 0.35s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease',
                        }}>
                            {/* Currency symbol for balance mode */}
                            <span style={{
                                position: 'absolute',
                                fontSize: 22, fontWeight: 800, color: '#fff',
                                fontFamily: 'Nunito, sans-serif', lineHeight: 1,
                                opacity: fabBalanceActive ? 1 : 0,
                                transform: fabBalanceActive ? 'scale(1)' : 'scale(0)',
                                transition: 'opacity 0.25s ease, transform 0.25s ease',
                            }}>{getCurrencySymbol()}</span>
                            <PiArrowLeftBold size={26} color="#555" style={{
                                position: 'absolute',
                                opacity: (showPicker || showSub) && !fabClosing && !fabBalanceActive ? 1 : 0,
                                transform: (showPicker || showSub) && !fabClosing && !fabBalanceActive ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                                transition: (showPicker || showSub) && !fabClosing
                                    ? 'opacity 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                    : 'opacity 0.15s ease, transform 0.2s ease',
                            }} />
                            <Plus size={26} color={(fabOpen && !fabClosing) ? '#555' : '#fff'} strokeWidth={2.5} style={{
                                opacity: fabBalanceActive ? 0 : ((showPicker || showSub) && !fabClosing ? 0 : 1),
                                transform: fabBalanceActive ? 'scale(0)' : ((showPicker || showSub) && !fabClosing ? 'rotate(-90deg) scale(0)' : (fabOpen && !fabClosing) ? 'rotate(225deg) scale(1)' : 'rotate(0deg) scale(1)'),
                                transition: (fabOpen && !fabClosing)
                                    ? 'opacity 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.5s ease'
                                    : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s ease, opacity 0.15s ease',
                            }} />
                        </div>
                    </div>
                    {rightTabs.map(renderTab)}
                </div>
            </div>
        </>
    )
}
