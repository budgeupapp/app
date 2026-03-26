import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronRight, Check, Clock, Plus, Trash, Eye, EyeOff, AlertTriangle, TrendingUp, TrendingDown } from 'react-feather'
import { PiCalendarBlank, PiCalendarBlankFill, PiLightbulb, PiLightbulbFill, PiChartLineUp, PiTrendUp, PiTrendUpBold, PiTrendDown, PiTrendDownBold, PiShuffle, PiShuffleBold } from 'react-icons/pi'
import { useSurveySequence } from '../lib/useSurveySequence'
import TermGraph, { refreshAY, AY_START, AY_END, datePct, daysBetween, fmt } from '../components/TermGraph'
import { supabase } from '../lib/supabaseClient'
import { fetchUserData, saveCashflowForecast, saveUserFinances, saveTermDates, saveBalanceHistory } from '../lib/api'
import { getCurrencySymbol, getGraphStart, setGraphStart } from '../lib/settings'
import { toLocalDate } from '../lib/helpers'
import { analytics, DASHBOARD_EVENTS, SCREEN_EVENTS, getBalanceRange } from '../lib/analytics/index.js'
import {
    INITIAL_FORM_DATA,
    DEFAULT_LOAN_MONTHS,
    MONTH_LABELS,
    hasCustomTermDates,
    getTermDatesForUniversity,
} from '../config/onboardingConfig'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_MAP, SOURCE_ICONS as CATEGORY_SOURCE_ICONS } from '../config/categories'
import { buildGraphEvents } from '../lib/graphEvents'
import { calcEntryTotal } from '../lib/calcEntryTotal'
import { parseMoney, formatDisplay } from '../lib/moneyUtils'
import { STORAGE_KEY } from '../lib/constants'
import CategoryStep from './CategoryStep'
import WeeklySpendStep from './WeeklySpendStep'

// Icons from onboarding (kept for flex sources)
import { PiGraduationCap, PiHandCoins, PiUsers, PiBriefcase, PiDotsThree, PiHouse, PiLightningFill, PiBank, PiPiggyBank, PiRepeat, PiIdentificationCard, PiAirplaneTilt, PiMusicNotes, PiGift, PiDeviceMobile, PiTShirt, PiHeartbeat, PiBookOpen, PiStorefront, PiLifebuoy, PiLaptop } from 'react-icons/pi'

// Phosphor icon components + colors for each source (used in FAB + SourceRow)
export const SOURCE_ICONS = {
    ...CATEGORY_SOURCE_ICONS,
    // Flex income
    flex_freelance: { Icon: PiBriefcase, color: '#5a7c4f' },
    flex_family_topups: { Icon: PiUsers, color: '#3b82a0' },
    flex_savings_dip: { Icon: PiPiggyBank, color: '#1a9e97' },
    flex_selling: { Icon: PiStorefront, color: '#7c6f4f' },
    flex_hardship: { Icon: PiLifebuoy, color: '#c0392b' },
    flex_side_projects: { Icon: PiLaptop, color: '#6366f1' },
    flex_other_income: { Icon: PiDotsThree, color: '#888' },
    // Flex expense
    flex_travel: { Icon: PiAirplaneTilt, color: '#e06470' },
    flex_subscriptions: { Icon: PiRepeat, color: '#cf5c68' },
    flex_memberships: { Icon: PiIdentificationCard, color: '#e06470' },
    flex_events: { Icon: PiMusicNotes, color: '#d4566a' },
    flex_gifts: { Icon: PiGift, color: '#e8838e' },
    flex_tech: { Icon: PiDeviceMobile, color: '#8b5cf6' },
    flex_clothing: { Icon: PiTShirt, color: '#d4566a' },
    flex_health: { Icon: PiHeartbeat, color: '#e06470' },
    flex_course_materials: { Icon: PiBookOpen, color: '#c0392b' },
    flex_other_expense: { Icon: PiDotsThree, color: '#888' },
}

/* ---------- SOURCE CONFIGS ---------- */

const FIXED_INCOME_SOURCES = INCOME_CATEGORIES.map(cat => ({
    id: cat.id, label: cat.label, panelId: cat.panelId, onboarding: true,
}))

const FIXED_EXPENSE_SOURCES = EXPENSE_CATEGORIES.map(cat => ({
    id: cat.id, label: cat.label, panelId: cat.panelId, onboarding: true,
}))

const FLEX_INCOME_SOURCES = [
    { id: 'flex_freelance', label: 'Freelance / Gig Work', defaultFreq: 'monthly' },
    { id: 'flex_family_topups', label: 'Family Top-ups', defaultFreq: 'monthly' },
    { id: 'flex_savings_dip', label: 'Dip into Savings', defaultFreq: 'one-off' },
    { id: 'flex_selling', label: 'Selling Items', defaultFreq: 'one-off' },
    { id: 'flex_hardship', label: 'Hardship Fund', defaultFreq: 'one-off' },
    { id: 'flex_side_projects', label: 'Side Projects', defaultFreq: 'monthly' },
    { id: 'flex_other_income', label: 'Other Income', defaultFreq: 'monthly' },
]

const FLEX_EXPENSE_SOURCES = [
    { id: 'flex_travel', label: 'Travel & Holidays', defaultFreq: 'one-off' },
    { id: 'flex_events', label: 'Events & Nights Out', defaultFreq: 'one-off' },
    { id: 'flex_gifts', label: 'Gifts', defaultFreq: 'one-off' },
    { id: 'flex_tech', label: 'Tech & Gadgets', defaultFreq: 'one-off' },
    { id: 'flex_clothing', label: 'Clothing', defaultFreq: 'one-off' },
    { id: 'flex_health', label: 'Health & Wellbeing', defaultFreq: 'one-off' },
    { id: 'flex_course_materials', label: 'Course Materials', defaultFreq: 'one-off' },
    { id: 'flex_other_expense', label: 'Other Expense', defaultFreq: 'monthly' },
]

/* ---------- GRAPH EVENT HELPERS ---------- */

function buildDashboardGraphEvents(formData, { filterByGraphStart = true } = {}) {
    return buildGraphEvents(formData, {
        filterByGraphStart,
        includeFlexSources: true,
        splitOneOffEditType: true,
        flexIncomeSources: FLEX_INCOME_SOURCES,
        flexExpenseSources: FLEX_EXPENSE_SOURCES,
    })
}

/* ---------- YEARLY TOTAL HELPER ---------- */

function calcYearlyTotal(events, type) {
    return events.filter(e => e.type === type && !e.removed && !e.noDot).reduce((sum, e) => sum + e.amount, 0)
}

/* ---------- MONEY FORMAT ---------- */

function fmtAmount(val) {
    const sym = getCurrencySymbol()
    if (val >= 1000) { const k = val / 1000; const dec = Math.round(k * 10) % 10; return `${sym}${k.toFixed(dec === 0 ? 0 : 1)}k` }
    return `${sym}${Math.round(val).toLocaleString()}`
}

/* ---------- ICONS ---------- */

function ArrowUpCircle({ color = '#147b75' }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
            <path d="M12 16V8M12 8L8 12M12 8L16 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function ArrowDownCircle({ color = '#e06470' }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
            <path d="M12 8V16M12 16L16 12M12 16L8 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function RefreshIcon({ size = 12 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M1 4v6h6M23 20v-6h-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ---------- TOGGLE SWITCH ---------- */

function ToggleSwitch({ on, onChange, size = 'normal', activeColor = '#147b75' }) {
    const w = size === 'tiny' ? 24 : size === 'small' ? 36 : 44
    const h = size === 'tiny' ? 12 : size === 'small' ? 20 : 24
    const thumb = size === 'tiny' ? 9 : size === 'small' ? 16 : 20
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onChange(!on) }}
            style={{
                width: w, height: h, borderRadius: h / 2,
                background: on ? activeColor : '#e0e0e0',
                border: 'none', cursor: 'pointer', padding: 0,
                position: 'relative', flexShrink: 0,
                transition: 'background 0.2s ease',
            }}
        >
            <div style={{
                width: thumb, height: thumb, borderRadius: thumb / 2,
                background: '#fff',
                position: 'absolute', top: (h - thumb) / 2,
                left: on ? w - thumb - 2 : 2,
                transition: 'left 0.2s ease',
            }} />
        </button>
    )
}

/* ---------- BALANCE PILL (inline editor) ---------- */

function BalancePill({ value, onSave, scrollContainerRef }) {
    const [expanded, setExpanded] = useState(false)
    const [raw, setRaw] = useState('')
    const [isNegative, setIsNegative] = useState(false)
    const inputRef = useRef(null)
    const containerRef = useRef(null)
    const sym = getCurrencySymbol()
    const balanceNum = parseMoney(value)
    const hasBalance = value != null && value !== '' && value !== '0' && balanceNum !== 0

    const [pillRect, setPillRect] = useState(null)
    const handleOpen = () => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        setIsNegative(n < 0)
        setRaw(isNaN(n) ? '' : new Intl.NumberFormat('en-GB').format(Math.abs(n)))
        // Capture pill position before expanding so we can render fixed overlay
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) setPillRect({ top: rect.top, left: rect.left })
        setExpanded(true)
    }

    const handleConfirm = () => {
        const n = parseMoney(raw)
        onSave(String(isNegative ? -Math.abs(n) : Math.abs(n)))
        setExpanded(false)
    }

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parts.length === 2 && parts[1].length > 2) {
            val = parts[0] + '.' + parts[1].slice(0, 2)
        }
        const [int, dec] = val.split('.')
        const formattedInt = int
            ? new Intl.NumberFormat('en-GB').format(Number(int))
            : ''
        setRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
    }

    const handleStep = (dir) => {
        const n = parseMoney(raw)
        const stepped = Math.max(0, Math.round((n + dir * 10) * 100) / 100)
        setRaw(new Intl.NumberFormat('en-GB').format(stepped))
    }

    useEffect(() => {
        if (!expanded) return
        const onPointerDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setExpanded(false)
            }
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [expanded])

    const H = 39 // matches right column: 18 + 3 gap + 18
    const W = 160
    const ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
    const dur = '0.2s'

    return (
        <div ref={containerRef} onTouchEnd={e => e.stopPropagation()} style={{ flexShrink: 0, height: H, position: 'relative', width: W }}>
            {/* Default view pill */}
            <button
                onClick={!expanded ? handleOpen : undefined}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: H,
                    borderRadius: 14,
                    border: 'none',
                    background: '#f1a950',
                    padding: '0 14px 0 16px',
                    cursor: 'pointer',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,

                    whiteSpace: 'nowrap',
                    lineHeight: 0,

                    boxShadow: '0 3px 6px rgba(236,140,23,0.3)',

                    opacity: expanded ? 0 : 1,
                    transform: expanded ? 'scale(0.94)' : 'scale(1)',
                    transition: `opacity ${dur} ${ease}, transform ${dur} ${ease}`,
                    pointerEvents: expanded ? 'none' : 'auto',
                }}
            >
                <span
                    style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#fff',
                        fontFamily: 'Nunito, sans-serif',
                        lineHeight: '14px',
                        display: 'block'
                    }}
                >
                    {balanceNum < 0 ? '\u2212' : ''}
                    {sym}
                    {Math.abs(balanceNum).toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </span>

                <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        display: 'block',
                        transform: 'translateZ(0)'
                    }}
                >
                    <path d="M23 4v5h-5" />
                    <path d="M1 20v-5h5" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 9" />
                    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 15" />
                    <line x1="12" y1="9" x2="12" y2="15" strokeWidth="2" />
                    <line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" />
                </svg>
            </button>
            {/* Edit view — rendered as fixed overlay to avoid iOS scroll glitch */}
            {expanded && pillRect && (
                <>
                    <div onClick={() => setExpanded(false)} style={{ position: 'fixed', inset: 0, zIndex: 1099 }} />
                    <div style={{
                        position: 'fixed',
                        top: pillRect.top,
                        left: pillRect.left,
                        width: W, height: H,
                        overflow: 'hidden', boxSizing: 'border-box',
                        display: 'flex', alignItems: 'center',
                        background: '#f0f0f0', borderRadius: 14,
                        zIndex: 1100,
                        animation: `balanceEditIn ${dur} ${ease}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px 0 6px' }}>
                            <button
                                onClick={() => setIsNegative(n => !n)}
                                style={{
                                    width: 20, height: 20, borderRadius: 5,
                                    cursor: 'pointer', background: '#e2e2e2',
                                    border: 'none', position: 'relative'
                                }}
                            >
                                {isNegative ? (
                                    <svg width="10" height="2" viewBox="0 0 10 2" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                        <rect width="10" height="2" rx="1" fill="#e06470" />
                                    </svg>
                                ) : (
                                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                        <rect x="4" width="2" height="10" rx="1" fill="#147B75" />
                                        <rect y="4" width="10" height="2" rx="1" fill="#147B75" />
                                    </svg>
                                )}
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#666', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                            <input
                                ref={(el) => {
                                    inputRef.current = el
                                    if (el) {
                                        const sc = scrollContainerRef?.current
                                        const scrollBefore = sc ? sc.scrollTop : 0
                                        el.focus({ preventScroll: true })
                                        if (sc) {
                                            const pin = () => { sc.scrollTop = scrollBefore }
                                            pin()
                                            requestAnimationFrame(pin)
                                            setTimeout(pin, 50)
                                            setTimeout(pin, 150)
                                            setTimeout(pin, 300)
                                        }
                                    }
                                }}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                step="any"
                                value={raw}
                                onChange={handleChange}
                                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                                style={{
                                    width: 55, border: 'none', background: 'transparent',
                                    fontSize: 16, fontWeight: 700,
                                    color: '#1a1a1a', fontFamily: 'Nunito, sans-serif', outline: 'none', padding: 0,
                                    MozAppearance: 'textfield', WebkitAppearance: 'none',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 2 }}>
                            <button onClick={() => handleStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 24, height: 16, position: 'relative' }}>
                                <ChevronUp size={12} strokeWidth={2} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                            </button>
                            <button onClick={() => handleStep(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 24, height: 16, position: 'relative' }}>
                                <ChevronDown size={12} strokeWidth={2} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                            </button>
                        </div>
                        <button
                            onClick={handleConfirm}
                            style={{
                                background: '#f1a950', border: 'none', cursor: 'pointer',
                                borderRadius: 8, width: 26, height: 26,
                                flexShrink: 0, position: 'relative'
                            }}
                        >
                            <Check size={14} strokeWidth={2.5} color="#fff" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

function BalancePillInline({ value, sym, onSave, onCancel, compact }) {
    const [raw, setRaw] = useState(() => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        return isNaN(n) ? '' : new Intl.NumberFormat('en-GB').format(Math.abs(n))
    })
    const [isNegative, setIsNegative] = useState(value < 0)
    const inputRef = useRef(null)

    useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
        const [int, dec] = val.split('.')
        const formattedInt = int ? new Intl.NumberFormat('en-GB').format(Number(int)) : ''
        setRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
    }

    const handleConfirm = () => {
        const n = parseMoney(raw)
        onSave(String(isNegative ? -Math.abs(n) : Math.abs(n)))
    }

    const sz = compact ? 28 : 40

    return (
        <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'stretch', gap: compact ? 10 : 0 }}>
            {/* Number input row */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: compact ? '4px 0' : '8px 0 24px', gap: compact ? 6 : 10,
                flex: compact ? 1 : undefined,
            }}>
                <button
                    onClick={() => setIsNegative(n => !n)}
                    style={{
                        width: compact ? 24 : 28, height: compact ? 34 : 44, borderRadius: compact ? 6 : 8,
                        cursor: 'pointer', background: isNegative ? '#e06470' : '#147b75',
                        border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: compact ? 18 : 22, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        flexShrink: 0, transition: 'background 0.2s ease',
                    }}
                >
                    {isNegative ? '\u2212' : '+'}
                </button>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{
                        fontSize: sz, fontWeight: 800, color: '#1a1a1a',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{sym}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="decimal"
                        value={raw}
                        onChange={handleChange}
                        onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                        style={{
                            border: 'none', background: 'transparent',
                            fontSize: sz, fontWeight: 800, color: '#1a1a1a',
                            fontFamily: 'Nunito, sans-serif', outline: 'none', padding: 0,
                            width: Math.max(compact ? 50 : 80, (raw || '0.00').length * (compact ? 16 : 26)),
                            textAlign: 'left',
                        }}
                        placeholder="0.00"
                    />
                </div>
            </div>

            {/* Save button */}
            <button
                onClick={handleConfirm}
                style={{
                    width: compact ? 40 : '100%', height: compact ? 40 : 48,
                    borderRadius: compact ? 12 : 14,
                    border: 'none', background: '#f1a950',
                    fontSize: compact ? 14 : 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                    color: '#fff', cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {compact ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12L10 17L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                ) : 'Save'}
            </button>
        </div>
    )
}

/* ---------- FLEX ROW (mirrors SourceRow expand behavior) ---------- */

function FlexRow({ srcId, label, amt, frequency, si, isExpense, expanded, onExpandToggle, onDelete, onToggleVisibility, active = true, removedCount = 0, onRestoreRemoved, overrideCount = 0, onClearOverrides, scrollContainerRef, children }) {
    const innerRef = useRef(null)
    const [measuredHeight, setMeasuredHeight] = useState(0)
    const [deleting, setDeleting] = useState(false)
    const [settled, setSettled] = useState(!!expanded)

    useEffect(() => {
        if (expanded) {
            const t = setTimeout(() => setSettled(true), 750)
            return () => clearTimeout(t)
        } else {
            setSettled(false)
        }
    }, [expanded])

    useLayoutEffect(() => {
        if (expanded && innerRef.current) {
            setMeasuredHeight(innerRef.current.scrollHeight)
        }
    }, [expanded, children])

    useEffect(() => {
        if (!expanded || !innerRef.current) return
        const ro = new ResizeObserver(() => {
            if (innerRef.current) setMeasuredHeight(innerRef.current.scrollHeight)
        })
        ro.observe(innerRef.current)
        return () => ro.disconnect()
    }, [expanded])

    const color = isExpense ? '#e06470' : '#147b75'

    const handleDelete = () => {
        if (deleting) return
        setDeleting(true)
        setTimeout(() => onDelete(), 500)
    }

    return (
        <div data-source-row data-source-id={srcId} style={{
            borderRadius: 14, background: !active ? '#f5f5f5' : '#fff', overflow: 'hidden',
            maxHeight: deleting ? 0 : 1000,
            opacity: deleting ? 0 : !active ? 0.55 : 1,
            marginBottom: deleting ? -2 : 8,
            boxShadow: expanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.04)',
            transform: deleting ? 'translateX(-40px) scale(0.97)' : 'translateX(0) scale(1)',
            transition: deleting
                ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.1s, opacity 0.25s ease, margin-bottom 0.4s ease 0.1s, transform 0.3s ease'
                : 'opacity 0.3s ease, background 0.3s ease, box-shadow 0.3s ease',
        }}>
            <div onClick={onExpandToggle} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 12, cursor: 'pointer' }}>
                {si && (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <si.Icon size={20} color={color} />
                    </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', display: 'block' }}>{label}</span>
                    {amt > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                            {isExpense ? '\u2212' : '+'}{getCurrencySymbol()}{amt.toLocaleString()}
                            {frequency && frequency !== 'one-off' ? `/${frequency === 'weekly' ? 'wk' : frequency === 'fortnightly' ? '2wk' : frequency === 'monthly' ? 'mo' : frequency === 'termly' ? 'term' : 'yr'}` : ''}
                        </span>
                    )}
                    <div style={{
                        display: 'flex', gap: 4, marginTop: (removedCount > 0 || overrideCount > 0) ? 2 : 0,
                        flexWrap: 'wrap', alignItems: 'center',
                        maxHeight: (removedCount > 0 || overrideCount > 0) ? 20 : 0,
                        opacity: (removedCount > 0 || overrideCount > 0) ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease',
                    }}>
                        {removedCount > 0 && (
                            <span
                                onClick={(e) => { e.stopPropagation(); onRestoreRemoved?.() }}
                                style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470', background: 'rgba(224,100,112,0.1)', padding: '1px 6px', borderRadius: 6, cursor: 'pointer', display: 'inline-block' }}
                            >
                                {removedCount} skipped
                            </span>
                        )}
                        {overrideCount > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 6px', borderRadius: 6, display: 'inline-block' }}>
                                {overrideCount} edited
                            </span>
                        )}
                    </div>
                </div>
                {onToggleVisibility && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleVisibility() }} style={{
                        background: 'none', border: 'none', padding: '4px 8px 4px 4px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0, marginRight: -4,
                    }}>
                        <div style={{
                            transition: 'transform 0.2s ease, opacity 0.2s ease',
                            transform: active ? 'scale(1)' : 'scale(0.85)',
                            opacity: active ? 1 : 0.5,
                            display: 'flex', alignItems: 'center',
                        }}>
                            {active
                                ? <Eye size={16} strokeWidth={1.8} color={isExpense ? '#e06470' : '#147b75'} />
                                : <EyeOff size={16} strokeWidth={1.8} color="#999" />
                            }
                        </div>
                    </button>
                )}
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(.25,1,.5,1)' }}><path d="M7 4.5L12 9L7 13.5" stroke={isExpense ? '#bbb' : '#999'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{
                maxHeight: expanded ? (settled ? 'none' : (measuredHeight + 20) || 800) : 0,
                opacity: expanded ? 1 : 0,
                overflow: settled ? 'visible' : 'hidden',
                transition: (expanded && !settled)
                    ? 'max-height 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease'
                    : !expanded
                        ? 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease'
                        : 'none',
            }}>
                <div ref={innerRef}>
                    <div style={{ borderTop: '1px solid #eee', padding: '8px 14px 4px', background: '#fafafa' }}>
                        {children}
                        <div style={{ padding: '10px 0 6px', textAlign: 'center', background: '#fafafa' }}>
                            <span onClick={handleDelete} style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470', cursor: 'pointer' }}>Delete {label.toLowerCase()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ---------- INCOME/EXPENSE ROW ---------- */

function SourceRow({ source, active, yearlyAmount, removedCount, onRestoreRemoved, overrideCount = 0, onClearOverrides, isExpense, expanded, onToggle, onExpandToggle, onDelete, scrollContainerRef, isTabSwitchingRef, formData, updateField, entryCount = 1, children }) {
    const isInactive = !active
    const rowRef = useRef(null)
    const innerRef = useRef(null)
    const [measuredHeight, setMeasuredHeight] = useState(0)
    const [settled, setSettled] = useState(!!expanded)
    const mountExpandedRef = useRef(!!expanded)
    const [deleting, setDeleting] = useState(false)
    const [naturalHeight, setNaturalHeight] = useState(null)
    const [amountFlash, setAmountFlash] = useState(false)
    const prevAmountRef = useRef(yearlyAmount)
    useEffect(() => {
        if (prevAmountRef.current !== yearlyAmount && prevAmountRef.current !== 0) {
            setAmountFlash(true)
            const t = setTimeout(() => setAmountFlash(false), 400)
            prevAmountRef.current = yearlyAmount
            return () => clearTimeout(t)
        }
        prevAmountRef.current = yearlyAmount
    }, [yearlyAmount])

    // Measure actual content height — useLayoutEffect to avoid flash
    useLayoutEffect(() => {
        if (expanded && innerRef.current) {
            setMeasuredHeight(innerRef.current.scrollHeight)
        }
    }, [expanded, children])

    // Mark as settled after expand animation completes, reset on collapse
    // Skip animation if mounted already expanded (e.g. tab switch restore)
    useLayoutEffect(() => {
        if (expanded) {
            if (mountExpandedRef.current) {
                mountExpandedRef.current = false
                setSettled(true)
                return
            }
            const timer = setTimeout(() => setSettled(true), 750)
            return () => clearTimeout(timer)
        } else {
            mountExpandedRef.current = false
            setSettled(false)
        }
    }, [expanded])

    // Keep measured height updated if content resizes while expanded
    useEffect(() => {
        if (!expanded || !innerRef.current) return
        const ro = new ResizeObserver(() => {
            if (innerRef.current) setMeasuredHeight(innerRef.current.scrollHeight)
        })
        ro.observe(innerRef.current)
        return () => ro.disconnect()
    }, [expanded])



    return (
        <div ref={rowRef} data-source-row data-source-id={source.id} style={{
            borderRadius: 14,
            background: isInactive ? '#f0f0f0' : '#fff',
            overflow: 'hidden',
            maxHeight: deleting ? 0 : naturalHeight != null ? naturalHeight : 5000,
            opacity: deleting ? 0 : isInactive ? 0.55 : 1,
            marginBottom: deleting ? 0 : 12,
            boxShadow: expanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.04)',
            filter: isInactive ? 'grayscale(0.6)' : 'none',
            transition: deleting
                ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.25s ease, margin-bottom 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)'
                : 'opacity 0.25s ease, background 0.25s ease, box-shadow 0.3s ease, filter 0.25s ease',
        }}>
            {/* Tappable row */}
            <div
                onClick={onExpandToggle}
                style={{
                    display: 'flex', alignItems: 'center',
                    padding: '10px 14px',
                    gap: 12,
                    cursor: 'pointer',
                }}
            >
                {/* Icon */}
                {(() => {
                    const si = SOURCE_ICONS[source.id] || SOURCE_ICONS[source.isOtherIncome ? 'other_income' : source.isOtherExpense ? 'other_expense' : '']
                    if (si) {
                        const { Icon: SrcIcon } = si
                        const iconColor = isInactive ? '#bbb' : (isExpense ? '#e06470' : '#147b75')
                        const bgColor = isInactive ? '#eee' : (isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)')
                        return (
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: bgColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <SrcIcon size={20} color={iconColor} />
                            </div>
                        )
                    }
                    return (
                        <div style={{
                            width: 36, height: 36,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, opacity: isInactive ? 0.4 : 0.8,
                        }}>
                            <img src={source.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        </div>
                    )
                })()}

                {/* Label + amount */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                        fontSize: 15, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: isInactive ? '#838383' : '#000',
                        margin: 0,
                    }}>{source.label}{entryCount > 1 && <span style={{ fontWeight: 500, color: '#999', marginLeft: 4 }}>({entryCount})</span>}</p>
                    <p style={{
                        fontSize: 11, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: isInactive ? '#bbb' : (yearlyAmount > 0 && source._visibleAmount === 0) ? '#EC8C17' : '#999',
                        margin: 0,
                    }}>
                        {!isInactive && yearlyAmount > 0 && source._visibleAmount === 0
                            ? 'Not visible — change graph start date in Settings'
                            : yearlyAmount === 0 ? `${getCurrencySymbol()}0/yr` : `${isExpense ? '\u2212' : '+'}${getCurrencySymbol()}${Math.round(yearlyAmount).toLocaleString()}/yr`
                        }
                    </p>
                    <div style={{
                        display: 'flex', gap: 4, marginTop: (removedCount > 0 || overrideCount > 0) ? 2 : 0,
                        flexWrap: 'wrap', alignItems: 'center',
                        maxHeight: (removedCount > 0 || overrideCount > 0) ? 20 : 0,
                        opacity: (removedCount > 0 || overrideCount > 0) ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease',
                    }}>
                        {removedCount > 0 && (
                            <span
                                onClick={(e) => { e.stopPropagation(); onRestoreRemoved?.() }}
                                style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470', background: 'rgba(224,100,112,0.1)', padding: '1px 6px', borderRadius: 6, cursor: 'pointer', display: 'inline-block' }}
                            >
                                {removedCount} skipped
                            </span>
                        )}
                        {overrideCount > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 6px', borderRadius: 6, display: 'inline-block' }}>
                                {overrideCount} edited
                            </span>
                        )}
                    </div>
                </div>

                {/* Eye toggle (hide/show on graph) + Chevron */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    style={{
                        background: 'none', border: 'none', padding: '4px 8px 4px 4px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0, marginRight: -4,
                    }}
                >
                    <div style={{
                        transition: 'transform 0.2s ease, opacity 0.2s ease',
                        transform: active ? 'scale(1)' : 'scale(0.85)',
                        opacity: active ? 1 : 0.5,
                        display: 'flex', alignItems: 'center',
                    }}>
                        {active
                            ? <Eye size={16} strokeWidth={1.8} color={isExpense ? '#e06470' : '#147b75'} />
                            : <EyeOff size={16} strokeWidth={1.8} color="#999" />
                        }
                    </div>
                </button>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(.25,1,.5,1)' }}><path d="M7 4.5L12 9L7 13.5" stroke={isInactive ? '#bbb' : '#aaa'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>

            {/* Expanded section — animated height */}
            <div data-expand-content style={{
                background: '#fff',
                maxHeight: expanded ? (settled ? 'none' : (measuredHeight + 20) || 800) : 0,
                opacity: expanded ? 1 : 0,
                overflow: settled ? 'visible' : 'hidden',
                transition: (expanded && !settled)
                    ? 'max-height 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease'
                    : !expanded
                        ? 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease'
                        : 'none',
            }}>
                <div ref={innerRef}>
                    {children && (
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, background: '#fff' }}>
                            {children}
                        </div>
                    )}
                    {onDelete && (
                        <div style={{ padding: '0 10px 14px', textAlign: 'center', background: '#fff' }}>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (deleting) return
                                    const rowH = rowRef.current?.offsetHeight || 0
                                    if (rowRef.current) setNaturalHeight(rowH)
                                    const sc = rowRef.current?.closest('[data-scroll-container]')
                                    const rowTop = rowRef.current?.getBoundingClientRect().top || 0
                                    const scTop = sc?.getBoundingClientRect().top || 0
                                    const isAboveViewport = rowTop < scTop + 100
                                    requestAnimationFrame(() => {
                                        setDeleting(true)
                                        onDelete()

                                    })
                                }}
                                style={{
                                    fontSize: 12, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#d4566a', cursor: 'pointer',
                                }}
                            >
                                Delete {(() => {
                                    const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
                                    const cat = allCats.find(c => c.id === source.id)
                                    const entries = cat ? (formData[cat.formKey] || []) : []
                                    const count = entries.length
                                    const name = source.label.toLowerCase()
                                    if (count > 1) {
                                        const plural = name.endsWith('y') ? name.slice(0, -1) + 'ies' : name + 's'
                                        return `${count} ${plural}`
                                    }
                                    return name
                                })()}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ---------- MIGRATE LEGACY OTHER FIELDS TO ARRAYS ---------- */

function migrateOtherFields(data) {
    const d = { ...data }
    // Migrate legacy flat other_income fields to otherIncomes array
    if (!d.otherIncomes || d.otherIncomes.length === 0) {
        if (d.otherIncomeAmount || (d.incomeSources || []).includes('other_income')) {
            const inst = {
                id: 'oi_legacy',
                amount: d.otherIncomeAmount || '',
                frequency: d.otherIncomeFrequency || 'monthly',
                amountPeriod: d.otherIncomeAmountPeriod || d.otherIncomeFrequency || 'monthly',
                label: d.otherIncomeLabel || '',
                nextDate: d.otherIncomeNextDate || null,
                termDates: d.otherIncomeTermDates || {},
                quarterlyDates: d.otherIncomeQuarterlyDates || {},
                variesByTerm: d.otherIncomeVariesByTerm || false,
                nonTermAmount: d.otherIncomeNonTermAmount || '',
            }
            d.otherIncomes = [inst]
            // Replace 'other_income' with instance id in sources
            if (d.incomeSources?.includes('other_income')) {
                d.incomeSources = d.incomeSources.map(s => s === 'other_income' ? inst.id : s)
            }
        } else {
            d.otherIncomes = []
        }
    }
    // Migrate legacy flat other_expense fields to otherExpenses array
    if (!d.otherExpenses || d.otherExpenses.length === 0) {
        if (d.otherExpenseAmount || (d.expenseSources || []).includes('other_expense')) {
            const inst = {
                id: 'oe_legacy',
                amount: d.otherExpenseAmount || '',
                frequency: d.otherExpenseFrequency || 'monthly',
                amountPeriod: d.otherExpenseAmountPeriod || d.otherExpenseFrequency || 'monthly',
                label: d.otherExpenseLabel || '',
                nextDate: d.otherExpenseNextDate || null,
                termDates: d.otherExpenseTermDates || {},
                quarterlyDates: d.otherExpenseQuarterlyDates || {},
                variesByTerm: d.otherExpenseVariesByTerm || false,
                nonTermAmount: d.otherExpenseNonTermAmount || '',
            }
            d.otherExpenses = [inst]
            // Replace 'other_expense' with instance id in sources
            if (d.expenseSources?.includes('other_expense')) {
                d.expenseSources = d.expenseSources.map(s => s === 'other_expense' ? inst.id : s)
            }
        } else {
            d.otherExpenses = []
        }
    }
    // Merge break names from university config (only fills in missing names, never changes dates)
    try {
        if (d.university && hasCustomTermDates(d.university) && d.termDates?.terms?.length) {
            const custom = getTermDatesForUniversity(d.university)
            if (custom?.terms?.length) {
                for (let ti = 0; ti < d.termDates.terms.length && ti < custom.terms.length; ti++) {
                    const breaks = d.termDates.terms[ti].breaks
                    const customBreaks = custom.terms[ti].breaks
                    if (!breaks || !customBreaks) continue
                    for (let bi = 0; bi < breaks.length; bi++) {
                        const match = customBreaks.find(cb => cb.start === breaks[bi].start && cb.end === breaks[bi].end)
                        if (match?.name && !breaks[bi].name) {
                            breaks[bi].name = match.name
                        }
                    }
                }
            }
        }
    } catch { /* ignore */ }
    return d
}

/* ---------- MAIN DASHBOARD ---------- */

export default function Dashboard() {
    const navigate = useNavigate()
    useSurveySequence()
    useEffect(() => { analytics.track(SCREEN_EVENTS.DASHBOARD_VIEWED) }, [])

    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                return migrateOtherFields({ ...INITIAL_FORM_DATA, ...parsed.formData })
            }
        } catch { /* ignore */ }
        return migrateOtherFields({ ...INITIAL_FORM_DATA })
    })

    const [userEmail, setUserEmail] = useState('')
    const [graphKey, setGraphKey] = useState(0)
    const [graphZeroDate, setGraphZeroDate] = useState(null)
    const [graphOverdraftDate, setGraphOverdraftDate] = useState(null)
    const [hiddenSources, setHiddenSources] = useState(() => {
        try {
            const saved = localStorage.getItem('budgeup_hidden_sources')
            return saved ? new Set(JSON.parse(saved)) : new Set()
        } catch { return new Set() }
    })
    const [showBalanceHistory, setShowBalanceHistory] = useState(() => localStorage.getItem('budgeup_show_balance_history') !== 'false')
    const [showIncome, setShowIncome] = useState(() => localStorage.getItem('budgeup_show_income') === 'true')
    const [showExpenses, setShowExpenses] = useState(() => localStorage.getItem('budgeup_show_expenses') === 'true')
    const [showOverdraft, setShowOverdraft] = useState(() => localStorage.getItem('budgeup_show_overdraft') !== 'false')
    const [showHolidays, setShowHolidays] = useState(() => localStorage.getItem('budgeup_show_holidays') !== 'false')
    const [showDateMarker, setShowDateMarker] = useState(() => localStorage.getItem('budgeup_show_date_marker') !== 'false')
    const [expandedSources, setExpandedSourcesRaw] = useState(() => {
        try { const s = sessionStorage.getItem('budgeup_expanded_sources'); return s ? new Set(JSON.parse(s)) : new Set() } catch { return new Set() }
    })
    const setExpandedSources = (fn) => {
        setExpandedSourcesRaw(prev => {
            const next = typeof fn === 'function' ? fn(prev) : fn
            sessionStorage.setItem('budgeup_expanded_sources', JSON.stringify([...next]))
            return next
        })
    }
    const [visibleExpandedSource, setVisibleExpandedSource] = useState(null)
    const [visibleEntryIndex, setVisibleEntryIndex] = useState(0)
    const [balanceToast, setBalanceToast] = useState(null)
    const balanceToastTimer = useRef(null)
    const [showInitialBalancePopup, setShowInitialBalancePopup] = useState(false)
    const [joinDate, setJoinDate] = useState(null)
    const [balanceBannerDismissing, setBalanceBannerDismissing] = useState(false)
    const [initialBalanceRaw, setInitialBalanceRaw] = useState('')
    const [initialBalanceNegative, setInitialBalanceNegative] = useState(false)
    const pendingExpandRef = useRef(null)

    // Toggle expanded source — multiple can be open at once
    const handleExpandToggle = useCallback((sourceId) => {
        if (pendingExpandRef.current) {
            clearTimeout(pendingExpandRef.current)
            pendingExpandRef.current = null
        }

        const wasExpanded = expandedSources.has(sourceId)

        // When collapsing, add temporary spacer to prevent scroll jump as content shrinks
        if (wasExpanded) {
            isAnimatingRef.current = true
            if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
            const el = scrollRef.current
            if (el) {
                const graphExpanded = el.scrollTop < SHRINK_DIST - 1
                if (graphExpanded) {
                    // Graph is expanded — just let the row collapse, no scroll needed
                    setTimeout(() => { isAnimatingRef.current = false }, 450)
                } else {
                    const spacer = document.createElement('div')
                    spacer.style.height = '500px'
                    spacer.style.flexShrink = '0'
                    el.appendChild(spacer)
                    // After collapse animation, shrink spacer gradually then remove
                    setTimeout(() => {
                        // Animate spacer height to 0 so scroll adjusts smoothly
                        spacer.style.transition = 'height 0.4s ease'
                        spacer.style.height = '0px'
                        const maxScroll = el.scrollHeight - spacer.offsetHeight - el.clientHeight
                        const dest = Math.max(0, Math.min(el.scrollTop, maxScroll))
                        if (Math.abs(el.scrollTop - dest) > 2) {
                            el.scrollTo({ top: dest, behavior: 'smooth' })
                        }
                        setTimeout(() => {
                            spacer.remove()
                            isAnimatingRef.current = false
                        }, 450)
                    }, 300)
                }
            } else {
                setTimeout(() => { isAnimatingRef.current = false }, 300)
            }
        }

        setVisibleEntryIndex(0)
        setExpandedSources(prev => {
            const next = new Set(prev)
            if (next.has(sourceId)) {
                next.delete(sourceId)
                setVisibleExpandedSource(v => v === sourceId ? null : v)
            } else {
                next.add(sourceId)
                setVisibleExpandedSource(sourceId)
            }
            return next
        })

        // Track expand/collapse
        analytics.track(DASHBOARD_EVENTS.SOURCE_EXPANDED, {
            source_id: sourceId,
            expanded: !wasExpanded,
        })

        // When expanding, scroll row into view (without collapsing the graph)
        if (!wasExpanded) {
            isAnimatingRef.current = true
            if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
            setTimeout(() => {
                const el = scrollRef.current
                if (!el) { isAnimatingRef.current = false; return }
                const row = el.querySelector(`[data-source-id="${sourceId}"]`)
                if (!row) { isAnimatingRef.current = false; return }
                const stickyHeader = el.querySelector('[data-sticky-header]')
                const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 5
                const dest = Math.max(el.scrollTop, target)
                const dist = Math.abs(el.scrollTop - dest)
                if (dist > 2) {
                    const duration = Math.max(400, Math.min(700, dist * 3))
                    const start = el.scrollTop
                    const diff = dest - start
                    const startTime = performance.now()
                    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
                    const step = (now) => {
                        const t = Math.min(1, (now - startTime) / duration)
                        el.scrollTop = start + diff * ease(t)
                        applyScrollStyles(el.scrollTop)
                        if (t < 1) {
                            requestAnimationFrame(step)
                        } else {
                            isAnimatingRef.current = false
                        }
                    }
                    requestAnimationFrame(step)
                } else {
                    isAnimatingRef.current = false
                }
            }, 150)
        }
    }, [expandedSources])
    const [activeTab, setActiveTabRaw] = useState(() => localStorage.getItem('budgeup_active_tab') || 'goals')
    const activeTabRef = useRef(activeTab)
    const setActiveTab = (tab) => { activeTabRef.current = tab; localStorage.setItem('budgeup_active_tab', tab); setActiveTabRaw(tab) }
    const [goalsShowMore, setGoalsShowMoreRaw] = useState(() => sessionStorage.getItem('budgeup_goals_show_more') === 'true')
    const setGoalsShowMore = (fn) => { setGoalsShowMoreRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; sessionStorage.setItem('budgeup_goals_show_more', String(val)); return val }) }
    const [trackingShowAll, setTrackingShowAllRaw] = useState(() => sessionStorage.getItem('budgeup_tracking_show_all') === 'true')
    const setTrackingShowAll = (fn) => { setTrackingShowAllRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; sessionStorage.setItem('budgeup_tracking_show_all', String(val)); return val }) }
    const [warningMinimised, setWarningMinimisedRaw] = useState(true)
    const setWarningMinimised = (fn) => { setWarningMinimisedRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; localStorage.setItem('budgeup_warning_minimised', String(val)); return val }) }
    const [trackMinimised, setTrackMinimised] = useState(false)
    const [disclaimerOpen, setDisclaimerOpen] = useState(() => localStorage.getItem('budgeup_disclaimer_seen') !== 'true')
    const [tappedSegment, setTappedSegment] = useState(null)
    const breakdownRef = useRef(null)
    // Close tooltip on click anywhere
    useEffect(() => {
        if (!tappedSegment) return
        const dismiss = () => setTappedSegment(null)
        setTimeout(() => document.addEventListener('pointerdown', dismiss), 50)
        return () => document.removeEventListener('pointerdown', dismiss)
    }, [tappedSegment])
    const [showAllIncome, setShowAllIncomeRaw] = useState(() => sessionStorage.getItem('budgeup_show_all_income') === 'true')
    const setShowAllIncome = (fn) => { setShowAllIncomeRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; sessionStorage.setItem('budgeup_show_all_income', String(val)); return val }) }
    const [showAllExpenses, setShowAllExpensesRaw] = useState(() => sessionStorage.getItem('budgeup_show_all_expenses') === 'true')
    const setShowAllExpenses = (fn) => { setShowAllExpensesRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; sessionStorage.setItem('budgeup_show_all_expenses', String(val)); return val }) }
    const goalsMoreRef = useRef(null)
    const goalsTransCardRef = useRef(null)
    const tabScrollRef = useRef({})
    const skipScrollSaveRef = useRef(false)
    const tabExpandedRef = useRef({})
    const tabGraphCoveredRef = useRef({
        goals: sessionStorage.getItem('budgeup_graph_covered_goals') === 'true',
        income: sessionStorage.getItem('budgeup_graph_covered_income') === 'true',
        expenses: sessionStorage.getItem('budgeup_graph_covered_expenses') === 'true',
    })
    const handleTabChange = (tab, targetScrollOverride) => {
        if (tab !== activeTab) {
            analytics.track(DASHBOARD_EVENTS.TAB_SWITCHED, { tab })
        }
        const el = scrollRef.current
        if (!el) return

        // Tapping the already-active tab — toggle between expanded and collapsed
        if (tab === activeTab) {
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            const heroEl = heroHeaderRef.current
            if (!gc || !graphEl) return
            const currentH = graphEl.offsetHeight
            const isCov = graphCovered
            const isExpanded = currentH > MIN_H + 10 && !isCov
            const isCollapsed = !isExpanded && !isCov

            if (isExpanded) {
                // Expanded → collapsed
                const t = '0.45s cubic-bezier(0.25, 1, 0.5, 1)'
                gc.style.transition = `max-height ${t}, margin-top ${t}`
                graphEl.style.transition = `height ${t}`
                if (heroEl) heroEl.style.transition = `opacity 0.15s ease, max-height ${t}, padding ${t}`
                gc.offsetHeight // reflow
                graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.maxHeight = ''
                gc.style.overflow = ''
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
                setGraphCollapsed(true)
                setTimeout(() => { gc.style.transition = ''; graphEl.style.transition = ''; if (heroEl) heroEl.style.transition = ''; gc.style.maxHeight = ''; gc.style.overflow = '' }, 500)
            } else if (isCov) {
                // Covered → expanded (slower, gentler)
                const t = '0.65s cubic-bezier(0.22, 1, 0.36, 1)'
                gc.style.transition = `max-height ${t}, margin-top ${t}`
                graphEl.style.transition = `height ${t}`
                if (heroEl) heroEl.style.transition = `opacity 0.5s ease 0.15s, max-height ${t}, padding ${t}`
                gc.offsetHeight // reflow
                graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                gc.style.maxHeight = '500px'
                gc.style.overflow = ''
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
                setGraphCollapsed(false)
                setGraphCovered(false)
                setThemeColor('#ffffff')
                themeColorRef.current = '#ffffff'
                setTimeout(() => { gc.style.transition = ''; graphEl.style.transition = ''; if (heroEl) heroEl.style.transition = ''; gc.style.maxHeight = ''; gc.style.overflow = '' }, 700)
            } else {
                // Collapsed → expanded
                const t = '0.45s cubic-bezier(0.25, 1, 0.5, 1)'
                gc.style.transition = `max-height ${t}, margin-top ${t}`
                graphEl.style.transition = `height ${t}`
                if (heroEl) heroEl.style.transition = `opacity 0.35s ease, max-height ${t}, padding ${t}`
                gc.offsetHeight // reflow
                graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                gc.style.maxHeight = ''
                gc.style.overflow = ''
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
                setGraphCollapsed(false)
                setTimeout(() => { gc.style.transition = ''; graphEl.style.transition = ''; if (heroEl) heroEl.style.transition = ''; gc.style.maxHeight = ''; gc.style.overflow = '' }, 500)
            }
            return
        }

        // Switching to different tab

        // Check if tab is empty
        const isIncomeEmpty = tab === 'income' &&
            INCOME_SOURCES.filter(s => isSourceVisible(s.id, formData.incomeSources)).length === 0 &&
            (formData.flexIncomeSources || []).length === 0
        const isExpensesEmpty = tab === 'expenses' &&
            EXPENSE_SOURCES.filter(s => isSourceVisible(s.id, formData.expenseSources)).length === 0 &&
            (formData.flexExpenseSources || []).length === 0
        const isTabEmpty = isIncomeEmpty || isExpensesEmpty

        // Save current tab's scroll position before switching (skip if already saved by navigateToSource)
        if (!skipScrollSaveRef.current) tabScrollRef.current[activeTab] = el.scrollTop
        skipScrollSaveRef.current = false
        // Restore saved scroll position for new tab (or start at top)
        const targetScroll = tabScrollRef.current[tab] || 0

        isTabSwitchingRef.current = true
        isAnimatingRef.current = true
        animatingStartRef.current = performance.now()
        if (snapTimerRef.current) clearTimeout(snapTimerRef.current)

        applyScrollStyles(targetScroll)

        // Hide content during switch to prevent flash — use opacity to keep background white
        el.style.opacity = '0'
        cachedNodesRef.current = null

        flushSync(() => {
            setActiveTab(tab)
        })

        cachedNodesRef.current = null
        el.scrollTop = targetScroll
        applyScrollStyles(targetScroll)

        requestAnimationFrame(() => {
            el.scrollTop = targetScroll
            applyScrollStyles(targetScroll)
            el.style.opacity = ''
            isAnimatingRef.current = false
            // Delay clearing tab switch flag to block stale scroll events from content reflow
            setTimeout(() => { isTabSwitchingRef.current = false }, 300)
        })
    }
    const [editingEvent, setEditingEvent] = useState(null)
    const [termPopup, setTermPopup] = useState(null) // { term, clickX, clickY }
    const termPopupRef = useRef(null)
    // Dismiss term popup on scroll or click away
    useEffect(() => {
        if (!termPopup) return
        const el = scrollRef.current
        const onScroll = () => setTermPopup(null)
        const onClick = (e) => {
            if (e.target.closest('[data-term-label]')) return
            if (termPopupRef.current?.contains(e.target)) return
            setTermPopup(null)
        }
        if (el) el.addEventListener('scroll', onScroll, { passive: true, once: true })
        const t = setTimeout(() => document.addEventListener('click', onClick), 0)
        return () => {
            if (el) el.removeEventListener('scroll', onScroll)
            clearTimeout(t)
            document.removeEventListener('click', onClick)
        }
    }, [termPopup?.term?.id])
    const [editAmount, setEditAmount] = useState('')
    const [editWarning, setEditWarning] = useState('')
    const [skipToast, setSkipToast] = useState(null) // { label, undoFn }
    const skipToastTimerRef = useRef(null)
    const [nearbyEvents, setNearbyEvents] = useState([])
    const [nearbyIdx, setNearbyIdx] = useState(0)
    const [editingOverdraft, setEditingOverdraft] = useState(null)
    const [editOverdraftAmount, setEditOverdraftAmount] = useState('')
    const [fabBalanceOpen, setFabBalanceOpen] = useState(false)
    const [fabBalanceClosing, setFabBalanceClosing] = useState(false)
    const setThemeColor = (color) => {
        const existing = document.querySelector('meta[name="theme-color"]')
        if (existing) existing.remove()
        const meta = document.createElement('meta')
        meta.name = 'theme-color'
        meta.content = color
        document.head.appendChild(meta)
    }
    const openFabBalance = () => {
        setFabBalanceOpen(true)
        setThemeColor('#ffffff')
        window.dispatchEvent(new CustomEvent('nav-fab-balance', { detail: { open: true } }))
    }
    const closeFabBalance = () => {
        setFabBalanceClosing(true)
        setThemeColor('#ffffff')
        window.dispatchEvent(new CustomEvent('nav-fab-balance', { detail: { open: false } }))
        setTimeout(() => {
            setFabBalanceOpen(false)
            setFabBalanceClosing(false)
        }, 300)
    }
    // Listen for FAB button tap to close balance popup
    useEffect(() => {
        const handler = () => closeFabBalance()
        window.addEventListener('nav-fab-close-balance', handler)
        return () => window.removeEventListener('nav-fab-close-balance', handler)
    }, [])
    const [editingBalance, setEditingBalance] = useState(false)
    const [editBalanceValue, setEditBalanceValue] = useState('')
    const balanceInputRef = useRef(null)

    useEffect(() => {
        if (editingBalance) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (balanceInputRef.current) {
                    balanceInputRef.current.focus()
                    balanceInputRef.current.select()
                }
            }))
        }
    }, [editingBalance])

    const saveInlineBalance = () => {
        const newVal = parseMoney(editBalanceValue)
        const today = toLocalDate(new Date())
        const lastRecorded = localStorage.getItem('budgeup_balance_last_date')
        const isUpdate = lastRecorded === today
        if (!originSetRef.current) {
            originSetRef.current = true
            updateField('balance', editBalanceValue)
        }
        if (userIdRef.current) {
            saveBalanceHistory(userIdRef.current, newVal)
        }
        analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
            balance_range: getBalanceRange(newVal),
            is_first_recording: !originSetRef.current,
            is_update: isUpdate,
            entry_method: 'inline_edit',
        })
        localStorage.setItem('budgeup_balance_last_date', today)
        setBalanceHistory(prev => {
            const entry = { balance: newVal, recorded_date: today, source: 'manual' }
            const existing = prev.findIndex(e => e.recorded_date === today)
            if (existing >= 0) {
                const updated = [...prev]
                updated[existing] = { ...updated[existing], balance: newVal }
                return updated
            }
            return [entry, ...prev]
        })
        if (balanceNum !== newVal) {
            if (balanceToastTimer.current) clearTimeout(balanceToastTimer.current)
            setBalanceToast(isUpdate ? 'Updated today\u2019s balance' : 'Recorded balance for today')
            balanceToastTimer.current = setTimeout(() => setBalanceToast(null), 2500)
        }
        setEditingBalance(false)
    }
    const [showGraphFilter, setShowGraphFilter] = useState(false)
    const [graphFilterClosing, setGraphFilterClosing] = useState(false)
    const graphFilterRef = useRef(null)
    const graphFilterDropdownRef = useRef(null)
    const [graphIsZoomed, setGraphIsZoomed] = useState(false)
    const zoomOutRef = useRef(null)
    const [graphSettled, setGraphSettled] = useState(false)
    useEffect(() => {
        const t = setTimeout(() => setGraphSettled(true), 450)
        return () => clearTimeout(t)
    }, [])

    const closeGraphFilter = useCallback(() => {
        if (!showGraphFilter || graphFilterClosing) return
        setGraphFilterClosing(true)
        setTimeout(() => { setShowGraphFilter(false); setGraphFilterClosing(false) }, 180)
    }, [showGraphFilter, graphFilterClosing])

    // Close graph filter on outside click
    useEffect(() => {
        if (!showGraphFilter) return
        const handler = (e) => {
            if (graphFilterRef.current && !graphFilterRef.current.contains(e.target) &&
                graphFilterDropdownRef.current && !graphFilterDropdownRef.current.contains(e.target)) {
                closeGraphFilter()
            }
        }
        document.addEventListener('pointerdown', handler)
        return () => document.removeEventListener('pointerdown', handler)
    }, [showGraphFilter, closeGraphFilter])
    const [balanceHistory, setBalanceHistoryRaw] = useState(() => {
        try { const cached = localStorage.getItem('budgeup_balance_history_cache'); return cached ? JSON.parse(cached) : [] } catch { return [] }
    })
    const setBalanceHistory = (valOrFn) => {
        setBalanceHistoryRaw(prev => {
            const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn
            localStorage.setItem('budgeup_balance_history_cache', JSON.stringify(next))
            return next
        })
    }
    const originSetRef = useRef(false)
    const [apiLoaded, setApiLoaded] = useState(false)
    const [dbLoaded, setDbLoaded] = useState(() => {
        // If we have cached form data with a balance, skip loading state
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.formData?.balance) return true
            }
        } catch { /* ignore */ }
        return false
    })
    const saveTimerRef = useRef(null)
    const userIdRef = useRef(null)
    const formDataRef = useRef(formData)
    const hiddenSourcesRef = useRef(hiddenSources)
    const dbLoadedRef = useRef(false)
    const [userJoinDate, setUserJoinDate] = useState(null)

    // Refresh graph start date on mount (picks up changes from Settings)
    useEffect(() => {
        refreshAY()
    }, [])

    // Re-sync from Supabase when tab becomes visible again
    useEffect(() => {
        const sync = async () => {
            if (document.hidden) return
            // Skip sync if there's a pending save (local data is ahead of server)
            if (saveTimerRef.current) return
            const userId = userIdRef.current
            if (!userId) return
            try {
                const result = await fetchUserData(userId)
                if (result.formData) {
                    const merged = migrateOtherFields({ ...INITIAL_FORM_DATA, ...result.formData })
                    // Only prefer localStorage over DB when there's a pending save (local data is ahead)
                    const hasPending = localStorage.getItem('budgeup_pending_save') === 'true'
                    if (hasPending) {
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY)
                            const parsed = saved ? JSON.parse(saved) : {}
                            const localFD = parsed.formData || {}
                            if (localFD.overdraft != null) merged.overdraft = localFD.overdraft
                            if (localFD.amountOverrides) merged.amountOverrides = { ...(merged.amountOverrides || {}), ...localFD.amountOverrides }
                            for (const key of Object.keys(localFD)) {
                                if (key.endsWith('Entries') && Array.isArray(localFD[key]) && localFD[key].length > 0) {
                                    merged[key] = localFD[key]
                                }
                            }
                            if (localFD.termDates?.terms?.length) {
                                merged.termDates = localFD.termDates
                            }
                        } catch { /* ignore */ }
                    }
                    // Update localStorage with merged data (DB as source of truth)
                    try {
                        const saved = localStorage.getItem(STORAGE_KEY)
                        const parsed = saved ? JSON.parse(saved) : {}
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: merged }))
                    } catch { /* ignore */ }
                    setFormData(prev => {
                        if (JSON.stringify(prev) === JSON.stringify(merged)) return prev
                        return merged
                    })
                }
                if (result.balanceHistory) setBalanceHistory(result.balanceHistory)
                const bal = result.formData?.balance
                if (bal && bal !== '' && bal !== '0' && Number(bal) !== 0) {
                    originSetRef.current = true
                }
            } catch { /* ignore sync errors */ }
        }
        document.addEventListener('visibilitychange', sync)
        return () => {
            document.removeEventListener('visibilitychange', sync)
        }
    }, [])

    // Load data from Supabase on mount
    useEffect(() => {
        let cancelled = false
            ; (async () => {
                try {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user || cancelled) return
                    userIdRef.current = user.id
                    if (user.email) setUserEmail(user.email)
                    if (user.created_at) {
                        const d = new Date(user.created_at)
                        setUserJoinDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
                    }

                    const result = await fetchUserData(user.id)

                    // Sync graph start from database, respecting the user's chosen mode
                    const mode = localStorage.getItem('budgeup_graph_start_mode')
                    const joinDateStr = user.created_at
                        ? (() => { const d = new Date(user.created_at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
                        : null
                    if (joinDateStr) setJoinDate(joinDateStr)
                    if (mode === 'first_term') {
                        // Will be handled by the termDates useEffect below
                    } else if (mode === 'custom' && localStorage.getItem('budgeup_graph_start')) {
                        // Custom mode — keep whatever the user set locally
                    } else if (mode === 'joined' && joinDateStr) {
                        // Always use actual join date
                        setGraphStart(joinDateStr)
                        refreshAY()
                        setGraphKey(k => k + 1)
                    } else if (result.profile?.graph_start) {
                        setGraphStart(result.profile.graph_start)
                        if (!mode) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                        setGraphKey(k => k + 1)
                    } else if (joinDateStr) {
                        setGraphStart(joinDateStr)
                        if (!mode) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                        setGraphKey(k => k + 1)
                    }
                    if (cancelled) return
                    if (result.formData) {
                        const hasPendingSave = localStorage.getItem('budgeup_pending_save') === 'true'
                        // Always clear the pending flag on load — it will be re-set if there are actual changes
                        localStorage.removeItem('budgeup_pending_save')
                        // Start from DB data as source of truth
                        const merged = migrateOtherFields({ ...INITIAL_FORM_DATA, ...result.formData })
                        // If pending save, carefully merge localStorage — only prefer non-empty entries over empty DB entries
                        if (hasPendingSave) {
                            try {
                                const s = localStorage.getItem(STORAGE_KEY)
                                const localFD = s ? JSON.parse(s).formData || {} : {}
                                // Only override with localStorage values that have actual data
                                for (const key of Object.keys(localFD)) {
                                    if (key.endsWith('Entries') && Array.isArray(localFD[key]) && localFD[key].length > 0) {
                                        // Only prefer localStorage entries if DB has fewer or none
                                        const dbEntries = merged[key] || []
                                        if (localFD[key].length >= dbEntries.length) merged[key] = localFD[key]
                                    }
                                }
                                if (localFD.incomeSources?.length > (merged.incomeSources?.length || 0)) merged.incomeSources = localFD.incomeSources
                                if (localFD.expenseSources?.length > (merged.expenseSources?.length || 0)) merged.expenseSources = localFD.expenseSources
                                if (localFD.removedEvents?.length) merged.removedEvents = [...new Set([...(merged.removedEvents || []), ...localFD.removedEvents])]
                                if (localFD.amountOverrides && Object.keys(localFD.amountOverrides).length) merged.amountOverrides = { ...(merged.amountOverrides || {}), ...localFD.amountOverrides }
                                if (localFD.weeklySpend && !merged.weeklySpend) merged.weeklySpend = localFD.weeklySpend
                                if (localFD.overdraft != null && localFD.overdraft !== '') merged.overdraft = localFD.overdraft
                                if (localFD.termDates?.terms?.length) merged.termDates = localFD.termDates
                            } catch { /* ignore */ }
                        }
                        // Only prefer localStorage term dates when there's a pending save
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY)
                            const parsed = saved ? JSON.parse(saved) : {}
                            // Re-run break name merge
                            if (merged.university && hasCustomTermDates(merged.university) && merged.termDates?.terms?.length) {
                                const custom = getTermDatesForUniversity(merged.university)
                                if (custom?.terms?.length) {
                                    for (let ti = 0; ti < merged.termDates.terms.length && ti < custom.terms.length; ti++) {
                                        const breaks = merged.termDates.terms[ti].breaks
                                        const customBreaks = custom.terms[ti].breaks
                                        if (!breaks || !customBreaks) continue
                                        for (let bi = 0; bi < breaks.length; bi++) {
                                            const match = customBreaks.find(cb => cb.start === breaks[bi].start && cb.end === breaks[bi].end)
                                            if (match?.name && !breaks[bi].name) {
                                                breaks[bi].name = match.name
                                            }
                                        }
                                    }
                                }
                            }
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: merged }))
                        } catch { /* ignore */ }
                        setFormData(merged)
                        // Persist merged data (break names etc.) back to Supabase
                        saveUserFinances(userIdRef.current, { ...merged, onboardingCompleted: true }).catch(() => { })
                    }
                    if (result.balanceHistory) setBalanceHistory(result.balanceHistory)
                    // Mark origin as set if balance already exists (check DB, localStorage, and balance history)
                    const bal = result.formData?.balance || merged?.balance || localFD?.balance
                    const hasHistory = result.balanceHistory?.length > 0
                    if ((bal && bal !== '' && bal !== '0' && Number(bal) !== 0) || hasHistory) {
                        originSetRef.current = true
                    } else {
                        // No balance set — show mandatory popup
                        setShowInitialBalancePopup(true)
                    }
                    // Restore hidden sources from DB (merge with localStorage)
                    if (result.formData?.hiddenSources?.length) {
                        setHiddenSources(prev => {
                            const merged = new Set([...prev, ...result.formData.hiddenSources])
                            localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...merged]))
                            return merged
                        })
                    }
                    setDbLoaded(true)
                    setApiLoaded(true)
                    // If there was a pending save from a quick reload, the debounced save
                    // will fire automatically since dbLoaded just turned true and formData
                    // has the localStorage data merged in
                } catch (err) {
                    console.error('Failed to load from Supabase:', err)
                    setDbLoaded(true) // still mark loaded so localStorage data is used
                    setApiLoaded(true)
                }
            })()
        return () => { cancelled = true }
    }, [])

    // Update graph start to 1st of first term's start month (only in term-start mode)
    useEffect(() => {
        const mode = localStorage.getItem('budgeup_graph_start_mode')
        if (mode && mode !== 'first_term') return
        const terms = formData.termDates?.terms
        if (!terms?.length) return
        const earliest = [...terms].sort((a, b) => a.start.localeCompare(b.start))[0]
        if (getGraphStart() !== earliest.start) {
            setGraphStart(earliest.start)
            refreshAY()
        }
    }, [formData.termDates])

    // Keep refs in sync for pagehide handler
    useEffect(() => { formDataRef.current = formData }, [formData])
    useEffect(() => { hiddenSourcesRef.current = hiddenSources }, [hiddenSources])
    useEffect(() => { dbLoadedRef.current = dbLoaded }, [dbLoaded])

    // Flush pending save when page loses visibility, unloads, or reloads
    useEffect(() => {
        const flush = () => {
            if (!saveTimerRef.current || !dbLoadedRef.current || !userIdRef.current) return
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
            const fd = formDataRef.current
            const userId = userIdRef.current
            const hs = [...hiddenSourcesRef.current]
            saveCashflowForecast(userId, { ...fd, hiddenSources: hs }).catch(() => { })
            saveUserFinances(userId, {
                university: fd.university,
                overdraft: fd.overdraft,
                savings: fd.savings,
                weeklySpend: fd.weeklySpend,
                weeklySpendNonTerm: fd.weeklySpendNonTerm,
                weeklySpendVariesByTerm: fd.weeklySpendVariesByTerm,
                balance: fd.balance,
            }).catch(() => { })
            saveTermDates(userId, fd.termDates).catch(() => { })
        }
        const onVisChange = () => { if (document.hidden) flush() }
        document.addEventListener('visibilitychange', onVisChange)
        window.addEventListener('pagehide', flush)
        window.addEventListener('beforeunload', flush)
        return () => {
            document.removeEventListener('visibilitychange', onVisChange)
            window.removeEventListener('pagehide', flush)
            window.removeEventListener('beforeunload', flush)
        }
    }, [])

    // Debounce save to Supabase when formData changes (after initial DB load)
    useEffect(() => {
        if (!dbLoaded || !userIdRef.current) return
        // Don't save if one-off items have amount but no name
        const invalidOneOff = (formData.oneOffItems || []).some(i => i.amount && !i.name?.trim())
        if (invalidOneOff) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        // Mark that we have unsaved changes
        localStorage.setItem('budgeup_pending_save', 'true')
        saveTimerRef.current = setTimeout(async () => {
            try {
                const userId = userIdRef.current
                await Promise.all([
                    saveCashflowForecast(userId, { ...formData, hiddenSources: [...hiddenSources] }),
                    saveUserFinances(userId, {
                        university: formData.university,
                        overdraft: formData.overdraft,
                        savings: formData.savings,
                        weeklySpend: formData.weeklySpend,
                        weeklySpendNonTerm: formData.weeklySpendNonTerm,
                        weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                        balance: formData.balance,
                    }),
                    saveTermDates(userId, formData.termDates),
                ])
                localStorage.removeItem('budgeup_pending_save')
            } catch (err) {
                console.error('Failed to save to Supabase:', err)
            }
        }, 2000) // 2s debounce
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
                // Flush save immediately on cleanup
                const userId = userIdRef.current
                if (userId) {
                    saveCashflowForecast(userId, { ...formData, hiddenSources: [...hiddenSources] }).catch(() => { })
                    saveUserFinances(userId, {
                        university: formData.university,
                        overdraft: formData.overdraft,
                        savings: formData.savings,
                        weeklySpend: formData.weeklySpend,
                        weeklySpendNonTerm: formData.weeklySpendNonTerm,
                        weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                        balance: formData.balance,
                    }).catch(() => { })
                }
                saveTimerRef.current = null
            }
        }
    }, [formData, dbLoaded])

    // Shrink graph on scroll: 200 → 108 (direct DOM for smooth perf)
    const scrollRef = useRef(null)
    // Restore scroll position when returning to Dashboard from another navbar tab
    useEffect(() => {
        // Restore per-tab scroll positions
        try {
            const savedTabs = sessionStorage.getItem('budgeup_tab_scrolls')
            if (savedTabs) tabScrollRef.current = JSON.parse(savedTabs)
        } catch { /* ignore */ }
        // Restore current tab's scroll position after content has rendered
        const saved = tabScrollRef.current[activeTab]
        if (saved) {
            // Delay to allow content to render fully before setting scroll
            const timer = setTimeout(() => {
                if (scrollRef.current) {
                    isAnimatingRef.current = true
                    scrollRef.current.scrollTop = saved
                    applyScrollStyles(saved)
                    requestAnimationFrame(() => { isAnimatingRef.current = false })
                }
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [])
    // Save scroll positions on unmount
    useEffect(() => {
        const elRef = scrollRef
        return () => {
            if (elRef.current) {
                tabScrollRef.current[activeTabRef.current] = elRef.current.scrollTop
            }
            sessionStorage.setItem('budgeup_tab_scrolls', JSON.stringify(tabScrollRef.current))
        }
    }, [])
    const graphContainerRef = useRef(null)
    const contentWrapRef = useRef(null)
    const stickyHeaderRef = useRef(null)
    const tabsBarRef = useRef(null)
    const themeColorRef = useRef('#ffffff')
    const [graphCovered, setGraphCoveredRaw] = useState(() => {
        return localStorage.getItem('budgeup_graph_covered') === 'true'
    })
    const setGraphCovered = (v) => {
        localStorage.setItem('budgeup_graph_covered', String(v))
        setGraphCoveredRaw(v)
    }
    const [graphCollapsed, setGraphCollapsedRaw] = useState(() => {
        return localStorage.getItem('budgeup_graph_collapsed') === 'true'
    })
    const setGraphCollapsed = (v) => {
        localStorage.setItem('budgeup_graph_collapsed', String(v))
        setGraphCollapsedRaw(v)
    }
    const graphCardRef = useRef(null)
    const heroHeaderRef = useRef(null)
    const rafRef = useRef(null)
    const MAX_H = 224
    const MIN_H = 115
    const SHRINK_DIST = MAX_H - MIN_H
    const HIDE_DIST = MIN_H // additional scroll to fully hide graph

    // Graph height — always MAX_H. Drag handler controls height via refs only.
    const graphHeight = (graphCovered || graphCollapsed) ? MIN_H : MAX_H
    const cardDetailsRef = useRef(null)
    const footerRef = useRef(null)


    // Cache DOM node references to avoid querySelectorAll on every scroll frame
    const cachedNodesRef = useRef(null)
    const getCachedNodes = useCallback(() => {
        if (cachedNodesRef.current) return cachedNodesRef.current
        if (!cardDetailsRef.current) return null
        cachedNodesRef.current = {
            details: cardDetailsRef.current.querySelectorAll('[data-card-detail]'),
            cards: cardDetailsRef.current.querySelectorAll('[data-card]'),
            headers: cardDetailsRef.current.querySelectorAll('[data-card-header]'),
        }
        return cachedNodesRef.current
    }, [])

    // Invalidate cached nodes when tab changes (cards re-render)
    useEffect(() => { cachedNodesRef.current = null }, [activeTab])

    const snapTimerRef = useRef(null)
    const isSnappingRef = useRef(false)
    const isTabSwitchingRef = useRef(false)
    const animFrameRef = useRef(null)
    const touchOnGraphRef = useRef(false)

    const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const easeOut = (t) => 1 - Math.pow(1 - t, 3)

    const applyScrollStyles = useCallback(() => { }, [])

    // Animate graph to collapsed state (midway)
    const collapseGraph = useCallback(() => {
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (!gc || !graphEl) return
        if (graphEl.offsetHeight <= MIN_H + 5) return // already collapsed
        const t = '0.35s cubic-bezier(0.4, 0, 0.2, 1)'
        gc.style.transition = `height ${t}`
        graphEl.style.transition = `height ${t}`
        if (heroEl) heroEl.style.transition = `opacity 0.3s ease, max-height ${t}, padding ${t}`
        graphEl.style.height = `${MIN_H}px`
        gc.style.height = ''
        if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        setGraphCollapsed(true)
        setTimeout(() => {
            gc.style.transition = ''
            graphEl.style.transition = ''
            if (heroEl) heroEl.style.transition = ''
        }, 400)
    }, [])

    // Track when handle drag is active so pull-down doesn't interfere
    const handleDraggingRef = useRef(false)

    // Drag on tabs/handle: Phase 1 = shrink graph, Phase 2 = cover collapsed graph
    const onHandlePointerDown = useCallback((e) => {
        // Don't expand graph while scrubbing or zoomed
        if (window.__budgeup_scrubbing?.current?.active) return
        if (graphIsZoomed) return
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (!gc) return

        handleDraggingRef.current = true
        const startY = e.clientY
        let moved = false
        let rafId = null
        let lastPos = 0
        const easeLocal = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

        // Defer measurement to first move — don't touch DOM on tap
        let collapsedGcH = null
        let maxDragPos = MAX_H // temporary, updated on first move
        let startPos = 0 // temporary, updated on first move
        let measured = false

        const measure = () => {
            if (measured) return
            measured = true
            const savedGraphH = graphEl ? graphEl.style.height : ''
            const savedGcH = gc.style.height
            const savedGcMax = gc.style.maxHeight
            const savedHero = heroEl ? {
                o: heroEl.style.opacity, mh: heroEl.style.maxHeight,
                pt: heroEl.style.paddingTop, pb: heroEl.style.paddingBottom,
            } : null

            if (graphEl) graphEl.style.height = `${MIN_H}px`
            gc.style.height = ''
            gc.style.maxHeight = ''
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            collapsedGcH = gc.offsetHeight

            // Restore (no paint happened)
            if (graphEl) graphEl.style.height = savedGraphH
            gc.style.height = savedGcH
            gc.style.maxHeight = savedGcMax
            if (heroEl && savedHero) {
                heroEl.style.opacity = savedHero.o; heroEl.style.maxHeight = savedHero.mh
                heroEl.style.paddingTop = savedHero.pt; heroEl.style.paddingBottom = savedHero.pb
            }

            const currentGraphH = graphEl ? graphEl.offsetHeight : MAX_H
            if (graphCovered) {
                startPos = SHRINK_DIST + collapsedGcH
                maxDragPos = SHRINK_DIST + collapsedGcH
            } else if (currentGraphH <= MIN_H + 10) {
                startPos = SHRINK_DIST
                maxDragPos = SHRINK_DIST + collapsedGcH
            } else {
                // Expanded — only allow collapsing, not covering
                startPos = 0
                maxDragPos = SHRINK_DIST
            }

        }

        const applyPos = (pos) => {
            const p = Math.max(0, Math.min(maxDragPos, pos))

            if (p <= SHRINK_DIST) {
                // Phase 1: tabs push graph up — gc auto-wraps naturally
                const t = p / SHRINK_DIST
                const ct = easeLocal(t)
                if (graphEl) graphEl.style.height = `${MAX_H - ct * SHRINK_DIST}px`
                gc.style.height = ''
                gc.style.maxHeight = ''
                gc.style.overflow = ''
                gc.style.marginTop = '0px'
                if (heroEl) {
                    const f = easeLocal(Math.min(1, t * 2.5))
                    heroEl.style.opacity = `${1 - f}`
                    heroEl.style.maxHeight = `${(1 - f) * 80}px`
                    heroEl.style.paddingTop = `${(1 - f) * 4}px`
                    heroEl.style.paddingBottom = `${(1 - f) * 6}px`
                }
            } else {
                // Phase 2: tabs slide over collapsed graph — clip gc with maxHeight
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                const cover = (p - SHRINK_DIST) / collapsedGcH
                const clipH = collapsedGcH * (1 - Math.min(1, cover))
                gc.style.height = ''
                gc.style.maxHeight = `${Math.max(4, clipH)}px`
                gc.style.overflow = 'hidden'
                gc.style.marginTop = '0px'
                if (heroEl) {
                    heroEl.style.opacity = '0'
                    heroEl.style.maxHeight = '0px'
                    heroEl.style.paddingTop = '0px'
                    heroEl.style.paddingBottom = '0px'
                }
            }
        }

        const onMove = (ev) => {
            const dy = ev.clientY - startY
            if (!moved && Math.abs(dy) < 8) return
            if (!moved) {
                // First real move — measure now (deferred from pointerdown)
                measure()
                if (dy > 0 && startPos <= 0) {
                    // Already expanded, pulling down — abort
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                    handleDraggingRef.current = false
                    return
                }
                // Remove transitions for direct manipulation
                gc.style.transition = 'none'
                if (graphEl) graphEl.style.transition = 'none'
                if (heroEl) heroEl.style.transition = 'none'
            }
            moved = true
            lastPos = Math.max(0, Math.min(maxDragPos, startPos - dy))
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => applyPos(lastPos))
        }

        const snapTo = (state) => {
            // Ensure maxHeight has an explicit pixel value so CSS can transition it
            if (!gc.style.maxHeight || gc.style.maxHeight === 'none') {
                gc.style.maxHeight = `${gc.offsetHeight}px`
                gc.style.overflow = 'hidden'
            }
            // Duration proportional to remaining distance (min 0.2s, max 0.45s)
            const p = Math.max(0, Math.min(maxDragPos, lastPos))
            const targetPos = state === 'expanded' ? 0 : state === 'collapsed' ? SHRINK_DIST : maxDragPos
            const dist = Math.abs(p - targetPos)
            const maxDist = maxDragPos || SHRINK_DIST
            const dur = Math.max(0.2, Math.min(0.45, 0.2 + (dist / maxDist) * 0.3))
            const t = `${dur.toFixed(2)}s cubic-bezier(0.25, 1, 0.5, 1)`
            gc.style.transition = `max-height ${t}, margin-top ${t}`
            if (graphEl) graphEl.style.transition = `height ${t}`
            if (heroEl) heroEl.style.transition = `opacity ${Math.max(0.15, dur * 0.6).toFixed(2)}s ease, max-height ${t}, padding ${t}`
            // Force reflow so browser registers current state + transition before target
            gc.offsetHeight

            if (state === 'expanded') {
                // Animate maxHeight to expandedGcH, then clear after transition
                if (graphEl) graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                gc.style.maxHeight = `${collapsedGcH + SHRINK_DIST + 200}px`
                gc.style.overflow = ''
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
            } else if (state === 'collapsed') {
                // Animate maxHeight to collapsedGcH (matches auto), then clear after
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.maxHeight = `${collapsedGcH}px`
                gc.style.overflow = 'hidden'
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            } else {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.maxHeight = '4px'
                gc.style.overflow = 'hidden'
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            }

            const isCovered = state === 'covered'
            const isCollapsed = state === 'collapsed'

            setTimeout(() => {
                gc.style.transition = ''
                if (graphEl) graphEl.style.transition = ''
                if (heroEl) heroEl.style.transition = ''
                // Clear maxHeight/overflow after animation for expanded/collapsed
                if (!isCovered) {
                    gc.style.maxHeight = ''
                    gc.style.overflow = ''
                }
                const el = scrollRef.current
                if (el) {
                    el.style.overflowY = ''
                }
                isAnimatingRef.current = false
            }, dur * 1000 + 50)

            setGraphCovered(isCovered)
            setGraphCollapsed(isCollapsed)
            setThemeColor('#ffffff')
            themeColorRef.current = '#ffffff'
        }

        const cleanup = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onCancel)
        }

        const onUp = () => {
            cleanup()
            if (rafId) cancelAnimationFrame(rafId)
            handleDraggingRef.current = false

            if (!moved) {
                // Tap — do nothing, let tab onClick handle it
                return
            }

            // Apply final position synchronously
            applyPos(lastPos)

            // Snap to nearest — biased: 40% threshold toward covered
            const p = Math.max(0, Math.min(maxDragPos, lastPos))

            let target
            if (p <= SHRINK_DIST) {
                target = p < SHRINK_DIST * 0.5 ? 'expanded' : 'collapsed'
            } else {
                const phase2Progress = (p - SHRINK_DIST) / collapsedGcH
                target = phase2Progress > 0.4 ? 'covered' : 'collapsed'
            }

            requestAnimationFrame(() => snapTo(target))
        }

        const onCancel = () => {
            cleanup()
            if (rafId) cancelAnimationFrame(rafId)
            handleDraggingRef.current = false
            if (moved) {
                applyPos(lastPos)
                requestAnimationFrame(() => snapTo(lastPos <= SHRINK_DIST ? (lastPos < SHRINK_DIST * 0.5 ? 'expanded' : 'collapsed') : 'collapsed'))
            }
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
    }, [graphCovered])

    // Pull-down-to-expand: when content is at scrollTop 0, pulling down expands the graph
    const pullDownGraphCoveredRef = useRef(false)
    useEffect(() => { pullDownGraphCoveredRef.current = graphCovered }, [graphCovered])
    const pullDownGraphCollapsedRef = useRef(false)
    useEffect(() => { pullDownGraphCollapsedRef.current = graphCollapsed }, [graphCollapsed])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        let active = false
        let startY = 0
        let collapsedGcH = 0
        let maxDragPos = 0
        let startPos = 0
        let lastPos = 0
        const easeLocal = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

        const measure = () => {
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            const heroEl = heroHeaderRef.current
            if (!gc || !graphEl) return false

            const savedGraphH = graphEl.style.height
            const savedGcH = gc.style.height
            const savedGcMax = gc.style.maxHeight
            const savedHero = heroEl ? {
                o: heroEl.style.opacity, mh: heroEl.style.maxHeight,
                pt: heroEl.style.paddingTop, pb: heroEl.style.paddingBottom,
            } : null

            graphEl.style.height = `${MIN_H}px`
            gc.style.height = ''
            gc.style.maxHeight = ''
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            collapsedGcH = gc.offsetHeight

            graphEl.style.height = savedGraphH
            gc.style.height = savedGcH
            gc.style.maxHeight = savedGcMax
            if (heroEl && savedHero) {
                heroEl.style.opacity = savedHero.o; heroEl.style.maxHeight = savedHero.mh
                heroEl.style.paddingTop = savedHero.pt; heroEl.style.paddingBottom = savedHero.pb
            }

            maxDragPos = SHRINK_DIST + collapsedGcH
            const isCov = pullDownGraphCoveredRef.current
            const isCol = pullDownGraphCollapsedRef.current
            const currentH = graphEl.offsetHeight
            if (isCov) {
                startPos = maxDragPos
            } else if (currentH <= MIN_H + 10 || isCol) {
                startPos = SHRINK_DIST
            } else {
                startPos = 0
            }
            return true
        }

        const applyPos = (pos) => {
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            const heroEl = heroHeaderRef.current
            if (!gc) return
            const p = Math.max(0, Math.min(maxDragPos, pos))

            if (p <= SHRINK_DIST) {
                const t = p / SHRINK_DIST
                const ct = easeLocal(t)
                if (graphEl) graphEl.style.height = `${MAX_H - ct * SHRINK_DIST}px`
                gc.style.height = ''
                gc.style.maxHeight = ''
                gc.style.overflow = ''
                gc.style.marginTop = '0px'
                if (heroEl) {
                    const f = easeLocal(Math.min(1, t * 2.5))
                    heroEl.style.opacity = `${1 - f}`
                    heroEl.style.maxHeight = `${(1 - f) * 80}px`
                    heroEl.style.paddingTop = `${(1 - f) * 4}px`
                    heroEl.style.paddingBottom = `${(1 - f) * 6}px`
                }
            } else {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                const cover = (p - SHRINK_DIST) / collapsedGcH
                const clipH = collapsedGcH * (1 - Math.min(1, cover))
                gc.style.height = ''
                gc.style.maxHeight = `${Math.max(4, clipH)}px`
                gc.style.overflow = 'hidden'
                gc.style.marginTop = '0px'
                if (heroEl) {
                    heroEl.style.opacity = '0'
                    heroEl.style.maxHeight = '0px'
                    heroEl.style.paddingTop = '0px'
                    heroEl.style.paddingBottom = '0px'
                }
            }
        }

        const snapTo = (state) => {
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            const heroEl = heroHeaderRef.current
            if (!gc) return
            if (!gc.style.maxHeight || gc.style.maxHeight === 'none') {
                gc.style.maxHeight = `${gc.offsetHeight}px`
                gc.style.overflow = 'hidden'
            }
            const t = '0.45s cubic-bezier(0.25, 1, 0.5, 1)'
            gc.style.transition = `max-height ${t}, margin-top ${t}`
            if (graphEl) graphEl.style.transition = `height ${t}`
            if (heroEl) heroEl.style.transition = `opacity 0.35s ease, max-height ${t}, padding ${t}`
            gc.offsetHeight

            if (state === 'expanded') {
                if (graphEl) graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                gc.style.maxHeight = `${collapsedGcH + SHRINK_DIST + 200}px`
                gc.style.overflow = ''
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
            } else if (state === 'collapsed') {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.maxHeight = `${collapsedGcH}px`
                gc.style.overflow = 'hidden'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            } else {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.maxHeight = '4px'
                gc.style.overflow = 'hidden'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            }

            const isCovered = state === 'covered'
            const isCollapsed = state === 'collapsed'
            setTimeout(() => {
                gc.style.transition = ''
                if (graphEl) graphEl.style.transition = ''
                if (heroEl) heroEl.style.transition = ''
                if (!isCovered) { gc.style.maxHeight = ''; gc.style.overflow = '' }
                el.style.overflow = ''
                el.style.overflowY = 'auto'
            }, 500)
            setGraphCovered(isCovered)
            setGraphCollapsed(isCollapsed)
            setThemeColor('#ffffff')
            themeColorRef.current = '#ffffff'
        }

        const onStart = (e) => {
            if (e.touches.length >= 2) return
            if (handleDraggingRef.current) return
            if (el.scrollTop > 1) return
            if (window.__budgeup_scrubbing?.current?.active) return
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            if (!gc || !graphEl) return
            const isCov = pullDownGraphCoveredRef.current
            const isCol = pullDownGraphCollapsedRef.current
            const currentH = graphEl.offsetHeight
            // Only activate if graph is collapsed or covered
            if (currentH > MIN_H + 10 && !isCov && !isCol) return
            active = true
            startY = e.touches[0].clientY
            lastPos = 0
        }

        const onMove = (e) => {
            if (!active) return
            if (e.touches.length >= 2) { active = false; return }
            const dy = e.touches[0].clientY - startY
            if (dy < 0) { active = false; return }
            if (el.scrollTop > 1) { active = false; return }
            e.preventDefault()

            // Measure on first real move
            if (lastPos === 0 && dy > 4) {
                if (!measure()) { active = false; return }
                const gc = graphCardRef.current
                const graphEl = graphContainerRef.current
                const heroEl = heroHeaderRef.current
                if (gc) gc.style.transition = 'none'
                if (graphEl) graphEl.style.transition = 'none'
                if (heroEl) heroEl.style.transition = 'none'
            }

            if (dy <= 4) return
            lastPos = Math.max(0, Math.min(maxDragPos, startPos - dy))
            applyPos(lastPos)
        }

        const onEnd = () => {
            if (!active) return
            active = false
            if (lastPos === 0) return

            applyPos(lastPos)
            const p = Math.max(0, Math.min(maxDragPos, lastPos))
            let target
            if (p <= SHRINK_DIST) {
                target = p < SHRINK_DIST * 0.5 ? 'expanded' : 'collapsed'
            } else {
                const phase2Progress = (p - SHRINK_DIST) / collapsedGcH
                target = phase2Progress > 0.4 ? 'covered' : 'collapsed'
            }
            requestAnimationFrame(() => snapTo(target))
        }

        el.addEventListener('touchstart', onStart, { passive: true })
        el.addEventListener('touchmove', onMove, { passive: false })
        el.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchmove', onMove)
            el.removeEventListener('touchend', onEnd)
        }
    }, [])

    // Block scroll when 2+ fingers are touching (prevents pinch-zoom scroll conflicts)
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const onTouchMove = (e) => {
            if (e.touches.length >= 2) {
                e.preventDefault()
            }
        }
        el.addEventListener('touchmove', onTouchMove, { passive: false })
        return () => el.removeEventListener('touchmove', onTouchMove)
    }, [])

    const animateScroll = useCallback((el, target, durationOverride, onComplete) => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        const start = el.scrollTop
        const diff = target - start
        const dist = Math.abs(diff)
        if (dist < 1) { isAnimatingRef.current = false; onComplete?.(); return }
        // Duration proportional to distance: 250-450ms
        const duration = durationOverride ?? Math.max(250, Math.min(450, dist * 4))
        isAnimatingRef.current = true
        animatingStartRef.current = performance.now()
        isSnappingRef.current = true
        const startTime = performance.now()
        const step = (now) => {
            const t = Math.min(1, (now - startTime) / duration)
            if (t >= 1) {
                // Final frame: use exact integer target to avoid sub-pixel snap
                el.scrollTop = target
                applyScrollStyles(target)
                animFrameRef.current = null
                isAnimatingRef.current = false
                isSnappingRef.current = false
                onComplete?.()
                return
            }
            const val = start + diff * easeOut(t)
            el.scrollTop = val
            applyScrollStyles(val)
            animFrameRef.current = requestAnimationFrame(step)
        }
        animFrameRef.current = requestAnimationFrame(step)
    }, [applyScrollStyles])

    const isAnimatingRef = useRef(false)
    const animatingStartRef = useRef(0)

    const handleScroll = useCallback(() => {
        if (isAnimatingRef.current || isTabSwitchingRef.current) {
            // Safety: if stuck animating for over 1s, force unlock
            if (isAnimatingRef.current && performance.now() - animatingStartRef.current > 1000) {
                isAnimatingRef.current = false
                isTabSwitchingRef.current = false
            } else {
                return
            }
        }
        const el = scrollRef.current
        if (!el) return
        applyScrollStyles(el.scrollTop)

        // Show/hide tab bar bottom line based on content scroll
        if (tabsBarRef.current && contentWrapRef.current) {
            const tabsBottom = tabsBarRef.current.getBoundingClientRect().bottom
            const contentTop = contentWrapRef.current.getBoundingClientRect().top
            tabsBarRef.current.style.boxShadow = contentTop < tabsBottom ? '0 1px 0 rgba(0,0,0,0.06)' : 'none'
        }

        // Detect which expanded source row takes up the most viewport space
        if (expandedSources.size > 0) {
            const rows = el.querySelectorAll('[data-source-row]')
            const stickyHeader = el.querySelector('[data-sticky-header]')
            const headerBottom = stickyHeader ? stickyHeader.getBoundingClientRect().bottom : el.getBoundingClientRect().top
            const containerBottom = el.getBoundingClientRect().bottom
            let best = null
            let bestArea = 0
            for (const row of rows) {
                const sourceId = row.dataset.sourceId
                if (!expandedSources.has(sourceId)) continue
                const rect = row.getBoundingClientRect()
                const visibleTop = Math.max(rect.top, headerBottom)
                const visibleBottom = Math.min(rect.bottom, containerBottom)
                const visibleHeight = visibleBottom - visibleTop
                if (visibleHeight > bestArea) {
                    bestArea = visibleHeight
                    best = sourceId
                }
            }
            setVisibleExpandedSource(prev => prev === best ? prev : best)
        } else {
            setVisibleExpandedSource(prev => prev === null ? prev : null)
        }
    }, [applyScrollStyles, activeTab, expandedSources])

    // Apply saved scroll position + graph state immediately on mount to prevent flash
    useLayoutEffect(() => {
        // Restore graph visual state to match graphCovered / graphCollapsed
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (graphCovered) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (gc) { gc.style.height = ''; gc.style.maxHeight = '4px'; gc.style.overflow = 'hidden'; gc.style.marginTop = '0px' }
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        } else if (graphCollapsed) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        }
    }, [])

    // Re-apply graph state after data loads
    useLayoutEffect(() => {
        if (!dbLoaded) return
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (graphCovered) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (gc) { gc.style.height = ''; gc.style.maxHeight = '4px'; gc.style.overflow = 'hidden'; gc.style.marginTop = '0px' }
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        } else if (graphCollapsed) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        }
    }, [dbLoaded])





    // Pin scroll when keyboard dismisses (any input blur)
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const onFocusOut = (e) => {
            if (e.relatedTarget) return
            const scrollBefore = el.scrollTop
            const savedOverflow = el.style.overflowY
            el.style.overflowY = 'hidden'
            el.scrollTop = scrollBefore
            const start = performance.now()
            const pin = () => {
                el.scrollTop = scrollBefore
                if (performance.now() - start < 500) {
                    requestAnimationFrame(pin)
                } else {
                    el.style.overflowY = savedOverflow || 'auto'
                }
            }
            requestAnimationFrame(pin)
        }
        el.addEventListener('focusout', onFocusOut)
        return () => el.removeEventListener('focusout', onFocusOut)
    }, [])

    // Tap Home while already on Home → scroll to top to expand graph
    useEffect(() => {
        const handler = () => {
            const el = scrollRef.current
            if (!el) return
            if (el.scrollTop > 0) {
                animateScroll(el, 0, 300)
            }
        }
        window.addEventListener('nav-tap-again', handler)
        return () => window.removeEventListener('nav-tap-again', handler)
    }, [animateScroll])

    // Handle FAB actions from BottomNav
    useEffect(() => {
        const scrollToSection = (isExpense) => {
            const el = scrollRef.current
            if (!el) return
            setTimeout(() => {
                const selector = isExpense ? '[data-section="expenses"]' : '[data-section="income"]'
                const section = el.querySelector(selector)
                if (section) {
                    const stickyHeader = el.querySelector('[data-sticky-header]')
                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                    const target = section.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH
                    animateScroll(el, Math.max(0, target + 200), 350)
                } else {
                    animateScroll(el, 0, 350)
                }
            }, 50)
        }

        const openAddPicker = (type) => {
            const targetTab = type === 'expense' ? 'expenses' : 'income'
            if (activeTab !== targetTab) handleTabChange(targetTab)
            addPickerScrollPos.current = scrollRef.current?.scrollTop ?? null
            setAddingSourceType(type)
        }

        const handler = (e) => {
            const { action } = e.detail || {}
            if (!action) return

            if (action === 'update-balance') {
                openFabBalance()
                return
            }

            if (action.startsWith('add-source:')) {
                const [, sourceId, type] = action.split(':')
                const isExp = type === 'expense'
                const el = scrollRef.current
                const savedScroll = el ? el.scrollTop : 0
                // Step 1: switch to regular tab if needed, collapse graph
                const targetTab = isExp ? 'expenses' : 'income'
                if (activeTab !== targetTab) setActiveTab(targetTab)
                collapseGraph()
                // Lock scroll during reflow
                if (el) {
                    isAnimatingRef.current = true
                    el.scrollTop = savedScroll
                    applyScrollStyles(savedScroll)
                }
                // Step 2: add source or add another entry if already exists
                const key = isExp ? 'expenseSources' : 'incomeSources'
                const sources = formData[key] || []
                {
                    if (!sources.includes(sourceId)) {
                        updateField(key, [...sources, sourceId])
                    } else {
                        // Source already exists — add another entry
                        const cat = CATEGORY_MAP[sourceId]
                        if (cat) {
                            const newEntryId = `${cat.id}_${Date.now()}`
                            const newEntry = {
                                id: newEntryId,
                                amount: '',
                                frequency: cat.defaultFrequency,
                                nextDate: '',
                                months: [...(cat.defaultMonths || [])],
                                dates: { ...(cat.defaultDates || {}) },
                                instalmentAmounts: {},
                            }
                            setFormData(prev => ({
                                ...prev,
                                [cat.formKey]: [...(prev[cat.formKey] || []), newEntry],
                            }))
                            // Scroll to the new entry after expand settles
                            setTimeout(() => {
                                const entryEl = document.querySelector(`[data-entry-id="${newEntryId}"]`)
                                if (entryEl && el) {
                                    const entryRect = entryEl.getBoundingClientRect()
                                    const containerRect = el.getBoundingClientRect()
                                    el.scrollBy({ top: entryRect.top - containerRect.top - 240, behavior: 'smooth' })
                                }
                            }, 100)
                        }
                    }
                    setExpandedSources(prev => new Set(prev).add(sourceId))
                }
                // Scroll to the source row (only for NEW sources, not additional instances)
                if (!sources.includes(sourceId)) {
                    let scrollAttempts = 0
                    const tryScroll = () => {
                        if (!el) return
                        isAnimatingRef.current = false
                        const row = el.querySelector(`[data-source-id="${sourceId}"]`)
                        if (row && row.offsetHeight > 50) {
                            const stickyHeader = el.querySelector('[data-sticky-header]')
                            const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                            const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                            el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
                        } else if (scrollAttempts++ < 20) {
                            setTimeout(tryScroll, 100)
                        }
                    }
                    setTimeout(tryScroll, 200)
                }
                return
            }

            if (action.startsWith('add-flex:')) {
                const [, sourceId, type] = action.split(':')
                const isExp = type === 'expense'
                const targetTab = isExp ? 'expenses' : 'income'
                if (activeTab !== targetTab) setActiveTab(targetTab)
                collapseGraph()
                const flexSrc = isExp ? FLEX_EXPENSE_SOURCES : FLEX_INCOME_SOURCES
                const srcDef = flexSrc.find(s => s.id === sourceId)
                setFormData(prev => {
                    const key = isExp ? 'flexExpenseSources' : 'flexIncomeSources'
                    const existing = prev[key] || []
                    if (existing.includes(sourceId)) return prev
                    return {
                        ...prev,
                        [key]: [...existing, sourceId],
                        flexSourceData: { ...prev.flexSourceData, [sourceId]: { frequency: srcDef?.defaultFreq || 'monthly' } },
                    }
                })
                setExpandedSources(prev => new Set(prev).add(sourceId))
                // Scroll to the new source after render
                setTimeout(() => {
                    const el = scrollRef.current
                    if (!el) return
                    const row = el.querySelector(`[data-source-id="${sourceId}"]`)
                    if (row) {
                        const stickyHeader = el.querySelector('[data-sticky-header]')
                        const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                        const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                        el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
                    }
                }, 300)
                return
            }

            if (action === 'add-regular-income') return
            if (action === 'add-regular-expense') return

            if (action === 'add-oneoff-income' || action === 'add-income') {
                handleTabChange('income')
            }
            if (action === 'add-oneoff-expense' || action === 'add-expense') {
                handleTabChange('expenses')
            }
        }

        window.addEventListener('nav-fab-action', handler)
        window.dispatchEvent(new CustomEvent('dashboard-ready'))

        return () => window.removeEventListener('nav-fab-action', handler)
    }, [animateScroll, handleTabChange, activeTab])

    const freqView = 'Yearly'

    // Persist formData changes back to localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            const parsed = saved ? JSON.parse(saved) : {}
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData }))
        } catch { /* ignore */ }
        // Expose active sources so BottomNav can filter its carousel
        window.__budgeup_active_sources = {
            income: formData.incomeSources || [],
            expense: formData.expenseSources || [],
            flexIncome: formData.flexIncomeSources || [],
            flexExpense: formData.flexExpenseSources || [],
        }
    }, [formData])

    const updateField = useCallback((key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }, [])

    const terms = formData.termDates?.terms || []
    const originBalance = parseMoney(formData.balance)
    const overdraftNum = formData.overdraft ? parseMoney(formData.overdraft) : undefined

    // Projection balance (green line): anchored at join date, walked forward to today
    const todayStr = toLocalDate(new Date())
    const anchorDate = joinDate || getGraphStart()
    const allSourceIds = [...FIXED_INCOME_SOURCES.map(s => s.id), ...FIXED_EXPENSE_SOURCES.map(s => s.id)]
    const _allEventsForProjection = buildDashboardGraphEvents({ ...formData, incomeSources: allSourceIds, expenseSources: allSourceIds }, { filterByGraphStart: false })
    const projectionBalance = (() => {
        // Walk forward from originBalance at anchor date through events to today
        // Discrete events: applied on their date
        const discreteEvents = _allEventsForProjection
            .filter(e => !e.removed && e.date >= anchorDate && e.date <= todayStr && e.editType !== 'weeklySpend')
        // Weekly spend: simple daily rate (weeklySpend / 7) — same as pastPath
        const weeklyAmt = parseMoney(formData.weeklySpend)
        const dailyRate = weeklyAmt / 7
        const anchorD = new Date(anchorDate + 'T00:00:00')
        const todayD = new Date(todayStr + 'T00:00:00')
        const daysBetween = Math.max(0, Math.round((todayD - anchorD) / 86400000)) // include anchor day
        const totalDailySpend = dailyRate * daysBetween
        let bal = originBalance
        for (const evt of discreteEvents) {
            bal += evt.type === 'income' ? evt.amount : -evt.amount
        }
        bal -= totalDailySpend
        // DEBUG
        return bal
    })()

    // Actual balance: latest balance_history entry, or formData.balance if no history
    const balanceNum = (() => {
        if (balanceHistory.length > 0) {
            return balanceHistory[0].balance
        }
        return originBalance
    })()

    // Source lists from categories config
    const INCOME_SOURCES = FIXED_INCOME_SOURCES
    const EXPENSE_SOURCES = FIXED_EXPENSE_SOURCES

    const events = buildDashboardGraphEvents(formData)
    const exactGraphStart = getGraphStart() // exact date string e.g. '2025-10-20'
    // Build all events (ignoring source toggles) for computing yearly amounts when sources are off
    const allEvents = _allEventsForProjection

    // Calculate totals from formData, counting actual occurrences between start/end dates
    const removedSet = new Set(formData.removedEvents || [])
    const dashCalcEntryTotal = (entry, cat) => calcEntryTotal(entry, cat, { removedSet, terms })

    const yearlyIncome = INCOME_CATEGORIES.reduce((total, cat) => {
        return total + (formData[cat.formKey] || []).reduce((s, entry) => s + dashCalcEntryTotal(entry, cat), 0)
    }, 0)
    const yearlyExpense = EXPENSE_CATEGORIES.reduce((total, cat) => {
        return total + (formData[cat.formKey] || []).reduce((s, entry) => s + dashCalcEntryTotal(entry, cat), 0)
    }, 0)
    const weeklySpendTotal = events.filter(e => e.editType === 'weeklySpend' && !e.removed).reduce((s, e) => s + e.amount, 0)
    const fixedNet = yearlyIncome - yearlyExpense

    // Count active sources
    const activeIncomeCount = (formData.incomeSources || []).length
    const activeExpenseCount = (formData.expenseSources || []).length

    // Frequency multipliers for display
    const freqMultiplier = { Weekly: 1 / 52, Monthly: 1 / 12, Termly: 1 / (terms.length || 2), Yearly: 1 }
    const displayNet = Math.round(fixedNet * freqMultiplier[freqView])
    const freqSuffix = { Weekly: '/wk', Monthly: '/mo', Termly: '/term', Yearly: '/yr' }

    // On-track: compare actual balance vs green line at today
    // Green line is anchored at projectionBalance at today (past events are walked backwards from it)
    // So green line value at today = projectionBalance, actual = balanceNum
    const projBal = parseMoney(projectionBalance)
    const goalsData = (() => {
        const diff = Math.round((balanceNum - projBal) * 100) / 100
        return { diff, isAhead: diff > 0, isOnTrack: Math.abs(diff) < 10 }
    })()

    // Hero metric: actual balance vs predicted (green line) for today
    const heroMetric = (() => {
        const { diff, isAhead, isOnTrack } = goalsData
        const sym = getCurrencySymbol()
        if (isOnTrack) return { color: '#147b75', value: 'On track', label: 'vs projection' }
        const absDiff = Math.round(Math.abs(diff) * 100) / 100
        const formatted = `${sym}${absDiff.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
        if (isAhead) return { color: '#147b75', value: `+${formatted}`, label: 'above projection' }
        return { color: '#e06470', value: `\u2212${formatted}`, label: 'below projection' }
    })()

    // Calculate per-source yearly amounts (full year from first term, regardless of graph view)
    const getSourceYearly = (editTypes) => {
        let total = 0
        for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
            const entries = formData[cat.formKey] || []
            for (const entry of entries) {
                const entryEditType = entry.id ? `${cat.id}:${entry.id}` : cat.id
                if (!editTypes.includes(entryEditType)) continue
                total += dashCalcEntryTotal(entry, cat)
            }
        }
        return total
    }

    const getSourceRemovedCount = (editTypes) => {
        // Only count removed events that actually appear on the graph
        return allEvents.filter(e => (editTypes.includes(e.editType) || editTypes.some(et => e.editType?.startsWith(et + ':'))) && e.removed && !e.noDot).length
    }

    const restoreSourceEvents = (editTypes) => {
        const removed = formData.removedEvents || []
        const keep = removed.filter(key => !editTypes.some(et => key.startsWith(et + ':')))
        analytics.track(DASHBOARD_EVENTS.EVENT_RESTORED, { edit_types: editTypes, count: removed.length - keep.length })
        updateField('removedEvents', keep)
    }

    const getSourceOverrideCount = (editTypes) => {
        const overrides = formData.amountOverrides || {}
        // Only count overrides where the event actually exists on the graph
        return Object.keys(overrides).filter(key => {
            if (!editTypes.some(et => key.startsWith(et + ':'))) return false
            const parts = key.split(':')
            const date = parts[parts.length - 1]
            const et = parts.slice(0, -1).join(':')
            return allEvents.some(e => (e.editType === et || editTypes.includes(e.editType)) && e.date === date && !e.removed)
        }).length
    }

    const clearSourceOverrides = (editTypes) => {
        const overrides = { ...(formData.amountOverrides || {}) }
        for (const key of Object.keys(overrides)) {
            if (editTypes.some(et => key.startsWith(et + ':'))) delete overrides[key]
        }
        updateField('amountOverrides', overrides)
    }

    // Check if a source has any data configured
    const sourceHasData = (sourceId) => {
        const cat = CATEGORY_MAP[sourceId]
        if (cat) {
            const entries = formData[cat.formKey] || []
            return entries.some(e => parseMoney(e.amount) > 0)
        }
        return false
    }

    // Determine which sources should be visible (have data OR are in active list)
    const isSourceVisible = (sourceId, sourcesList) => {
        return (sourcesList || []).includes(sourceId)
    }

    const deleteSource = (sourceId, isExpense) => {
        const prevFormData = { ...formData }
        const cat = CATEGORY_MAP[sourceId]
        const entryCount = cat ? (formData[cat.formKey] || []).length : 1
        const sourceLabel = cat?.label || sourceId
        const deleteLabel = entryCount > 1 ? `${entryCount} ${sourceLabel}s deleted` : `${sourceLabel} deleted`
        analytics.track(DASHBOARD_EVENTS.SOURCE_REMOVED, {
            source_id: sourceId,
            source_type: isExpense ? 'expense' : 'income',
        })

        const remainingSources = isExpense
            ? (formData.expenseSources || []).filter(s => s !== sourceId)
            : (formData.incomeSources || []).filter(s => s !== sourceId)
        const otherSectionSources = isExpense
            ? (formData.incomeSources || [])
            : (formData.expenseSources || [])
        const sectionWillBeEmpty = remainingSources.length === 0
        const willBeEmpty = sectionWillBeEmpty && otherSectionSources.length === 0
        const el = scrollRef.current
        const sectionAttr = isExpense ? 'expenses' : 'income'

        // If this section will be empty, start collapse animation
        if (sectionWillBeEmpty) {
            setCollapsingSections(prev => new Set(prev).add(sectionAttr))
        }

        // Scroll to the row above the deleted one
        if (el) {
            const deletedRow = el.querySelector(`[data-source-id="${sourceId}"]`)
            if (deletedRow) {
                const prevRow = deletedRow.previousElementSibling
                if (prevRow && prevRow.hasAttribute('data-source-row')) {
                    const headerH = stickyHeaderRef.current?.offsetHeight || 0
                    const targetScroll = prevRow.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                    if (targetScroll >= 0 && targetScroll < el.scrollTop) {
                        const spacer = document.createElement('div')
                        spacer.style.height = (el.scrollTop + 200) + 'px'
                        spacer.style.flexShrink = '0'
                        el.appendChild(spacer)
                        isAnimatingRef.current = true
                        animateScroll(el, targetScroll, 600, () => { spacer.remove() })
                    }
                } else if (el.scrollTop > 0) {
                    // No previous row — scroll to top
                    const spacer = document.createElement('div')
                    spacer.style.height = (el.scrollTop + 200) + 'px'
                    spacer.style.flexShrink = '0'
                    el.appendChild(spacer)
                    isAnimatingRef.current = true
                    animateScroll(el, 0, 600, () => { spacer.remove() })
                }
            }
        }

        // Delay state removal so the row collapse animation plays out
        const removeFromState = () => {
            setHiddenSources(prev => {
                if (!prev.has(sourceId)) return prev
                const next = new Set(prev)
                next.delete(sourceId)
                localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...next]))
                return next
            })
            if (isExpense) {
                updateField('expenseSources', remainingSources)
            } else {
                updateField('incomeSources', remainingSources)
            }
            // Clear category entries
            if (cat) {
                updateField(cat.formKey, [])
            }
            if (expandedSources.has(sourceId)) {
                setExpandedSources(prev => { const n = new Set(prev); n.delete(sourceId); return n })
            }
        }

        // Wait for row swipe animation before removing from state
        setTimeout(() => {
            removeFromState()
            // If section will be empty, remove from DOM after collapse animation
            if (sectionWillBeEmpty) {
                setTimeout(() => {
                    setCollapsingSections(prev => {
                        const next = new Set(prev)
                        next.delete(sectionAttr)
                        return next
                    })
                }, 400)
            }
            // Show undo toast
            if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current)
            setSkipToast({
                label: deleteLabel,
                undoFn: () => setFormData(prevFormData),
                sourceId,
            })
            skipToastTimerRef.current = setTimeout(() => setSkipToast(null), 5000)
        }, 500)
    }

    const [collapsingSections, setCollapsingSections] = useState(new Set()) // 'income' | 'expenses'

    const [addingSourceType, setAddingSourceType] = useState(null) // 'income' | 'expense' | null
    const [pickerClosing, setPickerClosing] = useState(false)
    const addPickerScrollPos = useRef(null)

    const closeAddPicker = () => {
        // Animate dropdown out, then scroll back, then clean up markers
        setPickerClosing(true)
        const savedPos = addPickerScrollPos.current
        addPickerScrollPos.current = null
        const clearMarkers = () => {
            setExpandedSources(prev => {
                const next = new Set(prev)
                next.delete('__add_income__')
                next.delete('__add_expense__')
                return next
            })
        }
        setTimeout(() => {
            setAddingSourceType(null)
            setPickerClosing(false)
            // Scroll back first (spacer still present), then remove markers after
            if (savedPos != null && scrollRef.current) {
                requestAnimationFrame(() => {
                    const el = scrollRef.current
                    if (!el) return
                    const dist = Math.abs(el.scrollTop - savedPos)
                    animateScroll(el, savedPos, Math.max(350, Math.min(600, dist)), clearMarkers)
                })
            } else {
                clearMarkers()
            }
        }, 200)
    }

    const addSource = (sourceId, isExpense) => {
        analytics.track(DASHBOARD_EVENTS.SOURCE_ADDED, {
            source_id: sourceId,
            source_type: isExpense ? 'expense' : 'income',
        })
        addPickerScrollPos.current = null
        // Remove dropdown and expand source in same render to avoid layout jump
        setPickerClosing(false)
        setAddingSourceType(null)
        if (isExpense) {
            const sources = formData.expenseSources || []
            if (!sources.includes(sourceId)) {
                updateField('expenseSources', [...sources, sourceId])
            }
        } else {
            const sources = formData.incomeSources || []
            if (!sources.includes(sourceId)) {
                updateField('incomeSources', [...sources, sourceId])
            }
        }
        setExpandedSources(prev => new Set(prev).add(sourceId))
    }

    const toggleSourceVisibility = (id) => {
        setHiddenSources(prev => {
            const next = new Set(prev)
            const wasHidden = next.has(id)
            if (wasHidden) {
                next.delete(id)
            } else {
                next.add(id)
            }
            analytics.track(DASHBOARD_EVENTS.SOURCE_VISIBILITY_TOGGLED, {
                source_id: id,
                action: wasHidden ? 'shown' : 'hidden',
            })
            localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...next]))
            return next
        })
    }

    // Map source ids to editTypes for yearly calc (category editType = category id)
    const incomeEditTypeMap = Object.fromEntries(
        INCOME_CATEGORIES.map(cat => {
            const entries = formData[cat.formKey] || []
            return [cat.id, entries.length > 0 ? entries.map((e, i) => e.id ? `${cat.id}:${e.id}` : cat.id) : [cat.id]]
        })
    )
    const expenseEditTypeMap = Object.fromEntries(
        EXPENSE_CATEGORIES.map(cat => {
            const entries = formData[cat.formKey] || []
            return [cat.id, entries.length > 0 ? entries.map((e, i) => e.id ? `${cat.id}:${e.id}` : cat.id) : [cat.id]]
        })
    )

    // Map expandedSources to currentEventType for dot highlighting
    // Only show dots when the expanded dropdown is actually visible in the scroll viewport
    const sourceToEditType = { ...incomeEditTypeMap, ...expenseEditTypeMap }
    // Flex sources use their ID directly as editType
    for (const id of [...(formData.flexIncomeSources || []), ...(formData.flexExpenseSources || [])]) {
        sourceToEditType[id] = [id]
    }
    // Find expanded source in current tab for dot highlighting
    const activeSource = (() => {
        const tabSources = activeTab === 'income'
            ? INCOME_SOURCES.map(s => s.id)
            : activeTab === 'expenses'
                ? EXPENSE_SOURCES.map(s => s.id)
                : []
        // Only highlight if the expanded source is actually visible on screen
        if (visibleExpandedSource && expandedSources.has(visibleExpandedSource) && tabSources.includes(visibleExpandedSource)) {
            return visibleExpandedSource
        }
        return null
    })()
    const currentEventType = activeSource && sourceToEditType[activeSource]
        ? (sourceToEditType[activeSource].length > 1
            ? sourceToEditType[activeSource][visibleEntryIndex] || sourceToEditType[activeSource][0]
            : sourceToEditType[activeSource][0])
        : null
    // All edit types for the active source (including base category ID) — used to unhide dots
    const activeSourceEditTypes = activeSource
        ? new Set([activeSource, ...(sourceToEditType[activeSource] || [])])
        : new Set()

    // No longer modify graph visibility when "show all" is toggled
    const goalsVisibleEditTypes = new Set()

    const handleEventClick = useCallback((evt, e) => {
        analytics.track(DASHBOARD_EVENTS.GRAPH_EVENT_CLICKED, {
            event_type: evt.type,
            edit_type: evt.editType,
        })
        const rect = e.currentTarget.getBoundingClientRect()
        setEditWarning('')
        setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top + rect.height / 2 })
        setEditAmount(String(evt.amount))
        // Find nearby events on same date
        const allEvts = buildDashboardGraphEvents(formData)
        const sameDate = allEvts.filter(ev => ev.date === evt.date && !ev.noDot && ev.amount > 0)
        setNearbyEvents(sameDate.length > 1 ? sameDate : [])
        setNearbyIdx(sameDate.length > 1 ? Math.max(0, sameDate.findIndex(ev => ev.editType === evt.editType && ev.amount === evt.amount)) : 0)
    }, [formData])


    const handleOverdraftClick = useCallback(({ clickX, clickY }) => {
        setEditingOverdraft({ clickX, clickY })
        setEditOverdraftAmount(String(overdraftNum || ''))
    }, [overdraftNum])

    const incomeEmpty = INCOME_SOURCES.filter(s => isSourceVisible(s.id, formData.incomeSources)).length === 0
    const expenseEmpty = EXPENSE_SOURCES.filter(s => isSourceVisible(s.id, formData.expenseSources)).length === 0
    const tabContentEmpty = (activeTab === 'income' && incomeEmpty)

    // Compute active source label for hero header
    const activeSourceLabel = (() => {
        if (!activeSource) return null
        const cat = CATEGORY_MAP[activeSource]
        if (!cat) return null
        const entries = formData[cat.formKey] || []
        const hasMulti = entries.filter(e => parseMoney(e.amount) > 0).length > 1
        return hasMulti ? `${cat.label} ${visibleEntryIndex + 1}` : cat.label
    })()
    const activeSourceIsIncome = activeSource && INCOME_CATEGORIES.some(c => c.id === activeSource)

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%', background: '#fff', overflowX: 'hidden',
            fontFamily: 'Nunito, sans-serif',
        }}>
            {/* Scrollable content */}
            <div
                data-scroll-container
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflowY: showInitialBalancePopup ? 'hidden' : 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'none',
                    overflowAnchor: 'auto',
                    paddingBottom: 'calc(120px + env(safe-area-inset-bottom))',
                    background: '#ffffff',
                }}
            >
                {/* White cover so grey doesn't show behind safe area on overscroll */}
                <div style={{ position: 'sticky', top: 0, zIndex: 11, height: 'env(safe-area-inset-top, 0px)', background: '#fff', marginBottom: 'calc(-1 * env(safe-area-inset-top, 0px))' }} />
                {/* Graph + tabs — sticky, shrinks on scroll */}
                <div data-sticky-header ref={stickyHeaderRef} style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 0, boxShadow: 'none' }}>

                    {/* Graph area — clips when covered, blocks scroll */}
                    <div ref={graphCardRef} onTouchMove={e => e.preventDefault()} style={{
                        margin: '0 8px',
                        overflow: 'hidden',
                        touchAction: 'none',
                    }}>

                        {/* Balance entry banner — shown when no balance in user_profiles */}
                        {showInitialBalancePopup && !dbLoaded && (
                            <div style={{
                                margin: '8px 12px 8px', padding: '14px 16px',
                                background: '#f5f5f5', borderRadius: 12,
                            }}>
                                <div style={{ width: '55%', height: 14, borderRadius: 7, background: '#e8e8e8', marginBottom: 10 }} />
                                <div style={{ width: '85%', height: 10, borderRadius: 5, background: '#ececec', marginBottom: 6 }} />
                                <div style={{ width: '70%', height: 10, borderRadius: 5, background: '#ececec', marginBottom: 12 }} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1, height: 40, borderRadius: 10, background: '#e8e8e8' }} />
                                    <div style={{ width: 80, height: 40, borderRadius: 10, background: '#e8e8e8' }} />
                                </div>
                            </div>
                        )}
                        {showInitialBalancePopup && dbLoaded && (
                            <div style={{
                                margin: '8px 12px 8px', padding: balanceBannerDismissing ? 0 : '14px 16px 16px',
                                background: '#fdf0f1', border: '1px solid #e06470',
                                borderRadius: 12,
                                animation: balanceBannerDismissing ? 'none' : 'fadeIn 0.3s ease',
                                maxHeight: balanceBannerDismissing ? 0 : 300,
                                opacity: balanceBannerDismissing ? 0 : 1,
                                overflow: 'hidden',
                                transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, padding 0.35s cubic-bezier(0.4,0,0.2,1), margin 0.35s cubic-bezier(0.4,0,0.2,1)',
                                marginBottom: balanceBannerDismissing ? 0 : 12,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                    <AlertTriangle size={16} color="#e06470" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                    <p style={{
                                        fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                        color: '#c0392b', margin: 0,
                                    }}>Enter your bank balance</p>
                                </div>
                                <p style={{
                                    fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                    color: '#b03a2e', margin: '0 0 3px', lineHeight: 1.4,
                                }}>You need to enter your current bank balance before you can use the app.</p>
                                <p style={{
                                    fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                    color: '#c0928f', margin: '0 0 12px',
                                }}>Add up all your accounts — a rough estimate is fine. Don't include savings or overdraft.</p>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        onClick={() => setInitialBalanceNegative(v => !v)}
                                        style={{
                                            background: initialBalanceNegative ? '#e06470' : '#147b75',
                                            color: '#fff',
                                            border: 'none', borderRadius: 8,
                                            width: 32, height: 40,
                                            fontSize: 18, fontWeight: 700,
                                            cursor: 'pointer', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: 'Nunito, sans-serif',
                                        }}
                                    >
                                        {initialBalanceNegative ? '−' : '+'}
                                    </button>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', flex: 1,
                                        background: '#fff', borderRadius: 8, border: '1px solid #e0c0c0',
                                        padding: '0 12px', height: 40, gap: 4,
                                    }}>
                                        <span style={{
                                            fontSize: 15, fontWeight: 700, color: '#cba0a0', fontFamily: 'Nunito, sans-serif',
                                        }}>{getCurrencySymbol()}</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={initialBalanceRaw}
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/[^0-9.]/g, '')
                                                const parts = val.split('.')
                                                if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                                                if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
                                                const [int, dec] = val.split('.')
                                                const formattedInt = int ? new Intl.NumberFormat('en-GB').format(Number(int)) : ''
                                                setInitialBalanceRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
                                            }}
                                            ref={(el) => {
                                                if (el) el.focus({ preventScroll: true })
                                            }}
                                            style={{
                                                flex: 1, border: 'none', background: 'transparent',
                                                fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                                color: '#000', outline: 'none', padding: 0,
                                            }}
                                        />
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const abs = parseMoney(initialBalanceRaw)
                                            if (abs === 0) return
                                            const n = initialBalanceNegative ? -abs : abs
                                            const val = String(n)
                                            const today = toLocalDate(new Date())
                                            originSetRef.current = true
                                            updateField('balance', val)
                                            if (userIdRef.current) {
                                                saveUserFinances(userIdRef.current, {
                                                    balance: val,
                                                    university: formData.university,
                                                    overdraft: formData.overdraft,
                                                    savings: formData.savings,
                                                    weeklySpend: formData.weeklySpend,
                                                    weeklySpendNonTerm: formData.weeklySpendNonTerm,
                                                    weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                                                })
                                                saveBalanceHistory(userIdRef.current, n)
                                            }
                                            analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
                                                balance_range: getBalanceRange(n),
                                                is_first_recording: true,
                                                entry_method: 'initial_popup',
                                            })
                                            localStorage.setItem('budgeup_balance_last_date', today)
                                            setBalanceHistory(prev => {
                                                const entry = { balance: n, recorded_date: today, source: 'manual' }
                                                return [entry, ...prev]
                                            })
                                            // Animate shrink then remove
                                            setBalanceBannerDismissing(true)
                                            setTimeout(() => setShowInitialBalancePopup(false), 380)
                                        }}
                                        style={{
                                            height: 40, padding: '0 18px', border: 'none', borderRadius: 8,
                                            background: (parseMoney(initialBalanceRaw)) === 0
                                                ? '#ddd' : '#e06470',
                                            cursor: (parseMoney(initialBalanceRaw)) === 0
                                                ? 'not-allowed' : 'pointer',
                                            fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                            color: '#fff', flexShrink: 0,
                                            boxShadow: (parseMoney(initialBalanceRaw)) === 0
                                                ? 'none' : '0 2px 6px rgba(224,100,112,0.35)',
                                        }}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Balance hero header */}
                        <div ref={heroHeaderRef} style={{
                            padding: '12px 18px 6px',
                            opacity: showInitialBalancePopup ? 0.35 : 1,
                            pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                            overflow: 'hidden',
                        }}>
                            {/* Row 1: Balance + filter button */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    {!dbLoaded ? (
                                        <div style={{ width: 140, height: 28, borderRadius: 8, background: '#e8e8e8' }} />
                                    ) : (
                                        <p style={{
                                            margin: 0, fontSize: 30, fontWeight: 800,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: balanceNum < 0 ? '#e06470' : '#1a1a1a',
                                            lineHeight: 1,
                                        }}>
                                            {balanceNum < 0 ? '\u2212' : ''}{getCurrencySymbol()}{Math.abs(balanceNum).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    )}
                                    {/* Active source label */}
                                    {activeSourceLabel && (
                                        <div style={{
                                            background: activeSourceIsIncome ? '#147b75' : '#e06470',
                                            borderRadius: 20, padding: '6px 20px',
                                            boxShadow: activeSourceIsIncome
                                                ? '0 2px 8px rgba(20,123,117,0.3)'
                                                : '0 2px 8px rgba(224,100,112,0.3)',
                                            animation: 'fadeSlideIn 0.25s ease',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <span style={{
                                                fontSize: 12, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                color: '#fff', letterSpacing: 0.3, lineHeight: 1,
                                            }}>
                                                {activeSourceLabel}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {/* Zoom out + Filter buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {/* Zoom out button */}
                                    <button
                                        onClick={() => zoomOutRef.current?.()}
                                        style={{
                                            background: '#f5f7f7',
                                            border: 'none',
                                            borderRadius: '50%', cursor: 'pointer',
                                            width: 34, height: 34,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            opacity: graphIsZoomed ? 1 : 0,
                                            pointerEvents: graphIsZoomed ? 'auto' : 'none',
                                            transform: graphIsZoomed ? 'scale(1)' : 'scale(0.85)',
                                            transition: 'all 0.25s ease',
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8" />
                                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                            <line x1="8" y1="11" x2="14" y2="11" />
                                        </svg>
                                    </button>
                                    {/* Filter button */}
                                    <div ref={graphFilterRef} style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => showGraphFilter ? closeGraphFilter() : setShowGraphFilter(true)}
                                            style={{
                                                background: showGraphFilter ? 'rgba(236,140,23,0.12)' : '#f5f5f5',
                                                border: 'none',
                                                borderRadius: '50%', cursor: 'pointer',
                                                width: 34, height: 34,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.18s ease',
                                                position: 'relative',
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showGraphFilter ? '#EC8C17' : '#999'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="4" y1="6" x2="20" y2="6" />
                                                <line x1="8" y1="12" x2="16" y2="12" />
                                                <line x1="11" y1="18" x2="13" y2="18" />
                                            </svg>
                                            {(showIncome || showExpenses || showBalanceHistory) && (
                                                <div style={{
                                                    position: 'absolute', top: 0, right: 0,
                                                    width: 7, height: 7, borderRadius: '50%',
                                                    background: '#EC8C17', border: '1.5px solid #fff',
                                                }} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* Balance update status — inline with orange dot accent */}
                            {dbLoaded && (() => {
                                const noHistory = !balanceHistory.length
                                const recordedDate = noHistory ? null : balanceHistory[0].recorded_date
                                const today = toLocalDate(new Date())
                                const days = noHistory ? -1 : daysBetween(recordedDate, today)
                                const isStale = days > 0
                                if (days === 0) return null
                                return (
                                    <div
                                        onClick={openFabBalance}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            margin: '6px 0 0',
                                            background: 'rgba(241,169,80,0.08)',
                                            borderRadius: 20, padding: '4px 12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: '#f1a950',
                                            flexShrink: 0,
                                        }} />
                                        <span style={{
                                            fontSize: 10, fontWeight: 600,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#bbb',
                                            letterSpacing: 0.1,
                                        }}>
                                            {noHistory
                                                ? <>No balance recorded<span style={{ color: '#ccc', margin: '0 4px', fontWeight: 800 }}>·</span><span style={{ color: '#147b75', fontWeight: 700 }}>tap to add</span></>
                                                : days === 1
                                                    ? <>Updated <span style={{ fontWeight: 700, color: '#f1a950' }}>yesterday</span><span style={{ color: '#ccc', margin: '0 4px', fontWeight: 800 }}>·</span><span style={{ color: '#147b75', fontWeight: 700 }}>tap to update</span></>
                                                    : <>Updated <span style={{ fontWeight: 700, color: '#f1a950' }}>{new Date(recordedDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><span style={{ color: '#ccc', margin: '0 4px', fontWeight: 800 }}>·</span><span style={{ color: '#147b75', fontWeight: 700 }}>tap to update</span></>
                                            }
                                        </span>
                                    </div>
                                )
                            })()}
                        </div>

                        <div style={{ position: 'relative', opacity: showInitialBalancePopup ? 0.35 : 1, pointerEvents: showInitialBalancePopup ? 'none' : 'auto' }}>
                            {(!dbLoaded || !graphSettled) && (
                                <div style={{
                                    position: 'absolute', inset: 0, zIndex: 50,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: '#fff',
                                    borderRadius: 8,
                                    opacity: graphSettled && dbLoaded ? 0 : 1,
                                    transition: 'opacity 0.3s ease',
                                    pointerEvents: graphSettled && dbLoaded ? 'none' : 'auto',
                                }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: '50%',
                                        border: '2.5px solid #e8e8e8', borderTopColor: '#147b75',
                                        animation: 'spin 0.7s linear infinite',
                                    }} />
                                </div>
                            )}
                            <TermGraph
                                key={graphKey}
                                graphHeight={graphHeight}
                                graphHeightRef={graphContainerRef}
                                marginTop={0}
                                collapsed={graphCollapsed || graphCovered}
                                terms={terms}
                                expandedTerm={termPopup?.term?.id}
                                balance={projectionBalance || undefined}
                                balanceAnchorDate={anchorDate}
                                balanceStartDate={getGraphStart()}
                                actualBalance={balanceNum}
                                overdraft={showOverdraft ? overdraftNum : undefined}
                                onOverdraftClick={handleOverdraftClick}
                                events={events}
                                allEvents={allEvents}
                                weeklySpendRate={parseMoney(formData.weeklySpend)}
                                hiddenEventTypes={[
                                    ...(!showIncome ? [...INCOME_CATEGORIES.map(c => c.id), 'oneOffIncome', ...(formData.flexIncomeSources || [])] : []),
                                    ...(!showExpenses ? [...EXPENSE_CATEGORIES.map(c => c.id), 'weeklySpend', 'oneOffExpense', ...(formData.flexExpenseSources || [])] : []),
                                    // Per-source eye/hide toggles (regular + flex)
                                    ...[...hiddenSources].flatMap(id => {
                                        const allMaps = { ...incomeEditTypeMap, ...expenseEditTypeMap }
                                        // Flex sources use their ID directly as editType
                                        if (id.startsWith('flex_')) return [id]
                                        return allMaps[id] || []
                                    }),
                                ].filter(t => {
                                    if (activeSourceEditTypes.has(t)) return false
                                    if (activeTab === 'income' && t === 'oneOffIncome') return false
                                    if (activeTab === 'expenses' && t === 'oneOffExpense') return false
                                    if (goalsVisibleEditTypes.has(t)) return false
                                    return true
                                })}
                                removedHiddenTypes={[
                                    ...(!showIncome ? [...INCOME_CATEGORIES.map(c => c.id), 'oneOffIncome', ...(formData.flexIncomeSources || [])] : []),
                                    ...(!showExpenses ? [...EXPENSE_CATEGORIES.map(c => c.id), 'weeklySpend', 'oneOffExpense', ...(formData.flexExpenseSources || [])] : []),
                                    ...[...hiddenSources].flatMap(id => {
                                        const allMaps = { ...incomeEditTypeMap, ...expenseEditTypeMap }
                                        if (id.startsWith('flex_')) return [id]
                                        return allMaps[id] || []
                                    }),
                                ]}
                                balanceHiddenTypes={[...hiddenSources].flatMap(id => {
                                    if (id.startsWith('flex_')) return [id]
                                    const allMaps = { ...incomeEditTypeMap, ...expenseEditTypeMap }
                                    return allMaps[id] || []
                                })}
                                currentEventType={currentEventType}
                                currentEventLabel={null}
                                onTermClick={(termId, pos) => {
                                    if (termPopup?.term?.id === termId) {
                                        setTermPopup(null)
                                    } else {
                                        const term = terms.find(t => t.id === termId)
                                        if (term && pos) setTermPopup({ term, clickX: pos.clickX, clickY: pos.clickY })
                                    }
                                }}
                                onEventClick={handleEventClick}
                                activeEventDot={editingEvent}
                                balanceHistory={balanceHistory}
                                showBalanceHistory={showBalanceHistory}
                                onZeroDate={setGraphZeroDate}
                                onOverdraftBreachDate={setGraphOverdraftDate}
                                showHolidays={showHolidays}
                                showDateMarker={showDateMarker}
                                onZoomChange={(zoomed) => {
                                    setGraphIsZoomed(zoomed)
                                    if (zoomed) analytics.track(DASHBOARD_EVENTS.GRAPH_ZOOMED)
                                }}
                                zoomOutRef={zoomOutRef}
                                footer={<div ref={footerRef} style={{ height: 0 }} />}
                            />
                        </div>
                    </div>{/* end graph card */}

                    {/* Small white spacer above draggable */}
                    <div style={{ height: 2, background: '#fff', flexShrink: 0 }} />

                    {/* Tabs — inside sticky header so they stick */}
                    <div ref={tabsBarRef} style={{
                        background: '#f5f7f7',
                        borderRadius: '36px 36px 0 0',
                        padding: '0 14px 8px',
                        borderTop: 'none',
                        boxShadow: '0 -1px 2px rgba(0,0,0,0.08)',
                        transform: 'translateZ(0)',
                        backfaceVisibility: 'hidden',
                    }}>
                        {/* Drag handle line */}
                        <div
                            onPointerDown={onHandlePointerDown}
                            style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px', cursor: 'pointer', touchAction: 'none' }}
                        >
                            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ccc' }} />
                        </div>
                        <div ref={cardDetailsRef} onPointerDown={onHandlePointerDown} style={{
                            touchAction: 'none',
                            opacity: showInitialBalancePopup ? 0.35 : 1,
                            pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                        }}>
                            {(() => {
                                const tabs = [
                                    { key: 'expenses', label: 'Expenses', Icon: PiTrendDown, ActiveIcon: PiTrendDownBold },
                                    { key: 'goals', label: 'Insights', Icon: PiLightbulb, ActiveIcon: PiLightbulbFill },
                                    { key: 'income', label: 'Income', Icon: PiTrendUp, ActiveIcon: PiTrendUpBold },
                                ]
                                const activeIndex = tabs.findIndex(t => t.key === activeTab)
                                return (
                                    <div style={{
                                        display: 'flex', width: '100%', position: 'relative',
                                        background: 'rgba(0,0,0,0.04)', borderRadius: 50, padding: 3,
                                        transform: 'translateZ(0)',
                                    }}>
                                        <div style={{
                                            position: 'absolute', top: 3, bottom: 3,
                                            left: `calc(${(activeIndex / 3) * 100}% + 3px)`,
                                            width: `calc(${100 / 3}% - 4px)`,
                                            background: '#147b75', borderRadius: 50,
                                            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 3px rgba(20,123,117,0.25)',
                                        }} />
                                        {tabs.map(tab => {
                                            const isActive = activeTab === tab.key
                                            return (
                                                <div
                                                    key={tab.key}
                                                    onClick={() => handleTabChange(tab.key)}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: '7px 0', borderRadius: 50, cursor: 'pointer',
                                                        position: 'relative', zIndex: 1,
                                                        color: isActive ? '#fff' : '#1a1a1a',
                                                        transition: isActive ? 'color 0.1s ease 0.1s' : 'color 0.1s ease',
                                                        willChange: 'color',
                                                    }}
                                                >
                                                    <tab.Icon size={15} style={{ flexShrink: 0, width: 15, height: 15 }} />
                                                    <span style={{
                                                        fontSize: 14, fontWeight: 700,
                                                        fontFamily: 'Nunito, sans-serif', marginLeft: 5,
                                                    }}>{tab.label}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                        </div>
                    </div>{/* end handle area */}
                </div>{/* end sticky header */}

                {/* Content below */}
                <div ref={contentWrapRef} style={{
                    minHeight: '100vh',
                    background: '#f5f7f7',
                    opacity: showInitialBalancePopup ? 0.35 : 1,
                    pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                }}>
                    <div style={{
                        background: '#f5f7f7',
                        padding: '8px 16px 16px',
                        minHeight: '50vh',
                    }}>

                        {(activeTab === 'income' || activeTab === 'expenses') && (<div style={{ paddingBottom: 40 }}>
                            {/* === INCOME TAB CONTENT === */}
                            {activeTab === 'income' && (<>
                                {/* Income Overview summary card */}
                                {(() => {
                                    const inc = Math.round(yearlyIncome * freqMultiplier[freqView]) || 0
                                    const exp = Math.round((yearlyExpense + weeklySpendTotal) * freqMultiplier[freqView]) || 0
                                    const total = inc + exp
                                    const incPct = total > 0 ? (inc / total) * 100 : 50
                                    return (
                                        <div style={{ padding: '16px 16px', background: '#fff', borderRadius: 14, marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: 0 }}>
                                                    Income Overview
                                                </p>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                    color: '#147b75',
                                                }}>
                                                    {getCurrencySymbol()}{inc.toLocaleString()}{freqSuffix[freqView]}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>Income</span>
                                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Expenses</span>
                                            </div>
                                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' }}>
                                                <div style={{ width: `${incPct}%`, background: '#147b75', borderRadius: '4px 0 0 4px', transition: 'width 0.4s ease' }} />
                                                <div style={{ flex: 1, background: '#e06470', borderRadius: '0 4px 4px 0' }} />
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Empty state when no income sources */}
                                {incomeEmpty && (
                                    <div style={{ textAlign: 'center', padding: '16px 40px' }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                            No income sources yet
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb' }}>
                                            Tap + to add
                                        </p>
                                    </div>
                                )}

                                {/* Income Section */}
                                {(INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).length > 0 || addingSourceType === 'income' || collapsingSections.has('income')) && (
                                    <div data-section="income" style={{
                                        margin: collapsingSections.has('income') ? '0' : '0 0 10px',
                                        overflow: collapsingSections.has('income') ? 'hidden' : 'visible',
                                        maxHeight: collapsingSections.has('income') ? 0 : undefined,
                                        opacity: collapsingSections.has('income') ? 0 : 1,
                                        transition: collapsingSections.has('income')
                                            ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s ease, margin 0.4s ease'
                                            : undefined,
                                    }}>
                                        <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: '0 0 8px', padding: '0 4px' }}>Income</p>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).slice(0, showAllIncome ? undefined : 4).map(source => {
                                                const active = !hiddenSources.has(source.id)
                                                const editTypes = incomeEditTypeMap[source.id] || []
                                                const yearly = getSourceYearly(editTypes)
                                                const visibleAmt = events.filter(e => editTypes.includes(e.editType) && !e.removed && !e.noDot && e.date >= exactGraphStart).reduce((s, e) => s + e.amount, 0)
                                                const removedCount = getSourceRemovedCount(editTypes)
                                                const isExpanded = expandedSources.has(source.id)

                                                return (
                                                    <SourceRow
                                                        key={source.id}
                                                        source={{ ...source, _visibleAmount: visibleAmt }}
                                                        active={active}
                                                        yearlyAmount={yearly}
                                                        removedCount={removedCount}
                                                        onRestoreRemoved={() => restoreSourceEvents(editTypes)}
                                                        overrideCount={getSourceOverrideCount(editTypes)}
                                                        onClearOverrides={() => clearSourceOverrides(editTypes)}
                                                        expanded={isExpanded}
                                                        onToggle={() => toggleSourceVisibility(source.id)}
                                                        onExpandToggle={() => handleExpandToggle(source.id)}
                                                        onDelete={() => deleteSource(source.id, false)}
                                                        scrollContainerRef={scrollRef}
                                                        isTabSwitchingRef={isTabSwitchingRef}
                                                        entryCount={(() => { const cat = CATEGORY_MAP[source.id]; return cat ? (formData[cat.formKey] || []).length : 1 })()}
                                                        formData={formData}
                                                        updateField={updateField}
                                                    >
                                                        {(() => {
                                                            const cat = CATEGORY_MAP[source.id]
                                                            if (!cat) return null
                                                            let entries = formData[cat.formKey] || []
                                                            if (entries.length === 0) {
                                                                const defaultEntry = {
                                                                    id: `${cat.id}_0`,
                                                                    amount: '',
                                                                    frequency: cat.defaultFrequency,
                                                                    nextDate: '',
                                                                    months: [...(cat.defaultMonths || [])],
                                                                    dates: { ...(cat.defaultDates || {}) },
                                                                    instalmentAmounts: {},
                                                                }
                                                                entries = [defaultEntry]
                                                                setTimeout(() => setFormData(prev => prev[cat.formKey]?.length ? prev : { ...prev, [cat.formKey]: [defaultEntry] }), 0)
                                                            }
                                                            const hasMulti = entries.filter(e => parseMoney(e.amount) > 0).length > 1
                                                            const entryTotals = hasMulti ? entries.map(e => dashCalcEntryTotal(e, cat)) : null
                                                            const entryRemovedCounts = hasMulti ? entries.map((e, i) => {
                                                                const et = `${cat.id}:${e.id || i}`
                                                                return allEvents.filter(ev => ev.editType === et && ev.removed && !ev.noDot).length
                                                            }) : null
                                                            const entryOverrideCounts = hasMulti ? entries.map((e, i) => {
                                                                const et = `${cat.id}:${e.id || i}`
                                                                const overrides = formData.amountOverrides || {}
                                                                return Object.keys(overrides).filter(k => {
                                                                    if (!k.startsWith(et + ':')) return false
                                                                    const date = k.slice(et.length + 1)
                                                                    return events.some(ev => ev.editType === et && ev.date === date && !ev.removed)
                                                                }).length
                                                            }) : null
                                                            return (
                                                                <CategoryStep
                                                                    categoryId={cat.id} compact
                                                                    entries={entries}
                                                                    entryTotals={entryTotals}
                                                                    entryRemovedCounts={entryRemovedCounts}
                                                                    entryOverrideCounts={entryOverrideCounts}
                                                                    updateEntries={(val) => setFormData(prev => ({ ...prev, [cat.formKey]: typeof val === 'function' ? val(prev[cat.formKey] || []) : val }))}
                                                                    onVisibleEntryChange={entries.length > 1 ? setVisibleEntryIndex : null}
                                                                    onDeleteEntry={({ label, entryId }) => {
                                                                        const prevFormData = { ...formData }
                                                                        if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current)
                                                                        setSkipToast({ label, undoFn: () => setFormData(prevFormData), sourceId: source.id, entryId })
                                                                        skipToastTimerRef.current = setTimeout(() => setSkipToast(null), 5000)
                                                                    }}
                                                                    onClearEntryEvents={(entryId) => {
                                                                        const prefix = `${cat.id}:${entryId}:`
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            removedEvents: (prev.removedEvents || []).filter(k => !k.startsWith(prefix)),
                                                                            amountOverrides: Object.fromEntries(Object.entries(prev.amountOverrides || {}).filter(([k]) => !k.startsWith(prefix))),
                                                                        }))
                                                                    }}
                                                                />
                                                            )
                                                        })()}
                                                    </SourceRow>
                                                )
                                            })}

                                            {/* Add income picker (triggered by FAB) */}
                                            {(() => {
                                                const pickerOptions = FIXED_INCOME_SOURCES.filter(s => !isSourceVisible(s.id, formData.incomeSources))
                                                return (
                                                    <div style={{ position: 'relative' }}>
                                                        {addingSourceType === 'income' && (<>
                                                            <div onClick={closeAddPicker} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                                                            <div style={{
                                                                marginTop: 6, borderRadius: 10, border: '1px solid #f0f0f0',
                                                                background: '#fff', overflow: 'hidden',
                                                                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                                                position: 'relative', zIndex: 51,
                                                                animation: pickerClosing ? 'pickerSlideUp 0.2s ease forwards' : 'pickerSlideDown 0.25s ease',
                                                            }}>
                                                                {pickerOptions.map(source => (
                                                                    <button
                                                                        key={source.id}
                                                                        onClick={() => addSource(source.id, false)}
                                                                        style={{
                                                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                                                            padding: '11px 14px', border: 'none', borderBottom: '1px solid #f5f5f5',
                                                                            background: 'none', cursor: 'pointer', textAlign: 'left',
                                                                        }}
                                                                    >
                                                                        {(() => {
                                                                            const si = SOURCE_ICONS[source.id]
                                                                            if (si) { const { Icon: SI, color } = si; return <SI size={20} color={color} /> }
                                                                            return <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                        })()}
                                                                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                            {source.label}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>)}
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>)}

                            </>)}
                            {/* === END INCOME TAB CONTENT === */}

                            {/* === EXPENSES TAB CONTENT === */}
                            {activeTab === 'expenses' && (<>
                                {/* Expense Overview summary card */}
                                {(() => {
                                    const inc = Math.round(yearlyIncome * freqMultiplier[freqView]) || 0
                                    const exp = Math.round((yearlyExpense + weeklySpendTotal) * freqMultiplier[freqView]) || 0
                                    const total = inc + exp
                                    const incPct = total > 0 ? (inc / total) * 100 : 50
                                    return (
                                        <div style={{ padding: '16px 16px', background: '#fff', borderRadius: 14, marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: 0 }}>
                                                    Expense Overview
                                                </p>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                    color: '#e06470',
                                                }}>
                                                    {getCurrencySymbol()}{exp.toLocaleString()}{freqSuffix[freqView]}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>Income</span>
                                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Expenses</span>
                                            </div>
                                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' }}>
                                                <div style={{ width: `${incPct}%`, background: '#147b75', borderRadius: '4px 0 0 4px', transition: 'width 0.4s ease' }} />
                                                <div style={{ flex: 1, background: '#e06470', borderRadius: '0 4px 4px 0' }} />
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Weekly Spend Card */}
                                <div style={{
                                    padding: '14px 16px 8px', background: '#fff', borderRadius: 14, marginBottom: 10,
                                }}>
                                    <div style={{ padding: '0 0 12px' }}>
                                        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                                            Weekly Spend
                                        </span>
                                    </div>
                                    <WeeklySpendStep compact
                                        weeklySpend={formData.weeklySpend}
                                        updateWeeklySpend={(val) => updateField('weeklySpend', val)}
                                        weeklySpendNonTerm={formData.weeklySpendNonTerm}
                                        updateWeeklySpendNonTerm={(val) => updateField('weeklySpendNonTerm', val)}
                                        weeklySpendVariesByTerm={formData.weeklySpendVariesByTerm}
                                        updateWeeklySpendVariesByTerm={(val) => updateField('weeklySpendVariesByTerm', val)}
                                    />
                                </div>

                                {/* Empty state when no expense sources */}
                                {expenseEmpty && (
                                    <div style={{ textAlign: 'center', padding: '16px 40px' }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                            No expense sources yet
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb' }}>
                                            Tap + to add
                                        </p>
                                    </div>
                                )}

                                {/* Expenses Section */}
                                {(EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).length > 0 || addingSourceType === 'expense' || collapsingSections.has('expenses')) && (
                                    <div data-section="expenses" style={{
                                        margin: collapsingSections.has('expenses') ? '0' : '0 0 10px',
                                        overflow: collapsingSections.has('expenses') ? 'hidden' : 'visible',
                                        maxHeight: collapsingSections.has('expenses') ? 0 : undefined,
                                        opacity: collapsingSections.has('expenses') ? 0 : 1,
                                        transition: collapsingSections.has('expenses')
                                            ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s ease, margin 0.4s ease'
                                            : undefined,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                                            <span style={{
                                                fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a',
                                            }}>Expenses</span>
                                            {EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).length > 4 && (
                                                <span
                                                    onClick={() => setShowAllExpenses(p => !p)}
                                                    style={{
                                                        fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470',
                                                        cursor: 'pointer',
                                                    }}
                                                >{showAllExpenses ? 'Show less' : 'See all'}</span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).slice(0, showAllExpenses ? undefined : 4).map(source => {
                                                const active = !hiddenSources.has(source.id)
                                                const editTypes = expenseEditTypeMap[source.id] || []
                                                const yearly = getSourceYearly(editTypes)
                                                const visibleAmt = events.filter(e => editTypes.includes(e.editType) && !e.removed && !e.noDot && e.date >= exactGraphStart).reduce((s, e) => s + e.amount, 0)
                                                const removedCount = getSourceRemovedCount(editTypes)

                                                return (
                                                    <SourceRow
                                                        key={source.id}
                                                        source={{ ...source, _visibleAmount: visibleAmt }}
                                                        active={active}
                                                        yearlyAmount={yearly}
                                                        removedCount={removedCount}
                                                        onRestoreRemoved={() => restoreSourceEvents(editTypes)}
                                                        overrideCount={getSourceOverrideCount(editTypes)}
                                                        onClearOverrides={() => clearSourceOverrides(editTypes)}
                                                        isExpense
                                                        expanded={expandedSources.has(source.id)}
                                                        onToggle={() => toggleSourceVisibility(source.id)}
                                                        onExpandToggle={() => handleExpandToggle(source.id)}
                                                        onDelete={() => deleteSource(source.id, true)}
                                                        scrollContainerRef={scrollRef}
                                                        isTabSwitchingRef={isTabSwitchingRef}
                                                        entryCount={(() => { const cat = CATEGORY_MAP[source.id]; return cat ? (formData[cat.formKey] || []).length : 1 })()}
                                                        formData={formData}
                                                        updateField={updateField}
                                                    >
                                                        {(() => {
                                                            const cat = CATEGORY_MAP[source.id]
                                                            if (!cat) return null
                                                            let entries = formData[cat.formKey] || []
                                                            if (entries.length === 0) {
                                                                const defaultEntry = {
                                                                    id: `${cat.id}_0`,
                                                                    amount: '',
                                                                    frequency: cat.defaultFrequency,
                                                                    nextDate: '',
                                                                    months: [...(cat.defaultMonths || [])],
                                                                    dates: { ...(cat.defaultDates || {}) },
                                                                    instalmentAmounts: {},
                                                                }
                                                                entries = [defaultEntry]
                                                                setTimeout(() => setFormData(prev => prev[cat.formKey]?.length ? prev : { ...prev, [cat.formKey]: [defaultEntry] }), 0)
                                                            }
                                                            const hasMulti = entries.filter(e => parseMoney(e.amount) > 0).length > 1
                                                            const entryTotals = hasMulti ? entries.map(e => dashCalcEntryTotal(e, cat)) : null
                                                            const entryRemovedCounts = hasMulti ? entries.map((e, i) => {
                                                                const et = `${cat.id}:${e.id || i}`
                                                                return allEvents.filter(ev => ev.editType === et && ev.removed && !ev.noDot).length
                                                            }) : null
                                                            const entryOverrideCounts = hasMulti ? entries.map((e, i) => {
                                                                const et = `${cat.id}:${e.id || i}`
                                                                const overrides = formData.amountOverrides || {}
                                                                return Object.keys(overrides).filter(k => {
                                                                    if (!k.startsWith(et + ':')) return false
                                                                    const date = k.slice(et.length + 1)
                                                                    return events.some(ev => ev.editType === et && ev.date === date && !ev.removed)
                                                                }).length
                                                            }) : null
                                                            return (
                                                                <CategoryStep
                                                                    categoryId={cat.id} compact
                                                                    entries={entries}
                                                                    entryTotals={entryTotals}
                                                                    entryRemovedCounts={entryRemovedCounts}
                                                                    entryOverrideCounts={entryOverrideCounts}
                                                                    updateEntries={(val) => setFormData(prev => ({ ...prev, [cat.formKey]: typeof val === 'function' ? val(prev[cat.formKey] || []) : val }))}
                                                                    onVisibleEntryChange={entries.length > 1 ? setVisibleEntryIndex : null}
                                                                    onDeleteEntry={({ label, entryId }) => {
                                                                        const prevFormData = { ...formData }
                                                                        if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current)
                                                                        setSkipToast({ label, undoFn: () => setFormData(prevFormData), sourceId: source.id, entryId })
                                                                        skipToastTimerRef.current = setTimeout(() => setSkipToast(null), 5000)
                                                                    }}
                                                                    onClearEntryEvents={(entryId) => {
                                                                        const prefix = `${cat.id}:${entryId}:`
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            removedEvents: (prev.removedEvents || []).filter(k => !k.startsWith(prefix)),
                                                                            amountOverrides: Object.fromEntries(Object.entries(prev.amountOverrides || {}).filter(([k]) => !k.startsWith(prefix))),
                                                                        }))
                                                                    }}
                                                                />
                                                            )
                                                        })()}
                                                    </SourceRow>
                                                )
                                            })}

                                            {/* Add expense picker (triggered by FAB) */}
                                            {(() => {
                                                const pickerOptions = FIXED_EXPENSE_SOURCES.filter(s => !isSourceVisible(s.id, formData.expenseSources))
                                                return (
                                                    <div style={{ position: 'relative' }}>
                                                        {addingSourceType === 'expense' && (<>
                                                            <div onClick={closeAddPicker} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                                                            <div style={{
                                                                marginTop: 6, borderRadius: 10, border: '1px solid #f0f0f0',
                                                                background: '#fff', overflow: 'hidden',
                                                                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                                                position: 'relative', zIndex: 51,
                                                                animation: pickerClosing ? 'pickerSlideUp 0.2s ease forwards' : 'pickerSlideDown 0.25s ease',
                                                            }}>
                                                                {pickerOptions.map(source => (
                                                                    <button
                                                                        key={source.id}
                                                                        onClick={() => addSource(source.id, true)}
                                                                        style={{
                                                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                                                            padding: '11px 14px', border: 'none', borderBottom: '1px solid #f5f5f5',
                                                                            background: 'none', cursor: 'pointer', textAlign: 'left',
                                                                        }}
                                                                    >
                                                                        {(() => {
                                                                            const si = SOURCE_ICONS[source.id]
                                                                            if (si) { const { Icon: SI, color } = si; return <SI size={20} color={color} /> }
                                                                            return <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                        })()}
                                                                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                            {source.label}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>)}
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>)}

                            </>)}
                            {/* === END EXPENSES TAB === */}

                        </div>
                        )}

                        {activeTab === 'goals' && !dbLoaded && (
                            <div style={{ padding: '0' }}>
                                <style>{`@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }`}</style>
                                {/* Am I On Track skeleton */}
                                <div style={{ background: '#fff', borderRadius: 14, padding: '16px 16px', marginBottom: 10 }}>
                                    <div style={{ width: 140, height: 16, borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 12 }} />
                                    <div style={{ width: '60%', height: 12, borderRadius: 6, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 16 }} />
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <div style={{ width: 120, height: 36, borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                        <div style={{ width: 90, height: 32, borderRadius: 24, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                    </div>
                                    <div style={{ width: '100%', height: 12, borderRadius: 6, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 12 }} />
                                    <div style={{ width: '100%', height: 20, borderRadius: 10, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                </div>
                            </div>
                        )}
                        {activeTab === 'goals' && dbLoaded && (() => {
                            const sym = getCurrencySymbol()
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const todayStr = toLocalDate(today)

                            const graphStart = getGraphStart()
                            const sortedEvents = [...events].filter(e => !e.removed).sort((a, b) => a.date.localeCompare(b.date))
                            // Only count events from signup date onward (pre-signup recurring events
                            // are already reflected in the entered balance)
                            const futureEvts = sortedEvents.filter(e => e.date >= todayStr && e.date >= graphStart)

                            // End-of-year projected balance (from current balance through future events only)
                            let endOfYearBal = projectionBalance
                            for (const evt of futureEvts) {
                                if (evt.editType === 'weeklySpend') endOfYearBal -= evt.amount
                                else endOfYearBal += evt.type === 'income' ? evt.amount : -evt.amount
                            }

                            // End-of-term projected balance
                            const currentTerm = terms.find(t => todayStr >= t.start && todayStr <= t.end)
                            const nextTerm = terms.find(t => t.start > todayStr)
                            const targetTerm = currentTerm || nextTerm
                            let endOfTermBal = null
                            if (targetTerm) {
                                endOfTermBal = projectionBalance
                                const termEndEvts = futureEvts.filter(e => e.date <= targetTerm.end)
                                for (const evt of termEndEvts) {
                                    if (evt.editType === 'weeklySpend') endOfTermBal -= evt.amount
                                    else endOfTermBal += evt.type === 'income' ? evt.amount : -evt.amount
                                }
                            }

                            // Academic year progress based on term days (minus breaks)
                            const countTermDays = (startStr, endStr) => {
                                let total = 0
                                for (const t of terms) {
                                    const tStart = t.start > startStr ? t.start : startStr
                                    const tEnd = t.end < endStr ? t.end : endStr
                                    if (tStart > tEnd) continue
                                    let termDays = daysBetween(tStart, tEnd) + 1
                                    for (const brk of (t.breaks || [])) {
                                        const bStart = brk.start > tStart ? brk.start : tStart
                                        const bEnd = brk.end < tEnd ? brk.end : tEnd
                                        if (bStart <= bEnd) termDays -= daysBetween(bStart, bEnd) + 1
                                    }
                                    total += Math.max(0, termDays)
                                }
                                return total
                            }
                            const lastTerm = terms.length > 0 ? terms[terms.length - 1] : null
                            const firstTerm = terms.length > 0 ? terms[0] : null
                            const ayStartStr = firstTerm ? firstTerm.start : toLocalDate(AY_START)
                            const ayEndStr = lastTerm ? lastTerm.end : toLocalDate(AY_END)
                            const totalTermDays = Math.max(1, countTermDays(ayStartStr, ayEndStr))
                            const termDaysLeft = countTermDays(todayStr, ayEndStr)
                            const termDaysElapsed = totalTermDays - termDaysLeft
                            const yearProgress = Math.min(100, Math.max(0, Math.round((termDaysElapsed / totalTermDays) * 100)))

                            // Upcoming events — always look ahead enough to find events
                            const lookAheadDays = 90
                            const inRange = new Date(today)
                            inRange.setDate(inRange.getDate() + lookAheadDays)
                            const inRangeStr = toLocalDate(inRange)
                            const upcoming = sortedEvents.filter(e => e.date > todayStr && e.date >= graphStart && e.date <= inRangeStr && e.editType !== 'weeklySpend')
                            const weeklySpendIn90 = sortedEvents.filter(e => e.date > todayStr && e.date >= graphStart && e.date <= inRangeStr && e.editType === 'weeklySpend').reduce((s, e) => s + e.amount, 0)
                            const upcomingIncome = upcoming.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
                            const upcomingExpense = upcoming.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0) + weeklySpendIn90

                            // Upcoming payments and income (sorted by date)
                            const upcomingPayments = upcoming.filter(e => e.type === 'expense').sort((a, b) => a.date.localeCompare(b.date))
                            const upcomingIncomeList = upcoming.filter(e => e.type === 'income').sort((a, b) => a.date.localeCompare(b.date))

                            // Income / expense split for donut
                            const totalIn = yearlyIncome
                            const totalOut = yearlyExpense + weeklySpendTotal
                            const surplus = totalIn - totalOut

                            const cardStyle = {
                                padding: '16px 16px',
                                background: '#fff', borderRadius: 14,
                                marginBottom: 10,
                            }
                            const cardTitle = {
                                fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#1a1a1a',
                                margin: '0 0 10px',
                            }
                            const bigNum = {
                                fontSize: 28, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                margin: 0, lineHeight: 1.2,
                            }
                            const subText = {
                                fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                color: '#888', margin: '4px 0 0',
                            }

                            const removeEvent = (evt) => {
                                // One-off items: remove from source array directly (no removedEvents needed)
                                if (evt.editType === 'oneOffIncome' || evt.editType === 'oneOffExpense') {
                                    const dir = evt.editType === 'oneOffIncome' ? 'in' : 'out'
                                    const updated = (formData.oneOffItems || []).filter(item => {
                                        const amt = parseMoney(item.amount)
                                        return !(item.date === evt.date && (item.direction || 'out') === dir && amt === evt.amount)
                                    })
                                    updateField('oneOffItems', updated.length > 0 ? updated : [{ name: '', amount: '', date: '', direction: 'out' }])
                                } else {
                                    const key = `${evt.editType}:${evt.date}`
                                    updateField('removedEvents', [...(formData.removedEvents || []), key])
                                }
                            }

                            const navigateToSource = (evt) => {
                                const et = evt.editType || ''
                                const baseId = et.includes(':') ? et.split(':')[0] : et
                                const entrySuffix = et.includes(':') ? et.split(':').slice(1).join(':') : null
                                const isIncome = evt.type === 'income'
                                const targetTab = isIncome ? 'income' : 'expenses'
                                // Lock current tab scroll before switching — skip save in handleTabChange
                                const scrollEl = scrollRef.current
                                if (scrollEl) tabScrollRef.current[activeTab] = scrollEl.scrollTop
                                tabScrollRef.current[targetTab] = 0
                                skipScrollSaveRef.current = true
                                handleTabChange(targetTab)
                                setTimeout(() => {
                                    if (!expandedSources.has(baseId)) handleExpandToggle(baseId)
                                    setTimeout(() => {
                                        const el = scrollRef.current
                                        if (!el) return
                                        let scrollTarget = null
                                        if (entrySuffix) {
                                            const entryEl = el.querySelector('[data-entry-id="' + entrySuffix + '"]') || el.querySelector('[data-entry-id="' + baseId + '_' + entrySuffix + '"]')
                                            if (entryEl && entryEl.dataset.entryIdx && parseInt(entryEl.dataset.entryIdx) > 0) scrollTarget = entryEl
                                        }
                                        if (!scrollTarget) scrollTarget = el.querySelector('[data-source-id="' + baseId + '"]')
                                        if (scrollTarget) {
                                            const stickyHeader = el.querySelector('[data-sticky-header]')
                                            const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                                            const pos = scrollTarget.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                                            isAnimatingRef.current = true
                                            animateScroll(el, Math.max(0, pos), 400, function () { isAnimatingRef.current = false })
                                        }
                                    }, 30)
                                }, 50)
                            }

                            const renderEventRow = (evt, i, list, color) => (
                                <div key={`${evt.editType}-${evt.date}-${i}`}
                                    onClick={() => navigateToSource(evt)}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 0', borderBottom: i < list.length - 1 ? '1px solid #f5f5f5' : 'none',
                                        cursor: 'pointer',
                                    }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                            {evt.label}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#aaa' }}>
                                            {fmt(evt.date)}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color }}>
                                            {evt.type === 'income' ? '+' : '-'}{sym}{Math.round(evt.amount).toLocaleString()}
                                        </p>
                                        <ChevronRight size={16} color="#ccc" style={{ flexShrink: 0 }} />
                                    </div>
                                </div>
                            )

                            return (
                                <div style={{ padding: '0 0 60px' }} >

                                    {/* Will I run out? */}
                                    {(() => {
                                        const od = overdraftNum || 0
                                        const limit = od > 0 ? -od + 100 : 100
                                        const zeroDate = graphZeroDate
                                        const overdraftDate = graphOverdraftDate
                                        const willRunOut = zeroDate || overdraftDate || projectionBalance <= limit
                                        if (!willRunOut) return null

                                        const targetDate = overdraftDate || zeroDate
                                        const daysUntil = targetDate ? daysBetween(todayStr, targetDate) : 0
                                        const alreadyOut = projectionBalance <= limit

                                        const targetDateFormatted = targetDate
                                            ? new Date(targetDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                                            : ''

                                        const isUoB = (formData.university || '').toLowerCase().includes('bristol')

                                        return (
                                            <div style={{
                                                background: 'linear-gradient(135deg, #c9404f, #a8293a)',
                                                borderRadius: 14, padding: '14px 18px', marginBottom: 10,
                                                color: '#fff', position: 'relative', overflow: 'hidden',
                                            }}>
                                                {/* Decorative circle */}
                                                <div style={{
                                                    position: 'absolute', top: -20, right: -20,
                                                    width: 80, height: 80, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.08)',
                                                }} />
                                                <div style={{
                                                    position: 'absolute', bottom: -30, left: -10,
                                                    width: 60, height: 60, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.05)',
                                                }} />

                                                {/* Header with minimise toggle */}
                                                <div
                                                    onClick={() => setWarningMinimised(m => !m)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}
                                                >
                                                    <AlertTriangle size={20} color="#fff" strokeWidth={2.5} />
                                                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif', flex: 1 }}>
                                                        {alreadyOut ? 'Low balance warning' : 'Running low warning'}
                                                    </p>
                                                    {warningMinimised && (
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                                            background: 'rgba(255,255,255,0.2)', borderRadius: 8,
                                                            padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                                                        }}>
                                                            {alreadyOut ? 'Now' : daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1d' : `${daysUntil}d`}
                                                        </span>
                                                    )}
                                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{
                                                        transform: warningMinimised ? 'rotate(-90deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.25s ease', flexShrink: 0,
                                                    }}>
                                                        <path d="M4.5 7L9 11.5L13.5 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>

                                                {/* Collapsible content */}
                                                <div style={{
                                                    maxHeight: warningMinimised ? 0 : 600,
                                                    opacity: warningMinimised ? 0 : 1,
                                                    overflow: 'hidden',
                                                    transition: 'max-height 0.3s ease, opacity 0.2s ease',
                                                }}>
                                                    <p style={{ margin: '10px 0 12px', fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.92, lineHeight: 1.5 }}>
                                                        {alreadyOut
                                                            ? <>Your balance is already within {sym}100 of {od > 0 ? `your ${sym}${od.toLocaleString()} overdraft limit` : `${sym}0`}.</>
                                                            : <>Your forecast is on track to get within {sym}100 of {od > 0 ? `your ${sym}${od.toLocaleString()} overdraft limit` : `${sym}0`}
                                                                {targetDate && <> in <strong>{daysUntil === 0 ? 'less than a day' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}</strong> on <strong>{targetDateFormatted}</strong></>}.</>
                                                        }
                                                    </p>

                                                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', opacity: 1, lineHeight: 1.5 }}>
                                                        What can you do?
                                                    </p>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                            <span style={{ fontSize: 12, opacity: 0.85 }}>{'\u2022'}</span>
                                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85, lineHeight: 1.5 }}>
                                                                Play around with the graph and your inputs — see what changes make a difference
                                                            </p>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                            <span style={{ fontSize: 12, opacity: 0.85 }}>{'\u2022'}</span>
                                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85, lineHeight: 1.5 }}>
                                                                You might already have a backup plan for situations like this
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85, lineHeight: 1.5 }}>
                                                        {isUoB
                                                            ? <>Your uni is there to help — check out the <strong>Resources</strong> page in the app.</>
                                                            : <>Your uni is there to help — try searching <strong>'Money Advice'</strong> for your university.</>
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Am I on track? — skeleton while API loads */}
                                    {!apiLoaded && (
                                        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 16px', marginBottom: 10 }}>
                                            <style>{`@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }`}</style>
                                            <div style={{ width: 140, height: 16, borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 12 }} />
                                            <div style={{ width: '55%', height: 11, borderRadius: 6, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 16 }} />
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                                <div style={{ width: 120, height: 36, borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                                <div style={{ width: 100, height: 36, borderRadius: 24, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                            </div>
                                            <div style={{ width: '100%', height: 10, borderRadius: 5, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: 10 }} />
                                            <div style={{ width: '100%', height: 20, borderRadius: 10, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                        </div>
                                    )}

                                    {/* Am I on track? */}
                                    {balanceHistory.length > 0 && projectionBalance !== 0 && (() => {
                                        const latestActual = balanceHistory[0]
                                        const actualBal = Number(latestActual.balance)
                                        const forecastBal = projectionBalance
                                        const diff = Math.round((actualBal - forecastBal) * 100) / 100
                                        const absDiff = Math.abs(diff)
                                        const isAhead = diff > 0
                                        const isClose = absDiff < 50
                                        const pct = forecastBal !== 0 ? Math.round((diff / Math.abs(forecastBal)) * 100) : 0
                                        const clampedPct = Math.max(-100, Math.min(100, pct))
                                        const isDanger = clampedPct < -30
                                        const isWarning2 = clampedPct < -10 && clampedPct >= -30
                                        const statusText = isDanger ? 'NEEDS ATTENTION' : isWarning2 ? 'WATCH SPENDING' : 'HEALTHY'
                                        const healthColor = isDanger ? '#e06470' : isWarning2 ? '#EC8C17' : '#147b75'
                                        // Slider position: 0% = -100%, 50% = on track, 100% = +100%
                                        const sliderPos = Math.max(3, Math.min(97, 50 + clampedPct / 2))
                                        // Display percentage (how far off from forecast)
                                        const displayPct = Math.abs(clampedPct)

                                        return (
                                            <div style={cardStyle}>
                                                <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                                                    Am I On Track?
                                                </p>
                                                <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888', lineHeight: 1.4 }}>
                                                    Balance: <strong style={{ color: '#1a1a1a' }}>{sym}{actualBal.toLocaleString()}</strong> · Forecast: <strong style={{ color: '#1a1a1a' }}>{sym}{Math.round(forecastBal).toLocaleString()}</strong>
                                                </p>

                                                {/* Big money difference + status badge */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                                    <p style={{ margin: 0, fontSize: 40, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                        {isAhead ? '+' : isClose ? '' : '\u2212'}{sym}{absDiff.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </p>
                                                    <div style={{
                                                        background: healthColor,
                                                        color: '#fff',
                                                        fontSize: 12, fontWeight: 800,
                                                        fontFamily: 'Nunito, sans-serif',
                                                        padding: '10px 18px',
                                                        borderRadius: 24,
                                                        letterSpacing: 0.5,
                                                    }}>
                                                        {statusText}
                                                    </div>
                                                </div>

                                                <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                                    compared to forecast
                                                </p>

                                                {/* Gradient bar with dot indicator */}
                                                <div style={{ position: 'relative', height: 20, marginBottom: 6 }}>
                                                    <div style={{
                                                        position: 'absolute', inset: 0,
                                                        borderRadius: 10,
                                                        background: 'linear-gradient(to right, #147b75 0%, #147b75 35%, #6db86d 45%, #d4b44a 55%, #EC8C17 70%, #e06470 100%)',
                                                    }} />
                                                    {/* White dot indicator */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: `${sliderPos}%`,
                                                        top: '50%',
                                                        transform: 'translate(-50%, -50%)',
                                                        width: 16, height: 16,
                                                        borderRadius: '50%',
                                                        background: '#fff',
                                                        border: `2.5px solid ${healthColor}`,
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                                                        transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease',
                                                    }} />
                                                </div>

                                                {/* Collapsible explainer */}
                                                <div style={{
                                                    marginTop: 14, borderRadius: 14, padding: '14px 18px',
                                                    background: '#f5f5f5',
                                                    color: '#333', position: 'relative', overflow: 'hidden',
                                                }}>
                                                    <div
                                                        onClick={() => setTrackMinimised(m => !m)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0, cursor: 'pointer', position: 'relative', zIndex: 2 }}
                                                    >
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: 'Nunito, sans-serif', flex: 1, color: '#555' }}>
                                                            What does this mean?
                                                        </p>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: trackMinimised ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}><path d="M6 9l6 6 6-6" /></svg>
                                                    </div>
                                                    <div style={{
                                                        maxHeight: trackMinimised ? 0 : 500,
                                                        opacity: trackMinimised ? 0 : 1,
                                                        overflow: 'hidden',
                                                        transition: 'max-height 0.35s ease, opacity 0.2s ease',
                                                    }}>
                                                        <p style={{ margin: '10px 0 8px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#555', lineHeight: 1.5 }}>
                                                            Your actual balance vs your forecast
                                                        </p>
                                                        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#777', lineHeight: 1.5 }}>
                                                            This is the difference between where you are and where your forecast expected you to be. Some drift is normal — we spread your weekly spend evenly, but real life doesn't work like that!
                                                        </p>
                                                        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#555', lineHeight: 1.5 }}>
                                                            Big difference?
                                                        </p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                                <span style={{ fontSize: 12, color: '#999' }}>{'\u2022'}</span>
                                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#777', lineHeight: 1.5 }}>
                                                                    <strong style={{ color: '#555' }}>Adjust your inputs</strong> — your average spending might need tweaking
                                                                </p>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                                <span style={{ fontSize: 12, color: '#999' }}>{'\u2022'}</span>
                                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#777', lineHeight: 1.5 }}>
                                                                    <strong style={{ color: '#555' }}>Or stay the course</strong> — spend less or earn more over the next few weeks to get back on track
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Not Financial Advice disclaimer */}
                                    <div style={{
                                        background: '#fff', borderRadius: 14, padding: '14px 18px',
                                        marginBottom: 10,
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                    }}>
                                        <div
                                            onClick={() => {
                                                const next = !disclaimerOpen
                                                setDisclaimerOpen(next)
                                                if (!next) localStorage.setItem('budgeup_disclaimer_seen', 'true')
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EC8C17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', flex: 1 }}>
                                                Important: Not Financial Advice
                                            </p>
                                            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: disclaimerOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(.25,1,.5,1)' }}>
                                                <path d="M7 4.5L12 9L7 13.5" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <div style={{
                                            maxHeight: disclaimerOpen ? 400 : 0,
                                            opacity: disclaimerOpen ? 1 : 0,
                                            overflow: 'hidden',
                                            transition: 'max-height 0.35s cubic-bezier(.25,1,.5,1), opacity 0.25s ease',
                                        }}>
                                            <p style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.6 }}>
                                                This app is a tool to help you forecast your future bank balance based on the figures you provide. We provide <strong>guidance</strong>, not <strong>financial advice</strong>.
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>1. We do not recommend specific financial products.</p>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>2. The forecast is a mathematical projection, not a guarantee of your future financial position.</p>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>3. We are not regulated by the FCA.</p>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>4. You should consult a qualified professional before making significant financial decisions.</p>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>5. We are not responsible for financial decisions you make based on these charts.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Spend & Income Breakdown */}
                                    {(() => {
                                        // Group by category using calcEntryTotal (same as dropdown headers)
                                        const incomeGroups = {}
                                        const expenseGroups = {}
                                        for (const cat of INCOME_CATEGORIES) {
                                            if (!(formData.incomeSources || []).includes(cat.id)) continue
                                            const total = (formData[cat.formKey] || []).reduce((s, e) => s + dashCalcEntryTotal(e, cat), 0)
                                            if (total > 0) incomeGroups[cat.label] = total
                                        }
                                        for (const cat of EXPENSE_CATEGORIES) {
                                            if (!(formData.expenseSources || []).includes(cat.id)) continue
                                            const total = (formData[cat.formKey] || []).reduce((s, e) => s + dashCalcEntryTotal(e, cat), 0)
                                            if (total > 0) expenseGroups[cat.label] = total
                                        }
                                        // Add weekly spend
                                        const wkSpend = parseMoney(formData.weeklySpend)
                                        if (wkSpend > 0) expenseGroups['Weekly Spend'] = wkSpend * 52
                                        const expEntries = Object.entries(expenseGroups).sort((a, b) => b[1] - a[1])
                                        const incEntries = Object.entries(incomeGroups).sort((a, b) => b[1] - a[1])
                                        const totalExp = expEntries.reduce((s, [, v]) => s + v, 0)
                                        const totalInc = incEntries.reduce((s, [, v]) => s + v, 0)

                                        const expColors = ['#e06470', '#EC8C17', '#d4b44a', '#8b5cf6', '#3b82a0', '#999']
                                        const incColors = ['#147b75', '#1a9e97', '#5a7c4f', '#3b82a0', '#6366f1', '#999']

                                        const net = totalInc - totalExp
                                        const total = totalInc + totalExp

                                        if (totalInc === 0 && totalExp === 0) return null

                                        // Donut chart: income vs expense with gap between segments
                                        const donutSize = 150
                                        const strokeWidth = 18
                                        const radius = (donutSize - strokeWidth) / 2
                                        const circumference = 2 * Math.PI * radius
                                        const hasIncome = totalInc > 0
                                        const hasExpense = totalExp > 0
                                        const hasBoth = hasIncome && hasExpense
                                        const gap = hasBoth ? 24 : 0
                                        const usable = circumference - (hasBoth ? gap * 2 : 0)
                                        const incLength = hasIncome ? (hasBoth ? (totalInc / total) * usable : circumference) : 0
                                        const expLength = hasExpense ? (hasBoth ? usable - incLength : circumference) : 0

                                        // Background track
                                        const trackColor = '#f0f0f0'

                                        const renderBreakdown = (entries, totalAmt, colors, type) => {
                                            if (totalAmt === 0) return null
                                            const key = type
                                            const showTip = tappedSegment && tappedSegment.type === key
                                            let tipLeft = 50
                                            if (showTip) {
                                                let cum = 0
                                                for (const [label, amt] of entries) {
                                                    const pct = (amt / totalAmt) * 100
                                                    if (label === tappedSegment.label) { tipLeft = cum + pct / 2; break }
                                                    cum += pct
                                                }
                                            }
                                            return (
                                                <>
                                                    <div style={{ position: 'relative', marginBottom: 8 }}>
                                                        {showTip && (
                                                            <div style={{
                                                                position: 'absolute', bottom: '100%', marginBottom: 4,
                                                                ...(tipLeft > 80
                                                                    ? { right: 0 }
                                                                    : tipLeft < 20
                                                                        ? { left: 0 }
                                                                        : { left: `${tipLeft}%`, transform: 'translateX(-50%)' }),
                                                                background: tappedSegment.color, borderRadius: 8, padding: '5px 10px',
                                                                whiteSpace: 'nowrap', zIndex: 1,
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                                animation: 'tipIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                            }}>
                                                                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>
                                                                    {tappedSegment.label}
                                                                </span>
                                                                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>
                                                                    {sym}{Math.round(tappedSegment.amt).toLocaleString()}/yr
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', cursor: 'pointer' }}>
                                                            {entries.map(([label, amt], i) => {
                                                                const color = colors[Math.min(i, colors.length - 1)]
                                                                const isTapped = tappedSegment?.label === label && tappedSegment?.type === key
                                                                return (
                                                                    <div key={label}
                                                                        onClick={() => setTappedSegment(isTapped ? null : { label, amt, color, type: key })}
                                                                        style={{
                                                                            width: `${(amt / totalAmt) * 100}%`,
                                                                            background: color, minWidth: 2,
                                                                        }}
                                                                    />
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                                        {entries.map(([label, amt], i) => {
                                                            const color = colors[Math.min(i, colors.length - 1)]
                                                            const isTapped = tappedSegment?.label === label && tappedSegment?.type === key
                                                            return (
                                                                <div key={label}
                                                                    onClick={() => setTappedSegment(isTapped ? null : { label, amt, color, type: key })}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: isTapped ? '#333' : '#888' }}>
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </>
                                            )
                                        }

                                        return (
                                            <div ref={breakdownRef} style={cardStyle}>
                                                <p style={{ ...cardTitle, margin: '0 0 14px' }}>
                                                    Income & Expenses
                                                </p>
                                                {/* Donut centered */}
                                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                                                    <div style={{ position: 'relative', width: donutSize, height: donutSize }}>
                                                        <svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
                                                            {/* Income arc */}
                                                            {hasIncome && <circle
                                                                cx={donutSize / 2} cy={donutSize / 2} r={radius}
                                                                fill="none" stroke="#147b75"
                                                                strokeWidth={strokeWidth}
                                                                strokeDasharray={`${incLength} ${circumference - incLength}`}
                                                                strokeDashoffset={0}
                                                                strokeLinecap="round"
                                                                transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                                                            />}
                                                            {/* Expense arc */}
                                                            {hasExpense && <circle
                                                                cx={donutSize / 2} cy={donutSize / 2} r={radius}
                                                                fill="none" stroke="#e06470"
                                                                strokeWidth={strokeWidth}
                                                                strokeDasharray={`${expLength} ${circumference - expLength}`}
                                                                strokeDashoffset={-(incLength + gap)}
                                                                strokeLinecap="round"
                                                                transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                                                            />}
                                                        </svg>
                                                        <div style={{
                                                            position: 'absolute', inset: 0,
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: net >= 0 ? '#147b75' : '#e06470', lineHeight: 1 }}>
                                                                {net >= 0 ? '+' : '\u2212'}{sym}{Math.abs(Math.round(net)).toLocaleString()}
                                                            </span>
                                                            <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb', marginTop: 3 }}>net / year</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Income + Expense summary row */}
                                                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                                    {hasIncome && (
                                                        <div style={{ flex: 1, background: 'rgba(20,123,117,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75', textTransform: 'uppercase', letterSpacing: 0.3 }}>Income</p>
                                                            <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                                {sym}{Math.round(totalInc).toLocaleString()}
                                                            </p>
                                                            <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>per year</p>
                                                        </div>
                                                    )}
                                                    {hasExpense && (
                                                        <div style={{ flex: 1, background: 'rgba(224,100,112,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470', textTransform: 'uppercase', letterSpacing: 0.3 }}>Expenses</p>
                                                            <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                                {sym}{Math.round(totalExp).toLocaleString()}
                                                            </p>
                                                            <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>per year</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Income breakdown */}
                                                {incEntries.length > 0 && (
                                                    <div style={{ marginBottom: expEntries.length > 0 ? 14 : 0 }}>
                                                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>Income breakdown</p>
                                                        {renderBreakdown(incEntries, totalInc, incColors, 'income')}
                                                    </div>
                                                )}

                                                {/* Expense breakdown */}
                                                {expEntries.length > 0 && (
                                                    <div>
                                                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Expense breakdown</p>
                                                        {renderBreakdown(expEntries, totalExp, expColors, 'expense')}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {/* Forecast Accuracy */}
                                    {balanceHistory.length >= 2 && (() => {
                                        const sorted = [...balanceHistory]
                                            .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
                                        const byDate = new Map()
                                        for (const bh of sorted) byDate.set(bh.recorded_date, bh)
                                        const unique = [...byDate.values()].filter(bh => bh.recorded_date <= todayStr)
                                        if (unique.length < 2) return null

                                        const allPastEvts = sortedEvents.filter(e => e.date <= todayStr && e.date >= graphStart)
                                        const diffs = unique.map(bh => {
                                            const eventsBetween = allPastEvts.filter(e => e.date > bh.recorded_date)
                                            let predicted = projBal
                                            for (const evt of eventsBetween) {
                                                if (evt.type === 'income') predicted -= evt.amount
                                                else predicted += evt.amount
                                            }
                                            return Number(bh.balance) - predicted
                                        })

                                        const avgDiff = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length)
                                        const latestDiff = Math.round(diffs[diffs.length - 1])
                                        const improving = diffs.length >= 3 && Math.abs(diffs[diffs.length - 1]) < Math.abs(diffs[0])
                                        const isAhead = avgDiff >= 0
                                        const absAvg = Math.abs(avgDiff)
                                        const absLatest = Math.abs(latestDiff)

                                        let message
                                        if (absAvg < 30) {
                                            message = "Your actual balance has closely matched your forecast — your inputs are spot on!"
                                        } else if (isAhead) {
                                            message = `On average, your actual balance has been ${sym}${absAvg} higher than forecast. You're spending less than expected!`
                                        } else {
                                            message = `On average, your actual balance has been ${sym}${absAvg} lower than forecast. You might be spending more than planned.`
                                        }

                                        if (improving && absAvg >= 30) {
                                            message += " The good news: the gap is getting smaller over time."
                                        }

                                        return (
                                            <div style={cardStyle}>
                                                <p style={cardTitle}>Forecast Accuracy</p>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
                                                }}>
                                                    <div style={{
                                                        width: 44, height: 44, borderRadius: 12,
                                                        background: absAvg < 30 ? '#f0faf9' : isAhead ? '#f0faf9' : '#fdf0f1',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        {absAvg < 30
                                                            ? <Check size={20} color="#147b75" strokeWidth={2.5} />
                                                            : isAhead
                                                                ? <TrendingUp size={20} color="#147b75" strokeWidth={2.5} />
                                                                : <TrendingDown size={20} color="#e06470" strokeWidth={2.5} />
                                                        }
                                                    </div>
                                                    <div>
                                                        <p style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: absAvg < 30 ? '#147b75' : isAhead ? '#147b75' : '#e06470' }}>
                                                            {absAvg < 30 ? 'On Track' : <>{isAhead ? '+' : '\u2212'}{sym}{absAvg}</>}
                                                        </p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                                            avg difference from forecast
                                                        </p>
                                                    </div>
                                                </div>
                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#555', lineHeight: 1.5 }}>
                                                    {message}
                                                </p>
                                            </div>
                                        )
                                    })()}

                                    {/* Upcoming Transactions */}
                                    {(() => {
                                        const thirtyDays = new Date(today)
                                        thirtyDays.setDate(thirtyDays.getDate() + 30)
                                        const thirtyStr = toLocalDate(thirtyDays)
                                        const allUpcoming = [...upcomingIncomeList, ...upcomingPayments].sort((a, b) => a.date.localeCompare(b.date))
                                        const shown = goalsShowMore ? allUpcoming : allUpcoming.slice(0, 5)
                                        if (allUpcoming.length === 0) return null
                                        return (
                                            <div style={cardStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    <p style={{ ...cardTitle, margin: 0 }}>Upcoming Transactions</p>
                                                    {allUpcoming.length > 5 && (
                                                        <span onClick={() => setGoalsShowMore(p => !p)} style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75', cursor: 'pointer' }}>
                                                            {goalsShowMore ? 'Show less' : 'Show all'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{
                                                    maxHeight: goalsShowMore ? 250 : undefined,
                                                    overflowY: goalsShowMore ? 'auto' : undefined,
                                                    WebkitOverflowScrolling: 'touch',
                                                }}>
                                                    {shown.map((evt, i) => renderEventRow(evt, i, shown, evt.type === 'income' ? '#147b75' : '#e06470'))}
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Balance Tracking — actual vs predicted */}
                                    {balanceHistory.length > 1 && (() => {
                                        // For each history entry, calculate what predicted balance was on that date
                                        // predicted(date) = today's balance - sum of events between date and today
                                        const sorted = [...balanceHistory]
                                            .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
                                        // Dedupe by date
                                        const byDate = new Map()
                                        for (const bh of sorted) {
                                            byDate.set(bh.recorded_date, bh)
                                        }
                                        const unique = [...byDate.values()]
                                        // Include entries up to and including today
                                        const pastEntries = unique.filter(bh => bh.recorded_date <= todayStr)
                                        if (pastEntries.length === 0) return null

                                        // Green line value at each history date
                                        // Green line is anchored at projBal at today, rewind events to get past values
                                        const allPastEvts = sortedEvents.filter(e => e.date <= todayStr && e.date >= graphStart)
                                        const trackingData = pastEntries.map(bh => {
                                            // Events between this date and today — undo them from projBal
                                            const eventsBetween = allPastEvts.filter(e => e.date > bh.recorded_date)
                                            let predicted = projBal
                                            for (const evt of eventsBetween) {
                                                // Reverse: undo income (subtract), undo expense (add)
                                                if (evt.type === 'income') predicted -= evt.amount
                                                else predicted += evt.amount
                                            }
                                            const actual = Number(bh.balance)
                                            const diff = actual - predicted
                                            return {
                                                date: bh.recorded_date,
                                                actual,
                                                predicted: Math.round(predicted),
                                                diff: Math.round(diff),
                                            }
                                        })

                                        // Show last 5 entries
                                        const recent = trackingData.slice(-5)
                                        // Overall trend: compare most recent diff to earliest diff
                                        const latestDiff = recent[recent.length - 1].diff
                                        const earliestDiff = recent[0].diff
                                        const trendImproving = latestDiff > earliestDiff

                                        return (
                                            <div style={cardStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <p style={{ ...cardTitle, margin: 0 }}>Balance Tracking</p>
                                                    {trackingData.length > 5 && (
                                                        <span onClick={() => setTrackingShowAll(p => !p)} style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75', cursor: 'pointer' }}>
                                                            {trackingShowAll ? 'Show less' : 'Show all'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{ ...subText, margin: '0 0 12px', fontSize: 12 }}>
                                                    Actual balance vs predicted
                                                </p>
                                                <div style={{
                                                    maxHeight: trackingShowAll ? 300 : undefined,
                                                    overflowY: trackingShowAll ? 'auto' : undefined,
                                                    WebkitOverflowScrolling: 'touch',
                                                }}>
                                                    {(trackingShowAll ? trackingData : recent).map((entry, i) => {
                                                        const dateObj = new Date(entry.date + 'T00:00:00')
                                                        const dateLabel = `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-GB', { month: 'short' })}`
                                                        const isAhead = entry.diff >= 0
                                                        return (
                                                            <div key={entry.date} style={{
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                padding: '7px 0',
                                                                borderBottom: i < recent.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                            }}>
                                                                <div>
                                                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                        {dateLabel}
                                                                    </p>
                                                                    <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#aaa' }}>
                                                                        Actual: {sym}{entry.actual.toLocaleString()} · Predicted: {sym}{entry.predicted.toLocaleString()}
                                                                    </p>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                                    color: isAhead ? '#147b75' : '#e06470',
                                                                    whiteSpace: 'nowrap',
                                                                }}>
                                                                    {isAhead ? '+' : '-'}{sym}{Math.abs(entry.diff).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Academic Year Progress */}
                                    <div style={cardStyle}>
                                        <p style={cardTitle}>Academic Year Progress</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <p style={{ ...bigNum, fontSize: 32, color: yearProgress < 33 ? '#e06470' : yearProgress < 66 ? '#EC8C17' : '#147b75' }}>{yearProgress}%</p>
                                            <p style={{ ...subText, margin: 0 }}>{termDaysLeft} term days left</p>
                                        </div>
                                        <div style={{
                                            marginTop: 12, height: 8, borderRadius: 4,
                                            background: '#f0f0f0', overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                height: '100%', borderRadius: 4,
                                                width: `${yearProgress}%`,
                                                background: 'linear-gradient(90deg, #147b75, #1ca69e)',
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                    </div>

                                    {/* Projected Balances */}
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        {endOfTermBal !== null && targetTerm && (
                                            <div style={{ ...cardStyle, flex: 1 }}>
                                                <p style={cardTitle}>End of {currentTerm ? 'Term' : 'Next Term'}</p>
                                                <p style={{ ...bigNum, fontSize: 22, color: endOfTermBal >= 0 ? '#147b75' : '#e06470' }}>
                                                    {endOfTermBal < 0 ? '-' : ''}{sym}{Math.abs(Math.round(endOfTermBal)).toLocaleString()}
                                                </p>
                                                <p style={{ ...subText, fontSize: 11 }}>
                                                    {currentTerm ? `${daysBetween(todayStr, currentTerm.end)} days left` : fmt(targetTerm.end)}
                                                </p>
                                            </div>
                                        )}
                                        <div style={{ ...cardStyle, flex: 1 }}>
                                            <p style={cardTitle}>End of Year</p>
                                            <p style={{ ...bigNum, fontSize: 22, color: endOfYearBal >= 0 ? '#147b75' : '#e06470' }}>
                                                {endOfYearBal < 0 ? '-' : ''}{sym}{Math.abs(Math.round(endOfYearBal)).toLocaleString()}
                                            </p>
                                            <p style={{ ...subText, fontSize: 11 }}>{termDaysLeft} term days left</p>
                                        </div>
                                    </div>

                                </div>
                            )
                        })()}

                        {activeTab === 'variable' && (
                            <div style={{ padding: '0 0 40px' }}>

                                {/* Flexible Spend Overview — commented out */}
                                {false && (() => {
                                    const flexEvents = events.filter(e => !e.removed && (e.editType?.startsWith('flex_') || e.editType === 'oneOffIncome' || e.editType === 'oneOffExpense' || e.editType === 'weeklySpend'))
                                    const flexIn = flexEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
                                    const flexOut = flexEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
                                    const flexNet = flexIn - flexOut
                                    const total = flexIn + flexOut
                                    const inPct = total > 0 ? Math.round((flexIn / total) * 100) : 50
                                    return (
                                        <div style={{ padding: '16px 16px', background: '#fff', borderRadius: 14, marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: 0 }}>
                                                    Flexible Spending Overview
                                                </p>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                    color: flexNet >= 0 ? '#147b75' : '#e06470',
                                                }}>
                                                    {flexNet >= 0 ? '+' : '\u2212'}{getCurrencySymbol()}{Math.abs(Math.round(flexNet)).toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: '#e06470', marginBottom: 10 }}>
                                                <div style={{
                                                    height: '100%', width: `${inPct}%`,
                                                    background: '#147b75',
                                                    transition: 'width 0.4s ease',
                                                }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                    Income {getCurrencySymbol()}{Math.round(flexIn).toLocaleString()}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                    Spend {getCurrencySymbol()}{Math.round(flexOut).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        )}

                        {expandedSources.size > 0 && <div style={{ height: 150 }} />}

                    </div>
                </div>
            </div>

            {/* Event edit popup */}
            {editingEvent && (() => {
                const isIncome = editingEvent.type === 'income'
                const color = isIncome ? '#147b75' : '#e06470'
                // Look up frequency for this event's source
                // Find the correct entry for this event (handles multi-instance like job:0, job:entry_123)
                const findEntry = () => {
                    const et = editingEvent.editType || ''
                    const baseId = et.includes(':') ? et.split(':')[0] : et
                    const entrySuffix = et.includes(':') ? et.split(':')[1] : null
                    const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
                    const cat = allCats.find(c => c.id === baseId)
                    if (!cat) return { cat: null, entry: null }
                    const entries = formData[cat.formKey] || []
                    if (!entrySuffix) return { cat, entry: entries[0] || null }
                    // Match by id or index
                    const byId = entries.find(e => e.id === entrySuffix)
                    if (byId) return { cat, entry: byId }
                    const byIdx = parseInt(entrySuffix)
                    if (!isNaN(byIdx) && entries[byIdx]) return { cat, entry: entries[byIdx] }
                    return { cat, entry: entries[0] || null }
                }
                const { cat: eventCat, entry: eventEntry } = findEntry()
                const eventFreq = (() => {
                    if (eventEntry) return eventEntry.frequency || eventCat?.defaultFrequency || 'monthly'
                    if (!editingEvent.editType) return 'monthly'
                    const freqMap = { family: formData.familyFrequency, work: formData.workFrequency, rent: formData.rentFrequency }
                    return freqMap[editingEvent.editType] || 'monthly'
                })()
                const FREQ_LABEL_MAP = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', yearly: 'Yearly', irregular: 'Per instalment', 'one-off': 'One-off' }
                const displayFreq = (() => {
                    const sf = eventEntry?.scheduleFrequency
                    if (sf && sf !== eventFreq) return sf
                    if (eventFreq === 'yearly') return sf || eventFreq
                    return eventFreq
                })()
                const freqLabel = FREQ_LABEL_MAP[displayFreq] || ''
                const skipLabel = (() => {
                    if (!editingEvent.date) return ''
                    const df = displayFreq
                    if (df === 'weekly') return 'week'
                    if (df === 'fortnightly') return 'fortnight'
                    return new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long' })
                })()
                const handleSave = () => {
                    const val = editAmount.replace(/[^0-9.]/g, '')
                    const parsedAmount = parseFloat(val) || 0
                    if (parsedAmount <= 0) { setEditWarning('Amount must be greater than zero'); return }
                    setEditWarning('')
                    if (editingEvent.editMonth) {
                        // Has editMonth = irregular instalment — save this month's amount
                        const saveCat = eventCat || CATEGORY_MAP[(editingEvent.editType || '').includes(':') ? editingEvent.editType.split(':')[0] : editingEvent.editType]
                        if (saveCat) {
                            const entries = formData[saveCat.formKey] || []
                            const entry = eventEntry || entries[0]
                            const total = entry ? (parseMoney(entry.amount)) : 0
                            const parsedVal = parseFloat(val) || 0
                            if (parsedVal > total) { setEditWarning(`Can't exceed total of ${getCurrencySymbol()}${total.toLocaleString()}`); return }
                            if (parsedVal <= 0) { setEditWarning('Instalment amount must be greater than zero'); return }
                            // Check single instalment before saving
                            const entryMonths = entry?.months || []
                            if (entryMonths.length <= 1 && total > 0 && Math.abs(parsedVal - total) > 0.01) { setEditWarning(`Only 1 instalment — must equal the total (${getCurrencySymbol()}${Math.round(total).toLocaleString()})`); return }
                            setEditWarning('')
                            setFormData(prev => {
                                const entries = prev[saveCat.formKey] || []
                                return {
                                    ...prev, [saveCat.formKey]: entries.map(e => {
                                        const total = parseMoney(e.amount)
                                        const newVal = parseFloat(val) || 0
                                        const otherMonths = (e.months || []).filter(m => m !== editingEvent.editMonth)
                                        const remainder = Math.max(0, total - newVal)
                                        const newInst = { [editingEvent.editMonth]: val }
                                        if (otherMonths.length > 0) {
                                            const perMonth = Math.round(remainder * 100 / otherMonths.length) / 100
                                            const leftover = Math.round((remainder - perMonth * otherMonths.length) * 100)
                                            otherMonths.forEach((m, i) => { newInst[m] = String(Math.round((perMonth + (i < leftover ? 0.01 : 0)) * 100) / 100) })
                                        }
                                        return { ...e, instalmentAmounts: newInst }
                                    })
                                }
                            })
                        }
                    } else {
                        const overrideKey = `${editingEvent.editType}:${editingEvent.date}`
                        const originalAmt = editingEvent.originalAmount != null ? editingEvent.originalAmount : editingEvent.amount
                        // Validate against yearly total if this is a yearly amount paid in sub-frequency
                        if (eventFreq === 'yearly' && eventEntry) {
                            const total = parseMoney(eventEntry.amount)
                            if (parsedAmount > total) { setEditWarning(`Can't exceed yearly total of ${getCurrencySymbol()}${Math.round(total).toLocaleString()}`); return }
                            const currentOverrides = formData.amountOverrides || {}
                            let otherOverridesTotal = 0
                            for (const [k, v] of Object.entries(currentOverrides)) {
                                if (k.startsWith(editingEvent.editType + ':') && k !== overrideKey) {
                                    otherOverridesTotal += parseMoney(v)
                                }
                            }
                            if (otherOverridesTotal + parsedAmount > total) {
                                setEditWarning(`Edited payments total ${getCurrencySymbol()}${Math.round(otherOverridesTotal + parsedAmount).toLocaleString()} — exceeds yearly total of ${getCurrencySymbol()}${Math.round(total).toLocaleString()}`)
                                return
                            }
                        }
                        if (Math.abs(parsedAmount - originalAmt) < 0.01) {
                            // Same as original — remove override if exists
                            const updated = { ...(formData.amountOverrides || {}) }
                            delete updated[overrideKey]
                            updateField('amountOverrides', updated)
                        } else {
                            updateField('amountOverrides', { ...(formData.amountOverrides || {}), [overrideKey]: val })
                        }
                    }
                    analytics.track(DASHBOARD_EVENTS.EVENT_EDITED, { edit_type: editingEvent.editType, event_type: editingEvent.type })
                    setEditingEvent(null)
                }
                const handleSkip = () => {
                    // Save snapshot for undo
                    const prevFormData = { ...formData }
                    const prevRemovedEvents = [...(formData.removedEvents || [])]
                    const eventLabel = editingEvent.label || editingEvent.sublabel
                    const eventDate = editingEvent.date ? new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

                    analytics.track(DASHBOARD_EVENTS.EVENT_SKIPPED, {
                        edit_type: editingEvent.editType,
                        event_type: editingEvent.type,
                        date: editingEvent.date,
                    })
                    if (editingEvent.editType === 'oneOffIncome' || editingEvent.editType === 'oneOffExpense') {
                        const dir = editingEvent.editType === 'oneOffIncome' ? 'in' : 'out'
                        const updated = (formData.oneOffItems || []).filter(item => {
                            const amt = parseMoney(item.amount)
                            return !(item.date === editingEvent.date && (item.direction || 'out') === dir && amt === editingEvent.amount)
                        })
                        updateField('oneOffItems', updated.length > 0 ? updated : [{ name: '', amount: '', date: '', direction: 'out' }])
                    } else if (editingEvent.editType?.startsWith('flex_') && formData.flexSourceData?.[editingEvent.editType]?.frequency === 'one-off') {
                        const srcId = editingEvent.editType
                        setFormData(prev => {
                            const isExp = (prev.flexExpenseSources || []).includes(srcId)
                            const key = isExp ? 'flexExpenseSources' : 'flexIncomeSources'
                            return { ...prev, [key]: (prev[key] || []).filter(s => s !== srcId), flexSourceData: { ...prev.flexSourceData, [srcId]: undefined } }
                        })
                    } else if (editingEvent.editMonth) {
                        // Has editMonth = irregular instalment — remove month and redistribute
                        const baseId = (editingEvent.editType || '').includes(':') ? editingEvent.editType.split(':')[0] : editingEvent.editType
                        const irregCat = CATEGORY_MAP[baseId]
                        if (irregCat) {
                            setFormData(prev => {
                                const entries = prev[irregCat.formKey] || []
                                return {
                                    ...prev, [irregCat.formKey]: entries.map(e => {
                                        const total = parseMoney(e.amount)
                                        const entryFreq = e.frequency || irregCat.defaultFrequency
                                        const isPerInst = entryFreq === 'irregular'
                                        const newMonths = (e.months || []).filter(m => m !== editingEvent.editMonth)
                                        const newDates = { ...(e.dates || {}) }; delete newDates[editingEvent.editMonth]
                                        const newInst = {}
                                        if (isPerInst) {
                                            // Per instalment: keep existing amounts, just remove the month
                                            for (const m of newMonths) {
                                                newInst[m] = e.instalmentAmounts?.[m] || String(total)
                                            }
                                        } else if (newMonths.length > 0 && total > 0) {
                                            // Per year: redistribute yearly total across remaining months
                                            const perMonth = Math.round(total * 100 / newMonths.length) / 100
                                            let remainder = Math.round((total - perMonth * newMonths.length) * 100)
                                            newMonths.forEach((m, i) => {
                                                const extra = i < remainder ? 0.01 : 0
                                                newInst[m] = String(Math.round((perMonth + extra) * 100) / 100)
                                            })
                                        }
                                        return { ...e, months: newMonths, dates: newDates, instalmentAmounts: newInst }
                                    })
                                }
                            })
                        }
                    } else if (displayFreq === 'one-off' || displayFreq === 'yearly' || (eventFreq === 'yearly' && !eventEntry?.scheduleFrequency)) {
                        // One-off or yearly (no schedule): delete the entire entry + source if last
                        if (eventCat) {
                            const et = editingEvent.editType || ''
                            const baseId = et.includes(':') ? et.split(':')[0] : et
                            const entrySuffix = et.includes(':') ? et.split(':')[1] : null
                            const isExp = EXPENSE_CATEGORIES.some(c => c.id === baseId)
                            setFormData(prev => {
                                const entries = prev[eventCat.formKey] || []
                                let filtered
                                if (entrySuffix) {
                                    filtered = entries.filter(e => e.id !== entrySuffix && entries.indexOf(e) !== parseInt(entrySuffix))
                                } else {
                                    filtered = entries.filter(e => e.nextDate !== editingEvent.date)
                                }
                                if (filtered.length === entries.length) filtered = entries.slice(0, -1)
                                const next = { ...prev, [eventCat.formKey]: filtered }
                                if (filtered.length === 0) {
                                    const sourceKey = isExp ? 'expenseSources' : 'incomeSources'
                                    next[sourceKey] = (prev[sourceKey] || []).filter(s => s !== baseId)
                                }
                                return next
                            })
                        }
                    } else {
                        const key = `${editingEvent.editType}:${editingEvent.date}`
                        updateField('removedEvents', [...(formData.removedEvents || []), key])
                    }
                    setEditingEvent(null)
                    // Show undo toast
                    if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current)
                    const baseId = (editingEvent.editType || '').includes(':') ? editingEvent.editType.split(':')[0] : editingEvent.editType
                    const isDelete = displayFreq === 'one-off' || displayFreq === 'yearly' || displayFreq === 'irregular' || eventFreq === 'irregular' || eventFreq === 'one-off'
                    const monthName = editingEvent.date ? new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long' }) : ''
                    const toastLabel = editingEvent.editMonth
                        ? `${eventLabel} – ${editingEvent.editMonth.charAt(0).toUpperCase() + editingEvent.editMonth.slice(1)} deleted`
                        : isDelete
                            ? `${eventLabel} (${eventDate}) deleted`
                            : `${eventLabel} – ${monthName} skipped`
                    setSkipToast({
                        label: toastLabel,
                        undoFn: () => setFormData(prevFormData),
                        sourceId: baseId,
                        entryId: eventEntry?.id,
                    })
                    skipToastTimerRef.current = setTimeout(() => setSkipToast(null), 5000)
                }
                const isLoan = editingEvent.editType === 'loan' && editingEvent.editMonth
                const isBursary = editingEvent.editType === 'bursary' && editingEvent.editMonth
                const canSkip = true
                return (
                    <>
                        <div
                            onClick={() => { setEditingEvent(null); setNearbyEvents([]); setNearbyIdx(0) }}
                            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        />
                        <div style={{
                            position: 'fixed',
                            left: Math.max(8, Math.min(editingEvent.clickX - 135, window.innerWidth - 278)),
                            top: editingEvent.clickY + 18,
                            width: 270,
                            background: '#fff',
                            borderRadius: 14,
                            zIndex: 101,
                            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                            padding: '12px 14px',
                        }}>
                            {/* Close button */}
                            <div
                                onClick={() => { setEditingEvent(null); setNearbyEvents([]); setNearbyIdx(0) }}
                                style={{
                                    position: 'absolute', top: 8, right: 10,
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: '#f0f0f0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', zIndex: 2,
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </div>

                            {/* Nearby event pills */}
                            {nearbyEvents.length > 1 && (
                                <div style={{
                                    display: 'flex', gap: 5, marginBottom: 10,
                                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                                    paddingRight: 40,
                                    maskImage: 'linear-gradient(to right, black calc(100% - 48px), transparent calc(100% - 8px))',
                                    WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 48px), transparent calc(100% - 8px))',
                                }}>
                                    {nearbyEvents.map((ev, idx) => {
                                        const active = idx === nearbyIdx
                                        const evColor = ev.type === 'income' ? '#147b75' : '#e06470'
                                        return (
                                            <button key={`${ev.editType}-${idx}`}
                                                onClick={() => {
                                                    setNearbyIdx(idx)
                                                    setEditingEvent(prev => ({ ...prev, ...ev, removed: !!ev.removed }))
                                                    setEditAmount(String(ev.amount))
                                                }}
                                                style={{
                                                    padding: '4px 10px', borderRadius: 16, border: 'none',
                                                    fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                                    background: active ? evColor : `${evColor}10`,
                                                    color: active ? '#fff' : evColor,
                                                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {ev.label || ev.sublabel}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Header: title + date */}
                            <div style={{ marginBottom: 8, paddingRight: 36 }}>
                                <div
                                    onClick={() => {
                                        const baseId = editingEvent.editType?.includes(':') ? editingEvent.editType.split(':')[0] : editingEvent.editType
                                        const entrySuffix = editingEvent.editType?.includes(':') ? editingEvent.editType.split(':').slice(1).join(':') : null
                                        const isExp = EXPENSE_CATEGORIES.some(c => c.id === baseId)
                                        const targetTab = isExp ? 'expenses' : 'income'
                                        setEditingEvent(null)
                                        setNearbyEvents([])
                                        setNearbyIdx(0)
                                        const scrollEl = scrollRef.current
                                        if (scrollEl) tabScrollRef.current[activeTab] = scrollEl.scrollTop
                                        tabScrollRef.current[targetTab] = 0
                                        skipScrollSaveRef.current = true
                                        handleTabChange(targetTab)
                                        collapseGraph()
                                        setExpandedSources(prev => new Set(prev).add(baseId))
                                        setTimeout(() => {
                                            const el = scrollRef.current
                                            if (!el) return
                                            let scrollTarget = null
                                            if (entrySuffix) {
                                                const entryEl = el.querySelector('[data-entry-id="' + entrySuffix + '"]') || el.querySelector('[data-entry-id="' + baseId + '_' + entrySuffix + '"]')
                                                if (entryEl && entryEl.dataset.entryIdx && parseInt(entryEl.dataset.entryIdx) > 0) scrollTarget = entryEl
                                            }
                                            if (!scrollTarget) scrollTarget = el.querySelector('[data-source-id="' + baseId + '"]')
                                            if (scrollTarget) {
                                                const stickyHeader = el.querySelector('[data-sticky-header]')
                                                const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                                                const pos = scrollTarget.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                                                isAnimatingRef.current = true
                                                animateScroll(el, Math.max(0, pos), 400, function () { isAnimatingRef.current = false })
                                            }
                                        }, 500)
                                    }}
                                    style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#222', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                >
                                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                    {editingEvent.label || editingEvent.sublabel}
                                    <div style={{
                                        width: 16, height: 16, borderRadius: 4,
                                        background: '#f0f0f0',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, marginTop: -1,
                                    }}>
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M7 17l9.2-9.2M17 17V7H7" />
                                        </svg>
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#999', marginTop: 1 }}>
                                    {editingEvent.date ? new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                    {freqLabel ? <> · {(() => {
                                        if (displayFreq === 'monthly') {
                                            const dom = eventEntry?.dayOfMonth || '1'
                                            const suffix = dom === 'last' ? '' : (() => { const d = parseInt(dom); return d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th' })()
                                            return `Monthly on ${dom === 'last' ? 'last day' : `${dom}${suffix}`}`
                                        }
                                        if (displayFreq === 'weekly' || displayFreq === 'fortnightly') {
                                            const day = eventEntry?.dayOfWeek || 'monday'
                                            const dayLabel = day.charAt(0).toUpperCase() + day.slice(1) + 's'
                                            return `${freqLabel} on ${dayLabel}`
                                        }
                                        return freqLabel
                                    })()}</> : ''}
                                </div>
                            </div>

                            {editingEvent.removed ? (
                                <button
                                    onClick={() => {
                                        const key = `${editingEvent.editType}:${editingEvent.date}`
                                        analytics.track(DASHBOARD_EVENTS.EVENT_RESTORED, { edit_type: editingEvent.editType, date: editingEvent.date })
                                        updateField('removedEvents', (formData.removedEvents || []).filter(k => k !== key))
                                        setEditingEvent(null)
                                    }}
                                    style={{
                                        width: '100%', height: 40, border: 'none', borderRadius: 10,
                                        background: color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Restore payment</span>
                                </button>
                            ) : (false /* yearly/one-off handled by skip button label */) ? (
                                <button
                                    onClick={() => { handleSkip() }}
                                    style={{
                                        width: '100%', height: 40, border: 'none', borderRadius: 10,
                                        background: '#e06470',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Delete payment</span>
                                </button>
                            ) : (<>
                                {/* Balance after row — live updated */}
                                {editingEvent.balanceAfter != null && (() => {
                                    const origAmt = editingEvent.amount || 0
                                    const newAmt = parseFloat(editAmount.replace(/[^0-9.]/g, '')) || 0
                                    const diff = editingEvent.type === 'income' ? (newAmt - origAmt) : (origAmt - newAmt)
                                    const liveBalance = editingEvent.balanceAfter + diff
                                    const balColor = liveBalance >= 0 ? '#147b75' : '#e06470'
                                    const balBg = liveBalance >= 0 ? 'rgba(20,123,117,0.06)' : 'rgba(224,100,112,0.06)'
                                    return (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: balBg, borderRadius: 10, padding: '7px 12px', marginBottom: 8,
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>Balance after payment</span>
                                            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: balColor }}>
                                                {liveBalance < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(liveBalance)).toLocaleString()}
                                            </span>
                                        </div>
                                    )
                                })()}
                                {/* Original amount + reset (if edited) */}
                                {editingEvent.hasOverride && (
                                    <div style={{ marginBottom: 8 }}>
                                        <button
                                            onClick={() => {
                                                // Clear all overrides for this editType
                                                const updated = { ...(formData.amountOverrides || {}) }
                                                for (const k of Object.keys(updated)) {
                                                    if (k.startsWith(editingEvent.editType + ':')) delete updated[k]
                                                }
                                                updateField('amountOverrides', updated)
                                                setEditingEvent(null)
                                            }}
                                            style={{
                                                width: '100%', height: 32, background: 'rgba(59,130,246,0.08)', border: 'none', borderRadius: 8,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#3b82f6' }}>Reset all payments to equal</span>
                                        </button>
                                    </div>
                                )}
                                {/* Amount + Save + Skip on one row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {eventFreq === 'irregular' && (
                                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333', flex: 1 }}>
                                            {getCurrencySymbol()}{formatDisplay(editAmount)}
                                        </span>
                                    )}
                                    {eventFreq !== 'irregular' && (<>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', flex: 1, minWidth: 0,
                                            border: '1px solid #e8e8e8', borderRadius: 8,
                                            padding: '0 8px', height: 34, gap: 3, background: '#fff',
                                            overflow: 'hidden',
                                        }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#444', fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>{getCurrencySymbol()}</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDisplay(editAmount)}
                                                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); const parts = v.split('.'); setEditAmount(parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, 2) : v) }}
                                                readOnly
                                                onTouchEnd={(e) => { e.target.readOnly = false; e.target.focus({ preventScroll: true }) }}
                                                onBlur={(e) => { e.target.readOnly = true }}
                                                style={{
                                                    flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                                                    fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                                    color: '#000', outline: 'none', padding: 0,
                                                }}
                                            />
                                        </div>
                                        <button onClick={handleSave} style={{
                                            height: 34, borderRadius: 8, border: 'none',
                                            background: color, padding: '0 12px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', flexShrink: 0,
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Save</span>
                                        </button>
                                    </>)}
                                    {canSkip && (
                                        <button onClick={handleSkip} style={{
                                            height: 34, borderRadius: 8, border: 'none',
                                            background: '#f5f5f5',
                                            padding: '0 16px', flex: eventFreq === 'irregular' ? 1 : undefined,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                {eventFreq === 'irregular' ? 'Delete instalment' : (eventFreq === 'one-off' || displayFreq === 'irregular' || displayFreq === 'yearly' || displayFreq === 'one-off' ? 'Delete' : `Skip ${skipLabel}`)}
                                            </span>
                                        </button>
                                    )}
                                </div>
                                {editWarning && (
                                    <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                        {editWarning}
                                    </p>
                                )}
                            </>)}
                        </div>
                    </>
                )
            })()}

            {/* Term dates popup */}
            {termPopup && (() => {
                const { term, clickX, clickY } = termPopup
                const w = 200
                const left = Math.max(8, Math.min(clickX - w / 2, window.innerWidth - w - 8))
                const top = clickY + 8
                return (
                    <>
                        <div ref={termPopupRef} style={{
                            position: 'fixed', left, top, width: w,
                            background: '#fff', borderRadius: 14, zIndex: 101,
                            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                            padding: '12px 14px',
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#7a8ea8', marginBottom: 6 }}>
                                {term.name}
                            </div>
                            <div style={{ fontSize: 12, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5 }}>
                                {fmt(term.start)} – {fmt(term.end)}
                            </div>
                            {term.breaks && term.breaks.length > 0 && (
                                <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {term.breaks.map((brk, i) => {
                                        const isExamFull = brk.name && /^exams?$/i.test(brk.name.trim())
                                        const isExamPrep = !isExamFull && brk.name && /exam.?prep|revision/i.test(brk.name.trim())
                                        const isReading = brk.name && /reading/i.test(brk.name)
                                        const dotColor = isExamFull ? '#e06470' : isExamPrep ? '#f0a0a8' : isReading ? '#5ab4a0' : '#aaa'
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{
                                                    width: 8, height: 8, borderRadius: '50%',
                                                    background: dotColor, flexShrink: 0,
                                                }} />
                                                <div style={{ fontSize: 11, fontFamily: 'Nunito, sans-serif', color: '#999', lineHeight: 1.3 }}>
                                                    <span style={{ fontWeight: 700, color: '#666' }}>{brk.name || 'Break'}</span>
                                                    <br />
                                                    <span style={{ fontSize: 10 }}>{fmt(brk.start)} – {fmt(brk.end)}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )
            })()}

            {/* Overdraft edit popup */}
            {editingOverdraft && (() => {
                const w = 140
                const left = Math.max(8, Math.min(editingOverdraft.clickX - w / 2, window.innerWidth - w - 8))
                const top = editingOverdraft.clickY + 8
                return (
                    <>
                        <div
                            onClick={() => setEditingOverdraft(null)}
                            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        />
                        <div style={{
                            position: 'fixed',
                            left, top,
                            width: w,
                            background: '#fff',
                            borderRadius: 8,
                            zIndex: 101,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            padding: '5px 4px 4px',
                        }}>
                            <span style={{
                                fontSize: 8, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#999',
                                padding: '0 3px',
                                display: 'block',
                                marginBottom: 3,
                            }}>
                                Overdraft limit
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    background: '#f5f7f7', borderRadius: 5,
                                    padding: '0 6px', height: 24, gap: 2,
                                    width: 76,
                                }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        color: '#aaa', fontFamily: 'Nunito, sans-serif',
                                    }}>{getCurrencySymbol()}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formatDisplay(editOverdraftAmount)}
                                        onChange={(e) => setEditOverdraftAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                        ref={(el) => el && setTimeout(() => el.focus({ preventScroll: true }), 50)}
                                        style={{
                                            flex: 1, border: 'none',
                                            background: 'transparent',
                                            fontSize: 11, fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                            width: 0, minWidth: 0,
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        setShowOverdraft(prev => {
                                            localStorage.setItem('budgeup_show_overdraft', String(!prev))
                                            return !prev
                                        })
                                    }}
                                    style={{
                                        width: 24, height: 24,
                                        border: 'none', borderRadius: 5,
                                        background: showOverdraft ? '#fdf0f1' : '#f5f5f5',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                    }}
                                >
                                    {showOverdraft
                                        ? <Eye size={12} color="#e06470" />
                                        : <EyeOff size={12} color="#aaa" />
                                    }
                                </button>
                                <button
                                    onClick={() => {
                                        const val = editOverdraftAmount.replace(/[^0-9.]/g, '')
                                        updateField('overdraft', val)
                                        analytics.track(DASHBOARD_EVENTS.OVERDRAFT_UPDATED, {
                                            has_overdraft: parseFloat(val) > 0,
                                        })
                                        setEditingOverdraft(null)
                                    }}
                                    style={{
                                        width: 24, height: 24,
                                        border: 'none', borderRadius: 5,
                                        background: '#e06470',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                    }}
                                >
                                    <svg width="10" height="7" viewBox="0 0 14 10" fill="none">
                                        <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </>
                )
            })()}

            {/* Skip undo toast */}
            {skipToast && (
                <div style={{
                    position: 'fixed',
                    bottom: `calc(90px + env(safe-area-inset-bottom, 0px))`,
                    left: 20, right: 20,
                    background: '#1a1a1a', borderRadius: 14,
                    padding: '12px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    zIndex: 200,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#ccc', flex: 1 }}>
                        {skipToast.label}
                    </span>
                    <button
                        onClick={() => {
                            skipToast.undoFn()
                            // Scroll restored item into view — try entry first, fallback to source row
                            if (skipToast.sourceId) {
                                let attempts = 0
                                const tryScroll = () => {
                                    const el = scrollRef.current
                                    if (!el) return
                                    // Try to find the specific entry
                                    let target = skipToast.entryId ? el.querySelector(`[data-entry-id="${skipToast.entryId}"]`) : null
                                    // Fallback to source row
                                    if (!target) target = el.querySelector(`[data-source-id="${skipToast.sourceId}"]`)
                                    if (target && target.offsetHeight > 0) {
                                        const stickyHeader = el.querySelector('[data-sticky-header]')
                                        const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                                        const pos = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                                        el.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' })
                                    } else if (attempts++ < 10) {
                                        setTimeout(tryScroll, 100)
                                    }
                                }
                                setTimeout(tryScroll, 200)
                            }
                            setSkipToast(null)
                            if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current)
                        }}
                        style={{
                            background: '#147b75', border: 'none', cursor: 'pointer',
                            padding: '5px 14px', borderRadius: 8, flexShrink: 0,
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Undo</span>
                    </button>
                    <button
                        onClick={() => { setSkipToast(null); if (skipToastTimerRef.current) clearTimeout(skipToastTimerRef.current) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
            )}

            {/* FAB Balance Update Popup */}
            {fabBalanceOpen && (() => {
                const sym = getCurrencySymbol()
                const lastDate = balanceHistory.length > 0 ? balanceHistory[0].recorded_date : null
                const today = toLocalDate(new Date())
                const isToday = lastDate === today
                return (
                    <>
                        <div data-balance-overlay onClick={() => closeFabBalance()} style={{
                            position: 'fixed', inset: 0, zIndex: 1200,
                            background: 'rgba(0,0,0,0.25)',
                            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                            opacity: fabBalanceClosing ? 0 : 1,
                            transition: 'opacity 0.25s ease',
                        }} />
                        <div data-balance-popup onClick={(e) => e.stopPropagation()} style={{
                            position: 'fixed', top: '15%',
                            left: '50%', transform: 'translateX(-50%)',
                            zIndex: 1201, width: 'calc(100% - 48px)', maxWidth: 320,
                            background: '#fff', borderRadius: 24,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                            padding: '32px 28px 28px',
                            animation: fabBalanceClosing
                                ? 'balanceContractOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                                : 'balanceExpandIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                            transformOrigin: 'center bottom',
                        }}>
                            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#999', textAlign: 'center', letterSpacing: 0.3 }}>
                                {isToday ? 'Updating today\u2019s balance' : `Last recorded ${lastDate ? (() => { const d = daysBetween(lastDate, today); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` })() : 'never'}`}
                            </p>

                            <BalancePillInline
                                value={balanceNum}
                                sym={sym}
                                onSave={(val) => {
                                    const newVal = parseMoney(val)
                                    const today = toLocalDate(new Date())
                                    const lastRecorded = localStorage.getItem('budgeup_balance_last_date')
                                    const isUpdate = lastRecorded === today
                                    if (!originSetRef.current) {
                                        originSetRef.current = true
                                        updateField('balance', val)
                                    }
                                    if (userIdRef.current) {
                                        saveBalanceHistory(userIdRef.current, newVal)
                                    }
                                    analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
                                        balance_range: getBalanceRange(newVal),
                                        is_first_recording: !originSetRef.current,
                                        is_update: isUpdate,
                                        entry_method: 'fab_button',
                                    })
                                    localStorage.setItem('budgeup_balance_last_date', today)
                                    setBalanceHistory(prev => {
                                        const entry = { balance: newVal, recorded_date: today, source: 'manual' }
                                        const existing = prev.findIndex(e => e.recorded_date === today)
                                        if (existing >= 0) {
                                            const updated = [...prev]
                                            updated[existing] = { ...updated[existing], balance: newVal }
                                            return updated
                                        }
                                        return [entry, ...prev]
                                    })
                                    if (balanceNum !== newVal) {
                                        if (balanceToastTimer.current) clearTimeout(balanceToastTimer.current)
                                        setBalanceToast(isUpdate ? 'Updated today\u2019s balance' : 'Recorded balance for today')
                                        balanceToastTimer.current = setTimeout(() => setBalanceToast(null), 2500)
                                    }
                                    closeFabBalance()
                                }}
                                onCancel={closeFabBalance}
                            />
                        </div>
                    </>
                )
            })()}

            {/* Balance toast */}
            {balanceToast && (
                <div style={{
                    position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                    background: '#1a1a1a', color: '#fff',
                    padding: '10px 20px', borderRadius: 12,
                    fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                    zIndex: 1100, whiteSpace: 'nowrap',
                    animation: 'toastIn 0.25s ease',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>
                    {balanceToast}
                </div>
            )}

            {/* Graph filter dropdown — rendered at root to avoid overflow clipping */}
            {showGraphFilter && (() => {
                const rect = graphFilterRef.current?.getBoundingClientRect()
                const items = [
                    { label: 'Expenses', active: showExpenses, color: '#e06470', toggle: () => setShowExpenses(prev => { localStorage.setItem('budgeup_show_expenses', String(!prev)); return !prev }) },
                    { label: 'Income', active: showIncome, color: '#147b75', toggle: () => setShowIncome(prev => { localStorage.setItem('budgeup_show_income', String(!prev)); return !prev }) },
                    ...(overdraftNum ? [{ label: 'Overdraft', active: showOverdraft, color: '#c0392b', toggle: () => setShowOverdraft(prev => { localStorage.setItem('budgeup_show_overdraft', String(!prev)); return !prev }) }] : []),
                    { label: 'Term Dates', active: showHolidays, color: '#7a8ea8', toggle: () => setShowHolidays(prev => { localStorage.setItem('budgeup_show_holidays', String(!prev)); return !prev }) },
                    ...(balanceHistory.length > 0 ? [{ label: 'History', active: showBalanceHistory, color: '#f1a950', dashed: true, toggle: () => { setShowBalanceHistory(prev => { analytics.track(DASHBOARD_EVENTS.BALANCE_HISTORY_TOGGLED, { visible: !prev }); localStorage.setItem('budgeup_show_balance_history', String(!prev)); return !prev }) } }] : []),
                ]
                return (
                    <div ref={graphFilterDropdownRef} style={{
                        position: 'fixed',
                        top: rect ? rect.bottom + 6 : 0,
                        right: rect ? window.innerWidth - rect.right : 0,
                        background: '#fff', borderRadius: 12,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
                        padding: 6, zIndex: 2000,
                        display: 'flex', flexDirection: 'column', gap: 2,
                        transformOrigin: 'top right',
                        animation: graphFilterClosing
                            ? 'filterDropdownOut 0.18s ease forwards'
                            : 'filterDropdownIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}>
                        {items.map((item, i) => (
                            <button
                                key={item.label}
                                onClick={item.toggle}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 14px', borderRadius: 20,
                                    background: item.active ? `${item.color}12` : 'transparent',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'background 0.15s ease, opacity 0.2s ease, transform 0.2s ease',
                                    minWidth: 0,
                                    opacity: graphFilterClosing ? 0 : 1,
                                    transform: graphFilterClosing ? 'translateY(-4px)' : 'translateY(0)',
                                    transitionDelay: graphFilterClosing ? `${(items.length - 1 - i) * 0.02}s` : `${i * 0.03}s`,
                                }}
                            >
                                <div style={{
                                    width: 9, height: 9, borderRadius: '50%',
                                    background: item.dashed ? 'transparent' : (item.active ? item.color : '#ddd'),
                                    border: item.dashed ? `1px dashed ${item.active ? item.color : '#ddd'}` : 'none',
                                    boxSizing: 'border-box',
                                    transition: 'background 0.2s ease, border-color 0.2s ease',
                                    flexShrink: 0,
                                }} />
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: item.active ? '#555' : '#bbb',
                                    transition: 'color 0.15s ease',
                                    letterSpacing: 0.2,
                                }}>{item.label}</span>
                            </button>
                        ))}
                    </div>
                )
            })()}


        </div>
    )
}
